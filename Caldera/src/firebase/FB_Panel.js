export class FB_Panel {
  constructor(store) {
    this.store = store;
    this.el = document.querySelector(".firebase-panel") ?? this.createPanel();
    this.textEl = this.ensureTextElement();
    this.buttonEl = null;
    this.textNode = this.createTextNode();
  }

  createPanel() {
    const panel = document.createElement("div");
    panel.className = "firebase-panel-dynamic";

    document.body.appendChild(panel);

    return panel;
  }

  ensureTextElement() {
    let textEl = this.el.querySelector(".firebase-panel-text");

    if (!textEl) {
      textEl = document.createElement("div");
      textEl.className = "firebase-panel-text";
      this.el.appendChild(textEl);
    }

    return textEl;
  }


  ensureButtonAvailable() {
    if (!this.buttonEl) {
      this.buttonDiv = document.createElement("div");
      this.buttonDiv.className = "firebase-panel-button-container";
      this.el.appendChild(this.buttonDiv);
      
      this.buttonEl = document.createElement("button");
      this.buttonEl.className = "firebase-panel-button";

      this.buttonEl.s1 = document.createElement("span");
      this.buttonEl.s2 = document.createElement("span");
      this.buttonEl.appendChild(this.buttonEl.s1);
      this.buttonEl.appendChild(this.buttonEl.s2);

      this.buttonDiv.appendChild(this.buttonEl);
    }
  }

  tryRemoveButton() {
    if (this.buttonEl) {
      this.buttonEl.remove();
      this.buttonEl = null;
    }
  }

  setBrightText() {
    this.textEl.style.color = "rgba(255, 255, 255, 0.7) !important";
  }

  createTextNode() {
    const textNode = document.createTextNode("");
    this.textEl.appendChild(textNode);
    return textNode;
  }

  clear() {
    this.textNode.textContent = "";
    this.textNode.style = "";
    this.tryRemoveButton();
  }

  showError(message) {
    this.clear();
    this.textNode.appendData(message);
  }

  appendText(text) {
    this.textNode.appendData(text);
    this.el.scrollTop = this.el.scrollHeight;
  }

  showModelPreviewButton(callback, {
    componentType = "",
    modelType = "",
  } = {}) {
    this.ensureButtonAvailable();
    this.buttonEl.s1.innerHTML = "Preview Model:<br />";
    this.buttonEl.s2.textContent = `${getCamelCase(componentType)} ${getCamelCase(modelType)}`;
    this.buttonEl.onclick = callback;
  }

  showModelDownloadButton(callback, options = {}) {
    this.showModelPreviewButton(callback, options);
  }
}

function getCamelCase(str) {
  if (!str) return "";

  return str
    .split(/[\s_-]+/)
    .map((word, index) => index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}