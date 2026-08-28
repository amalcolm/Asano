import { requireElement } from "./utilities.js";

const ROLE_SOURCE = "source";
const ROLE_POPUP = "popup";

export class FloatingGraphFrame {
  constructor(mount, {
    onFocus = null,
    onPopOut = null,
    onRedock = null,
    onResize = null,
    role = ROLE_SOURCE,
    title = "Graph",
    windowRef = window,
  } = {}) {
    this.mount = requireElement(mount, "floating-graph mount");
    this.role = role === ROLE_POPUP ? ROLE_POPUP : ROLE_SOURCE;
    this.windowRef = windowRef;
    this.onFocus = onFocus;
    this.onPopOut = onPopOut;
    this.onRedock = onRedock;
    this.onResize = onResize;
    this.maximised = false;
    this.poppedOut = false;
    this.portalMarker = null;
    this.restoreBounds = null;
    this.started = false;

    this.root = document.createElement("section");
    this.root.className = "floating-graph-frame";
    this.root.dataset.floatingGraphRole = this.role;
    this.root.setAttribute("role", "region");
    this.root.innerHTML = `
      <header class="floating-graph-frame__toolbar">
        <span class="floating-graph-frame__title" data-floating-graph-title></span>
        <span
          class="floating-graph-frame__status"
          data-floating-graph-status
          role="status"
          aria-atomic="true"
          aria-live="polite"
          hidden
        ></span>
        <div
          class="floating-graph-frame__modebar-host"
          data-floating-graph-modebar-host
        ></div>
        <div class="floating-graph-frame__actions">
          <button
            class="floating-graph-frame__button"
            data-floating-graph-action="focus"
            type="button"
          >
            Focus
          </button>
          <button
            class="floating-graph-frame__button floating-graph-frame__button--icon"
            data-floating-graph-action="pop-out"
            aria-label="Pop out graph"
            title="Pop out graph"
            type="button"
          >
            <span aria-hidden="true">⤢</span>
          </button>
          <button
            class="floating-graph-frame__button"
            data-floating-graph-action="redock"
            type="button"
          >
            Redock
          </button>
          <button
            class="floating-graph-frame__button"
            data-floating-graph-action="maximise"
            type="button"
          >
            Maximise
          </button>
        </div>
      </header>
      <div class="floating-graph-frame__body">
        <div class="floating-graph-frame__stage" data-floating-graph-stage></div>
        <div
          class="floating-graph-frame__placeholder"
          data-floating-graph-placeholder
          hidden
        >
          <strong>Graph opened in another window</strong>
          <span>Use Focus to bring it forward, or close its window to return it.</span>
        </div>
      </div>
    `;

    this.titleElement = this.root.querySelector("[data-floating-graph-title]");
    this.statusElement = this.root.querySelector("[data-floating-graph-status]");
    this.stage = this.root.querySelector("[data-floating-graph-stage]");
    this.placeholder = this.root.querySelector("[data-floating-graph-placeholder]");
    this.modebarHost = this.root.querySelector("[data-floating-graph-modebar-host]");
    this.actionsElement = this.root.querySelector(".floating-graph-frame__actions");
    this.buttons = new Map(
      [...this.root.querySelectorAll("[data-floating-graph-action]")]
        .map((button) => [button.dataset.floatingGraphAction, button]),
    );

    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.setTitle(title);
    this.mount.replaceChildren(this.root);
    this.updateControls();
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.root.addEventListener("click", this.handleClick);
    this.windowRef.addEventListener("keydown", this.handleKeyDown);
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.restore();
    this.clearModebar();
    this.started = false;
    this.root.removeEventListener("click", this.handleClick);
    this.windowRef.removeEventListener("keydown", this.handleKeyDown);
  }

  popOut() {
    if (this.role !== ROLE_SOURCE || this.poppedOut) {
      return false;
    }

    return this.invoke(this.onPopOut, "Unable to open the graph window.");
  }

  redock() {
    if (this.role === ROLE_SOURCE && !this.poppedOut) {
      return false;
    }

    return this.invoke(this.onRedock, "Unable to redock the graph.");
  }

  focus() {
    return this.invoke(this.onFocus, "Unable to focus the graph window.");
  }

  maximise() {
    if (this.maximised || (this.role === ROLE_SOURCE && this.poppedOut)) {
      return false;
    }

    this.maximised = true;
    this.moveToPortal();
    this.root.classList.add("floating-graph-frame--maximised");

    if (this.role === ROLE_POPUP) {
      this.maximisePopupWindow();
    }

    this.updateControls();
    this.requestResize();
    return true;
  }

  restore() {
    if (!this.maximised) {
      return false;
    }

    this.maximised = false;
    this.root.classList.remove("floating-graph-frame--maximised");
    this.restoreFromPortal();

    if (this.role === ROLE_POPUP) {
      this.restorePopupWindow();
    }

    this.updateControls();
    this.requestResize();
    return true;
  }

  toggleMaximise() {
    return this.maximised ? this.restore() : this.maximise();
  }

  setPoppedOut(poppedOut) {
    if (this.role !== ROLE_SOURCE) {
      return;
    }

    if (poppedOut) {
      this.restore();
    }

    this.poppedOut = Boolean(poppedOut);
    this.root.classList.toggle("floating-graph-frame--popped-out", this.poppedOut);
    this.stage.setAttribute("aria-hidden", String(this.poppedOut));
    this.placeholder.hidden = !this.poppedOut;
    this.setStatus(this.poppedOut ? "Remote" : "");
    this.updateControls();
    this.requestResize();
  }

  setTitle(title) {
    const text = String(title ?? "Graph");

    this.titleElement.textContent = text;
    this.root.setAttribute("aria-label", text);
  }

  setStatus(message, { error = false } = {}) {
    const text = String(message ?? "").trim();

    this.statusElement.textContent = text;
    this.statusElement.hidden = !text;
    this.statusElement.dataset.error = String(Boolean(error));
  }

  setDisconnected(disconnected) {
    this.root.classList.toggle(
      "floating-graph-frame--disconnected",
      Boolean(disconnected),
    );
    this.setStatus(disconnected ? "Owner disconnected" : "");
  }

  attachModebar() {
    const modebarContainer = this.stage.querySelector?.(".modebar-container")
      ?? this.modebarHost.querySelector?.(".modebar-container");

    if (!modebarContainer) {
      this.clearModebar();
      return false;
    }

    if (modebarContainer.parentNode !== this.modebarHost) {
      this.modebarHost.replaceChildren(modebarContainer);
    }

    this.modebarHost.hidden = this.role === ROLE_SOURCE && this.poppedOut;
    return true;
  }

  clearModebar() {
    this.modebarHost.replaceChildren();
    this.modebarHost.hidden = true;
  }

  handleClick(event) {
    const button = event.target.closest?.("[data-floating-graph-action]");

    if (!button || !this.root.contains(button)) {
      return;
    }

    switch (button.dataset.floatingGraphAction) {
      case "focus":
        this.focus();
        break;
      case "pop-out":
        this.popOut();
        break;
      case "redock":
        this.redock();
        break;
      case "maximise":
        this.toggleMaximise();
        break;
      default:
        break;
    }
  }

  handleKeyDown(event) {
    if (event.key === "Escape" && this.maximised) {
      this.restore();
    }
  }

  updateControls() {
    const isPopup = this.role === ROLE_POPUP;

    this.buttons.get("focus").hidden = isPopup || !this.poppedOut;
    this.buttons.get("pop-out").hidden = isPopup || this.poppedOut;
    this.buttons.get("redock").hidden = true;
    this.buttons.get("maximise").hidden = true;
    this.buttons.get("maximise").textContent = this.maximised
      ? "Restore"
      : "Maximise";
    this.modebarHost.hidden = this.role === ROLE_SOURCE && this.poppedOut;
    this.actionsElement.hidden = [...this.buttons.values()]
      .every((button) => button.hidden);
  }

  invoke(callback, errorMessage) {
    if (typeof callback !== "function") {
      return false;
    }

    try {
      const result = callback();

      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          this.setStatus(error?.message ?? errorMessage, { error: true });
        });
      } else if (result === false) {
        this.setStatus(errorMessage, { error: true });
      }

      return result !== false;
    } catch (error) {
      this.setStatus(error?.message ?? errorMessage, { error: true });
      return false;
    }
  }

  moveToPortal() {
    if (!this.root.parentNode || this.portalMarker) {
      return;
    }

    this.portalMarker = document.createComment("floating-graph-frame");
    this.root.parentNode.insertBefore(this.portalMarker, this.root);
    document.body.append(this.root);
  }

  restoreFromPortal() {
    if (!this.portalMarker?.parentNode) {
      this.portalMarker = null;
      return;
    }

    this.portalMarker.parentNode.insertBefore(this.root, this.portalMarker);
    this.portalMarker.remove();
    this.portalMarker = null;
  }

  maximisePopupWindow() {
    const screen = this.windowRef.screen;

    this.restoreBounds = {
      height: this.windowRef.outerHeight,
      left: this.windowRef.screenX,
      top: this.windowRef.screenY,
      width: this.windowRef.outerWidth,
    };

    try {
      this.windowRef.moveTo(screen?.availLeft ?? 0, screen?.availTop ?? 0);
      this.windowRef.resizeTo(screen?.availWidth, screen?.availHeight);
    } catch {
      // Browsers may reserve native window positioning for the user.
    }
  }

  restorePopupWindow() {
    if (!this.restoreBounds) {
      return;
    }

    try {
      this.windowRef.moveTo(this.restoreBounds.left, this.restoreBounds.top);
      this.windowRef.resizeTo(this.restoreBounds.width, this.restoreBounds.height);
    } catch {
      // The CSS restore still succeeds if native window resizing is blocked.
    }

    this.restoreBounds = null;
  }

  requestResize() {
    if (typeof this.windowRef.requestAnimationFrame === "function") {
      this.windowRef.requestAnimationFrame(() => this.onResize?.());
    } else {
      this.windowRef.setTimeout(() => this.onResize?.(), 0);
    }
  }
}
