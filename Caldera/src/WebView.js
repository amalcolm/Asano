import { COMMAND_FLAGS, normaliseCommandFlags } from "./helpers/CommandFlags.js";

const DEFAULT_HOST_CONFIG = {
  postSettingsChanges: false,
};

export class WebView {
  constructor(model) {
    this.model = model;
    this.commandFlags = COMMAND_FLAGS.NONE;
    this.hostConfig = {
      ...DEFAULT_HOST_CONFIG,
      ...window.calderaHost,
    };
    this.handlersByType = new Map();
    this.webview = window.chrome?.webview ?? null;

    window.calderaHost = this.hostConfig;

    this.handleMessage = this.handleMessage.bind(this);
    this.webview?.addEventListener("message", this.handleMessage);
  }

  on(type, handler) {
    if (!this.handlersByType.has(type)) {
      this.handlersByType.set(type, new Set());
    }

    const handlers = this.handlersByType.get(type);
    handlers.add(handler);

    return () => handlers.delete(handler);
  }

  postReady() {
    return this.postMessage({
      type: "ready",
    });
  }

  postSettingsChange(settings) {
    if (!this.hostConfig.postSettingsChanges) {
      return false;
    }

    return this.postMessage({
      type: "settingsChange",
      value: settings,
    });
  }

  postSaveCsv({
    content,
    filename,
  }) {
    return this.postMessage({
      type: "saveCsv",
      content,
      filename,
    });
  }

  postRequestLoadCsv(filename = "") {
    return this.postMessage({
      type: "requestLoadCsv",
      filename,
    });
  }

  postOpenView(view, options = {}) {
    return this.postMessage({
      type: "openView",
      view,
      ...getOpenViewOptions(options),
    });
  }

  postCloseView(view) {
    return this.postMessage({
      type: "closeView",
      view,
    });
  }

  postMoveMousePointer(pointer) {
    if (!pointer || typeof pointer !== "object") {
      return false;
    }

    return this.postMessage({
      type: "moveMousePointer",
      ...pointer,
    });
  }

  postGetActiveViews() {
    return this.postMessage({
      type: "getActiveViews",
    });
  }

  postStartTest(test) {
    return this.postMessage({
      type: "startTest",
      test,
    });
  }

  postStopTest(test = null) {
    return this.postMessage({
      type: "stopTest",
      test,
    });
  }

  postAnalysisClear(options = {}) {
    return this.postMessage({
      type: "analysisClear",
      ...options,
    });
  }

  postAnalysisSample(sample, options = {}) {
    return this.postMessage({
      type: "analysisSample",
      ...options,
      sample,
    });
  }

  postTestStatus(status) {
    return this.postMessage({
      type: "testStatus",
      ...(status && typeof status === "object" ? status : { status }),
    });
  }

  postSetWipers(wipers, {
    cmdFlags = this.getCommandFlags(),
  } = {}) {
    return this.postMessage({
      type: "setWipers",
      wipers,
      cmdFlags: cmdFlags,
    });
  }

  postGetWipers({
    cmdFlags = this.getCommandFlags(),
  } = {}) {
    return this.postMessage({
      type: "getWipers",
      cmdFlags: cmdFlags,
    });
  }

  postSetState({
    cmdFlags = this.getCommandFlags(),
    state,
  }) {
    return this.postMessage({
      type: "setState",
      state,
      cmdFlags: cmdFlags,
    });
  }

  postSetDebugFlags({
    cmdFlags = this.getCommandFlags(),
  } = {}) {
    return this.postMessage({
      type: "setDebugFlags",
      cmdFlags: cmdFlags,
    });
  }

  getCommandFlags() {
    return this.commandFlags;
  }

  setCommandFlags(flags) {
    this.commandFlags = normaliseCommandFlags(flags);
    return this.commandFlags;
  }

  postMessage(message) {
    if (!this.webview) {
      return false;
    }

    this.webview.postMessage(withCommandFlags(message, this.getCommandFlags()));
    return true;
  }

  handleMessage(event) {
    const message = parseMessage(event.data);

    if (!message?.type) {
      return;
    }

    if (message.type === "hostConfig") {
      this.applyHostConfig(message);
    }

    const handlers = this.handlersByType.get(message.type);
    handlers?.forEach((handler) => handler(message));
  }

  applyHostConfig(message) {
    if ("postSettingsChanges" in message) {
      this.hostConfig.postSettingsChanges = message.postSettingsChanges === true;
    }
  }
}

function withCommandFlags(message, cmdFlags) {
  if (!message || typeof message !== "object" || Array.isArray(message) || "cmdFlags" in message) {
    return message;
  }

  return {
    ...message,
    cmdFlags: cmdFlags,
  };
}

function getOpenViewOptions(options) {
  if (!options || typeof options !== "object") {
    return {};
  }

  const viewOptions = {};

  if (typeof options.loadFile === "string" && options.loadFile.trim()) {
    viewOptions.loadFile = options.loadFile;
  }

  if (typeof options.modelType === "string" && options.modelType.trim()) {
    viewOptions.modelType = options.modelType;
  }

  if (options.compare === true) {
    viewOptions.compare = true;
  }

  return viewOptions;
}

function parseMessage(data) {
  if (data && typeof data === "object") {
    return data;
  }

  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
