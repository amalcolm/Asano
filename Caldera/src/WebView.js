import { COMMAND_FLAGS, normaliseCommandFlags } from "./helpers/CommandFlags.js";

const DEFAULT_HOST_CONFIG = {
  maxSequenceStates: 64,
  postSettingsChanges: false,
  testSequences: [],
};

const VALID_HEAD_STATE_BITS = 0x01FF01FF >>> 0;

export class WebView {
  constructor(model) {
    this.model = model;
    this.hostConfig = {
      ...DEFAULT_HOST_CONFIG,
      ...window.calderaHost,
    };
    this.commandFlags = normaliseCommandFlags(
      this.hostConfig.commandFlags ?? this.hostConfig.cmdFlags ?? COMMAND_FLAGS.NONE,
    );
    this.hostConfig.commandFlags = this.commandFlags;
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

  postInstallModel(model) {
    return this.postMessage({
      type: "installModel",
      model,
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

  postSetSequence({
    cmdFlags = this.getCommandFlags(),
    states,
  } = {}) {
    const sequence = normaliseStateSequence(states, this.hostConfig.maxSequenceStates);
    if (sequence.length === 0) {
      return false;
    }

    return this.postMessage({
      type: "setSequence",
      states: sequence,
      cmdFlags: cmdFlags,
    });
  }

  postLoadTestSequence({
    cmdFlags = this.getCommandFlags(),
    name,
  } = {}) {
    const sequenceName = typeof name === "string" ? name.trim() : "";
    if (!sequenceName) {
      return false;
    }

    return this.postMessage({
      type: "loadTestSequence",
      name: sequenceName,
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
    this.hostConfig.commandFlags = this.commandFlags;
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
    const message = normaliseIncomingMessage(parseMessage(event.data));

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

    const commandFlags = getProperty(message, "cmdFlags", "commandFlags");
    if (commandFlags !== undefined) {
      this.setCommandFlags(commandFlags);
    }

    const maxSequenceStates = normalisePositiveInteger(
      getProperty(message, "maxSequenceStates", "MAX_SEQUENCE_STATES"),
    );
    if (maxSequenceStates !== null) {
      this.hostConfig.maxSequenceStates = maxSequenceStates;
    }

    const testSequences = normaliseTestSequences(
      getProperty(message, "testSequences", "TEST_SEQUENCES"),
      this.hostConfig.maxSequenceStates,
    );
    if (testSequences !== null) {
      this.hostConfig.testSequences = testSequences;
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

  if (options.liveTest === true) {
    viewOptions.liveTest = true;
  }

  if (typeof options.test === "string" && options.test.trim()) {
    viewOptions.test = options.test;
  }

  if (typeof options.modelType === "string" && options.modelType.trim()) {
    viewOptions.modelType = options.modelType;
  }

  if (typeof options.modelOwnerUid === "string" && options.modelOwnerUid.trim()) {
    viewOptions.modelOwnerUid = options.modelOwnerUid;
  }

  if (typeof options.modelRunId === "string" && options.modelRunId.trim()) {
    viewOptions.modelRunId = options.modelRunId;
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

function normaliseIncomingMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return message;
  }

  const type = message.type ?? message.Type;
  const normalisedMessage = type && message.type !== type
    ? { ...message, type }
    : message;

  if (normalisedMessage.type === "voltagesChanged") {
    return normaliseVoltagesChangedMessage(normalisedMessage);
  }

  return normalisedMessage;
}

function normaliseVoltagesChangedMessage(message) {
  const payload = getObjectProperty(message, "voltages", "Voltages", "value", "Value") ?? message;
  const payloadSensor1 = getProperty(payload, "sensor1", "Sensor1");
  const payloadSensor2 = getProperty(payload, "sensor2", "Sensor2");
  const sensor1 = payloadSensor1 !== undefined
    ? payloadSensor1
    : getProperty(message, "sensor1", "Sensor1");
  const sensor2 = payloadSensor2 !== undefined
    ? payloadSensor2
    : getProperty(message, "sensor2", "Sensor2");
  const voltages = {};

  if (sensor1 !== undefined) {
    voltages.sensor1 = sensor1;
  }

  if (sensor2 !== undefined) {
    voltages.sensor2 = sensor2;
  }

  return Object.keys(voltages).length
    ? { ...message, voltages }
    : message;
}

function getObjectProperty(source, ...keys) {
  const value = getProperty(source, ...keys);

  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function getProperty(source, ...keys) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }

  return undefined;
}

function normaliseStateSequence(states, maxSequenceStates = 64) {
  if (!Array.isArray(states)) {
    return [];
  }

  const maxStates = normalisePositiveInteger(maxSequenceStates) ?? 64;
  if (states.length === 0 || states.length > maxStates) {
    return [];
  }

  const sequence = [];
  for (const state of states) {
    const normalised = normaliseHeadState(state);
    if (normalised === null) {
      return [];
    }
    sequence.push(normalised);
  }

  return sequence;
}

function normaliseTestSequences(testSequences, maxSequenceStates = 64) {
  if (!Array.isArray(testSequences)) {
    return null;
  }

  const normalised = [];
  for (const testSequence of testSequences) {
    if (!testSequence || typeof testSequence !== "object" || Array.isArray(testSequence)) {
      return null;
    }

    const name = getProperty(testSequence, "name", "Name");
    if (typeof name !== "string" || !name.trim()) {
      return null;
    }

    const states = normaliseStateSequence(
      getProperty(testSequence, "states", "States"),
      maxSequenceStates,
    );
    if (states.length === 0) {
      return null;
    }

    normalised.push({
      name: name.trim(),
      states,
    });
  }

  return normalised;
}

function normaliseHeadState(value) {
  const state = Number(value);
  if (!Number.isSafeInteger(state) || state < 0 || state > 0xFFFFFFFF) {
    return null;
  }

  const unsignedState = state >>> 0;
  const invalidBits = (unsignedState & (~VALID_HEAD_STATE_BITS >>> 0)) >>> 0;
  return invalidBits === 0 ? unsignedState : null;
}

function normalisePositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
