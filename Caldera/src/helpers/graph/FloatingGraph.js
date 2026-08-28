import { FloatingGraphCommunication } from "./communication.js";
import { FloatingGraphFrame } from "./frame.js";
import { FloatingGraphScene } from "./scene.js";
import {
  createGraphId,
  createGraphPopupFeatures,
  createGraphPopupUrl,
  getGraphPopupWindowName,
  normaliseGraphPoints,
  requireNonEmptyString,
} from "./utilities.js";

const POPUP_CLOSE_POLL_MS = 500;

export class FloatingGraph {
  constructor(mount, {
    frameTitle = "Graph",
    graphId = null,
    popupFeatures = null,
    popupUrl = null,
    sceneOptions = {},
    windowRef = window,
  } = {}) {
    this.windowRef = windowRef;
    this.graphId = graphId
      ? requireNonEmptyString(graphId, "graphId")
      : createGraphId("floating-graph");
    this.frameTitle = String(frameTitle);
    this.popupFeatures = popupFeatures;
    this.popupUrl = popupUrl;
    this.popupWindow = null;
    this.popupCloseTimer = null;
    this.remoteReady = false;
    this.revision = 0;
    this.started = false;
    const onSceneRender = sceneOptions?.onRender;

    this.frame = new FloatingGraphFrame(mount, {
      onFocus: () => this.focusPopup(),
      onPopOut: () => this.popOut(),
      onRedock: () => this.redock(),
      onResize: () => this.scene.resize(),
      title: this.frameTitle,
      windowRef: this.windowRef,
    });
    this.scene = new FloatingGraphScene(this.frame.stage, {
      ...sceneOptions,
      onRender: (scene) => {
        this.frame.attachModebar();

        if (typeof onSceneRender === "function") {
          onSceneRender(scene);
        }
      },
    });
    this.communication = new FloatingGraphCommunication({
      graphId: this.graphId,
      windowRef: this.windowRef,
    });
    this.unsubscribe = this.communication.subscribe((message) => {
      this.handleMessage(message);
    });
  }

  start() {
    if (this.started) {
      return this.scene.plotQueue;
    }

    this.started = true;
    if (!this.unsubscribe) {
      this.unsubscribe = this.communication.subscribe((message) => {
        this.handleMessage(message);
      });
    }
    this.frame.start();
    this.communication.start();

    if (this.popupWindow && !this.popupWindow.closed) {
      this.communication.setPeerWindow(this.popupWindow);
      this.frame.setPoppedOut(true);
      this.startPopupCloseTimer();
    } else if (this.popupWindow || this.frame.poppedOut) {
      this.redock({ closePopup: false, notifyPopup: false });
    }

    this.communication.send("owner-ready", {}, { revision: this.revision });
    return this.scene.start();
  }

  stop() {
    if (!this.started) {
      return this.scene.plotQueue;
    }

    this.communication.send(
      "owner-closing",
      { frameTitle: this.frameTitle },
      { revision: this.revision },
    );
    this.started = false;
    this.remoteReady = false;
    this.clearPopupCloseTimer();
    this.frame.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.communication.stop();
    return this.scene.stop();
  }

  prepare(definition = {}) {
    const completion = this.scene.prepare(definition);

    this.revision += 1;
    this.publishSnapshot();
    return completion;
  }

  appendPoints(points) {
    const knownPoints = normaliseGraphPoints(points);

    if (knownPoints.length === 0) {
      return Promise.resolve();
    }

    const completion = this.scene.appendPoints(knownPoints, { normalised: true });

    this.revision += 1;

    if (this.remoteReady) {
      this.communication.send(
        "append",
        { points: knownPoints },
        { revision: this.revision },
      );
    }

    return completion;
  }

  clear() {
    const completion = this.scene.clear();

    this.revision += 1;
    this.publishSnapshot();
    return completion;
  }

  setPresentation(presentation = {}) {
    const completion = this.scene.setPresentation(presentation);

    this.revision += 1;
    this.publishSnapshot();
    return completion;
  }

  getSnapshot() {
    return this.scene.getSnapshot();
  }

  getViewState() {
    return this.scene.getViewState();
  }

  setViewState(viewState) {
    return this.scene.setViewState(viewState);
  }

  popOut() {
    if (this.popupWindow && !this.popupWindow.closed) {
      this.frame.setPoppedOut(true);
      this.focusPopup();
      return true;
    }

    const url = typeof this.popupUrl === "function"
      ? this.popupUrl(this.graphId)
      : this.popupUrl ?? createGraphPopupUrl(
        this.graphId,
        this.windowRef.location.href,
      );
    const features = typeof this.popupFeatures === "string"
      ? this.popupFeatures
      : createGraphPopupFeatures(
        this.popupFeatures ?? {},
        this.windowRef.screen,
      );
    const popupWindow = this.windowRef.open(
      url,
      getGraphPopupWindowName(this.graphId),
      features,
    );

    if (!popupWindow) {
      this.frame.setStatus("Pop-out blocked", { error: true });
      return false;
    }

    this.popupWindow = popupWindow;
    this.remoteReady = false;
    this.communication.setPeerWindow(popupWindow);
    this.frame.setPoppedOut(true);
    this.frame.setStatus("Opening…");
    this.startPopupCloseTimer();
    return true;
  }

  redock({ closePopup = true, notifyPopup = true } = {}) {
    if (!this.frame.poppedOut && !this.popupWindow) {
      return false;
    }

    const popupWindow = this.popupWindow;

    if (notifyPopup) {
      this.communication.send("redock", {}, { revision: this.revision });
    }

    this.clearPopupCloseTimer();
    this.popupWindow = null;
    this.remoteReady = false;
    this.communication.setPeerWindow(null);
    this.frame.setPoppedOut(false);
    this.frame.setStatus("");
    this.scene.resize();

    if (closePopup && popupWindow && !popupWindow.closed) {
      this.windowRef.setTimeout(() => popupWindow.close(), 0);
    }

    return true;
  }

  maximise() {
    return this.frame.maximise();
  }

  restore() {
    return this.frame.restore();
  }

  focusPopup() {
    if (!this.popupWindow || this.popupWindow.closed) {
      this.redock({ closePopup: false, notifyPopup: false });
      return false;
    }

    this.popupWindow.focus();
    return true;
  }

  publishSnapshot() {
    if (!this.remoteReady) {
      return false;
    }

    return this.communication.send(
      "snapshot",
      {
        frameTitle: this.frameTitle,
        snapshot: this.scene.getSnapshot(),
      },
      { revision: this.revision },
    );
  }

  handleMessage(message) {
    switch (message.type) {
      case "popup-ready":
      case "snapshot-request":
        this.remoteReady = true;
        this.frame.setStatus("");
        this.publishSnapshot();
        break;
      case "redock-request":
        this.scene.setViewState(message.payload.viewState);
        this.redock();
        break;
      case "popup-closing":
        this.scene.setViewState(message.payload.viewState);

        if (this.frame.poppedOut) {
          this.frame.setStatus("Closing…");
        } else {
          this.communication.clearAcceptedPeerWindow();
        }
        break;
      case "view-state":
        if (this.frame.poppedOut) {
          this.scene.setViewState(message.payload.viewState);
        }
        break;
      default:
        break;
    }
  }

  startPopupCloseTimer() {
    this.clearPopupCloseTimer();
    this.popupCloseTimer = this.windowRef.setInterval(() => {
      if (this.popupWindow && !this.popupWindow.closed) {
        return;
      }

      this.redock({ closePopup: false, notifyPopup: false });
    }, POPUP_CLOSE_POLL_MS);
  }

  clearPopupCloseTimer() {
    if (this.popupCloseTimer === null) {
      return;
    }

    this.windowRef.clearInterval(this.popupCloseTimer);
    this.popupCloseTimer = null;
  }
}
