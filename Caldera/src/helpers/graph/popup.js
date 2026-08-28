import { FloatingGraphCommunication } from "./communication.js";
import { FloatingGraphFrame } from "./frame.js";
import { FloatingGraphScene } from "./scene.js";
import { readGraphPopupOptions, requireElement } from "./utilities.js";

const OWNER_CLOSE_POLL_MS = 500;

export class FloatingGraphPopup {
  constructor(mount, { graphId, windowRef = window } = {}) {
    this.mount = requireElement(mount, "floating-graph popup mount");
    this.graphId = graphId;
    this.windowRef = windowRef;
    this.lastRevision = -1;
    this.lifecycleVersion = 0;
    this.operationQueue = Promise.resolve();
    this.ownerCloseTimer = null;
    this.ownerClosingRevision = null;
    this.ownerConnected = this.isOwnerAvailable();
    this.started = false;

    this.mount.classList.add("floating-graph-popup-view");
    this.frame = new FloatingGraphFrame(this.mount, {
      onRedock: () => this.requestRedock(),
      onResize: () => this.scene.resize(),
      role: "popup",
      title: "Floating graph",
      windowRef: this.windowRef,
    });
    this.scene = new FloatingGraphScene(this.frame.stage, {
      onRender: () => this.frame.attachModebar(),
      onViewStateChange: (viewState) => this.sendViewState(viewState),
    });
    this.communication = new FloatingGraphCommunication({
      graphId: this.graphId,
      peerWindow: this.windowRef.opener,
      windowRef: this.windowRef,
    });

    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.unsubscribe = this.communication.subscribe(this.handleMessage);
  }

  start() {
    if (this.started) {
      return this.operationQueue;
    }

    this.started = true;
    this.lifecycleVersion += 1;
    this.ownerConnected = this.isOwnerAvailable();
    if (!this.unsubscribe) {
      this.unsubscribe = this.communication.subscribe(this.handleMessage);
    }
    this.frame.start();
    this.communication.start();
    this.windowRef.addEventListener("beforeunload", this.handleBeforeUnload);
    this.startOwnerCloseTimer();
    this.operationQueue = Promise.resolve(this.scene.start())
      .catch((error) => this.handleRenderError(error));
    this.communication.send("popup-ready");
    return this.operationQueue;
  }

  stop() {
    if (!this.started) {
      return this.operationQueue;
    }

    this.started = false;
    this.lifecycleVersion += 1;
    this.clearOwnerCloseTimer();
    this.windowRef.removeEventListener("beforeunload", this.handleBeforeUnload);
    this.frame.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.communication.stop();
    return this.scene.stop();
  }

  handleMessage(message) {
    switch (message.type) {
      case "owner-ready":
        this.ownerClosingRevision = null;
        this.ownerConnected = true;
        this.enqueue(() => {
          this.frame.setDisconnected(false);
          this.communication.send("snapshot-request");
        });
        break;
      case "snapshot":
        if (
          this.ownerClosingRevision === null
          || message.revision > this.ownerClosingRevision
        ) {
          this.ownerConnected = true;
        }

        this.enqueue(async (isCurrent) => {
          if (message.revision < this.lastRevision) {
            return;
          }

          await this.scene.restoreSnapshot(message.payload.snapshot);

          if (!isCurrent()) {
            return;
          }

          this.lastRevision = message.revision;
          this.frame.setDisconnected(!this.ownerConnected);
          this.frame.setTitle(message.payload.frameTitle ?? "Floating graph");
          this.windowRef.document.title = message.payload.frameTitle
            ?? "Floating graph";
        });
        break;
      case "append":
        this.enqueue(async (isCurrent) => {
          if (message.revision <= this.lastRevision) {
            return;
          }

          if (message.revision !== this.lastRevision + 1) {
            this.communication.send("snapshot-request");
            return;
          }

          await this.scene.appendPoints(message.payload.points);

          if (!isCurrent()) {
            return;
          }

          this.lastRevision = message.revision;
        });
        break;
      case "owner-closing":
        this.ownerClosingRevision = message.revision;
        this.ownerConnected = false;
        this.enqueue(() => this.frame.setDisconnected(true));
        break;
      case "redock":
        this.sendViewState();
        this.windowRef.setTimeout(() => this.windowRef.close(), 0);
        break;
      default:
        break;
    }
  }

  requestRedock() {
    if (!this.ownerConnected) {
      this.frame.setStatus("Owner window is no longer available", { error: true });
      return false;
    }

    this.frame.setStatus("Redocking…");
    return this.communication.send(
      "redock-request",
      { viewState: this.scene.getViewState() },
      { revision: Math.max(this.lastRevision, 0) },
    );
  }

  handleBeforeUnload() {
    this.communication.send(
      "popup-closing",
      { viewState: this.scene.getViewState() },
      { revision: Math.max(this.lastRevision, 0) },
    );
  }

  enqueue(operation) {
    const lifecycleVersion = this.lifecycleVersion;
    const isCurrent = () => (
      this.started && lifecycleVersion === this.lifecycleVersion
    );

    this.operationQueue = this.operationQueue
      .catch(() => undefined)
      .then(() => {
        if (!isCurrent()) {
          return undefined;
        }

        return operation(isCurrent);
      })
      .catch((error) => {
        if (isCurrent()) {
          this.handleRenderError(error);
        }
      });

    return this.operationQueue;
  }

  handleRenderError(error) {
    this.frame.setStatus(error?.message ?? "Graph update failed", { error: true });
    console.error("Floating graph popup update failed.", error);
  }

  sendViewState(viewState = this.scene.getViewState()) {
    return this.communication.send(
      "view-state",
      { viewState },
      { revision: Math.max(this.lastRevision, 0) },
    );
  }

  startOwnerCloseTimer() {
    this.clearOwnerCloseTimer();

    if (!this.windowRef.opener) {
      return;
    }

    this.ownerCloseTimer = this.windowRef.setInterval(() => {
      if (this.isOwnerAvailable()) {
        return;
      }

      this.clearOwnerCloseTimer();
      this.ownerClosingRevision = Number.POSITIVE_INFINITY;
      this.ownerConnected = false;
      this.enqueue(() => this.frame.setDisconnected(true));
    }, OWNER_CLOSE_POLL_MS);
  }

  clearOwnerCloseTimer() {
    if (this.ownerCloseTimer === null) {
      return;
    }

    this.windowRef.clearInterval(this.ownerCloseTimer);
    this.ownerCloseTimer = null;
  }

  isOwnerAvailable() {
    try {
      return Boolean(this.windowRef.opener && !this.windowRef.opener.closed);
    } catch {
      return false;
    }
  }
}

export function mountFloatingGraphPopup(mount, options = null) {
  const popupOptions = options ?? readGraphPopupOptions();

  if (!popupOptions?.graphId) {
    const root = requireElement(mount, "floating-graph popup mount");
    const message = document.createElement("p");

    message.className = "floating-graph-popup-error";
    message.textContent = "This floating graph link is missing its graph identifier.";
    root.replaceChildren(message);
    return null;
  }

  const popup = new FloatingGraphPopup(mount, popupOptions);

  popup.start();
  return popup;
}
