import { AnalysisPanel } from "./analysis/AnalysisPanel.js";
import { AnalysisDataset } from "./analysis/AnalysisDataset.js";
import { CircuitScene } from "./scene/CircuitScene.js";
import { COMMAND_FLAGS, normaliseCommandFlags } from "./helpers/CommandFlags.js";
import { DebugFlagsControl } from "./helpers/DebugFlagsControl.js";
import { DebugSettingsControl } from "./helpers/DebugSettingsControl.js";
import { FB_Store } from "./firebase/FB_Store.js";
import { DIFF_AMP_COMPONENT, createDifferentialAmpModelAdapter } from "./model/DifferentialAmpModelAdapter.js";
import { Model } from "./model/Model.js";
import { ModelStore } from "./model/ModelStorage.js";
import { STATE_LED_ROWS, StateControl } from "./helpers/StateControl.js";
import { TEST_PANEL_HTML, TestPanel } from "./analysis/TestPanel.js";
import { TickSound } from "./helpers/TickSound.js";
import { WebView } from "./WebView.js";
import { WIPER_IDS, getModelWipers, normaliseWipers } from "./helpers/Wipers.js";
import { DifferentialAmpSensorModel } from "./helpers/DifferentialAmpSensorModel.js";

const BUTTON_TICK_FREQUENCY = 4096;
const LED_BUTTON_OFF_TICK_FREQUENCY = 1024;
const LED_BUTTON_ON_TICK_FREQUENCY = 2048;
const SETTINGS_STORAGE_KEY = "caldera:circuit-settings:v1";
const ANALYSIS_CHANNEL_NAME = "caldera:analysis:v1";
const FORMULA_TELEMETRY_SETTLE_DELAY_MS = 500;
const VIEW_CIRCUIT = "circuit";
const VIEW_ANALYSIS = "analysis";
const buttonTickSound = new TickSound({ frequency: BUTTON_TICK_FREQUENCY });
const ledButtonOffTickSound = new TickSound({ frequency: LED_BUTTON_OFF_TICK_FREQUENCY });
const ledButtonOnTickSound = new TickSound({ frequency: LED_BUTTON_ON_TICK_FREQUENCY });

const view = getRequestedView();

if (view === VIEW_ANALYSIS) {
  mountAnalysisView();
} else {
  mountCircuitView();
}

function mountAnalysisView() {
  const model = new Model();
  const webView = new WebView(model);
  const analysisChannel = createAnalysisChannel();
  const firebaseStore = new FB_Store({ autoTest: false });
  const seenAnalysisMessageIds = new Set();
  const startupOptions = getAnalysisStartupOptions();
  let compareAfterNextLoad = startupOptions.compare === true;

  document.querySelector("#app").innerHTML = `
    <div class="app-layout app-layout--analysis">
      ${getAnalysisSectionHtml()}
    </div>
  `;

  document.addEventListener("click", handleButtonTickSound, true);

  const analysisRoot = document.querySelector("[data-analysis-div]");
  const analysisPanel = new AnalysisPanel({
    firebaseStore,
    previewCompareMode: startupOptions.compare === true,
    previewModelOwnerUid: startupOptions.modelOwnerUid,
    previewModelRunId: startupOptions.modelRunId,
    previewModelType: startupOptions.modelType,
    root: analysisRoot,
    webView,
  });

  const handleAnalysisMessage = (message) => {
    if (!claimAnalysisMessage(message, seenAnalysisMessageIds)) {
      return;
    }

    if (message.type === "loadCsv") {
      try {
        analysisPanel.loadCsv({
          content: message.content,
          filename: message.filename || "Dataset.csv",
        });
        if (message.filename) {
          localStorage.setItem("caldera:lastCsv", message.filename);
        }
        if (compareAfterNextLoad) {
          compareAfterNextLoad = false;
          startPreviewModelComparison(analysisPanel);
        }
      } catch (error) {
        analysisPanel.setBadge(error?.message || "load failed");
      }
      return;
    }

    if (message.type === "analysisClear") {
      analysisPanel.clear({
        label: message.label ?? null,
        panel: message.panel ?? null,
      });
      return;
    }

    if (message.type === "analysisSample") {
      analysisPanel.addSample(message.sample);
      return;
    }

    if (message.type === "testStatus") {
      analysisPanel.setTestStatus(message);
      return;
    }

    if (message.type === "formulaTelemetry") {
      analysisPanel.handleFormulaTelemetry(message);
    }
  };

  analysisChannel.listen(handleAnalysisMessage);
  webView.on("loadCsv", handleAnalysisMessage);
  webView.on("analysisClear", handleAnalysisMessage);
  webView.on("analysisSample", handleAnalysisMessage);
  webView.on("formulaTelemetry", handleAnalysisMessage);
  webView.on("testStatus", handleAnalysisMessage);

  webView.postReady();

  if (startupOptions.loadFile) {
    if (!webView.postRequestLoadCsv(startupOptions.loadFile)) {
      compareAfterNextLoad = false;
      analysisPanel.setBadge("host load unavailable");
    }
  } else {
    const lastCsv = localStorage.getItem("caldera:lastCsv");
    if (lastCsv) {
      webView.postRequestLoadCsv(lastCsv);
    }
  }
}

function startPreviewModelComparison(analysisPanel) {
  analysisPanel.previewModelComparison()
    .catch((error) => {
      analysisPanel.setBadge(error?.message || "model preview failed");
    });
}

function getAnalysisStartupOptions() {
  const params = new URLSearchParams(window.location.search);
  const loadFile = params.get("loadFile")?.trim() ?? "";
  const compare = isTruthyQueryValue(params.get("compare"));
  const modelType = params.get("modelType")?.trim() ?? "";
  const modelOwnerUid = params.get("modelOwnerUid")?.trim() ?? "";
  const modelRunId = params.get("modelRunId")?.trim() ?? "";

  return {
    compare,
    loadFile,
    modelOwnerUid,
    modelRunId,
    modelType,
  };
}

function isTruthyQueryValue(value) {
  return value === "1" || value?.toLowerCase() === "true";
}


function mountCircuitView() {
  const modelStore = new ModelStore();
  const componentModels = modelStore.getComponentModels();
  const diffAmpModel = createDifferentialAmpModelAdapter(componentModels.diffAmp);
  const model = new Model({ componentModels });
  const webView = new WebView(model);
  const storedSettings = readStoredSettings();
  const initialCommandFlags = getInitialCommandFlags(storedSettings);
  let lastManualWiperCommandKey = null;

  webView.setCommandFlags(initialCommandFlags);

  document.querySelector("#app").innerHTML = `
    <div class="firebase-panel">
      <div class="firebase-panel-text"></div>
    </div>
    <div class="app-layout app-layout--circuit">
      <section class="circuit-div" data-circuit-div>
        <button class="view-launch-button" type="button" data-open-analysis-view>
          Analysis
        </button>
        <div class="scene-stage" data-scene></div>
        <div class="state-panel">
          <div class="state-panel__grid">
            ${STATE_LED_ROWS.map((row) => `
              <div class="state-panel__row">
                ${row.map(({ id, kind, label }) => `
                  <button
                    class="state-panel__button"
                    type="button"
                    data-state-toggle="${id}"
                    data-state-kind="${kind}"
                  >
                    ${label}
                  </button>
                `).join("")}
              </div>
            `).join("")}
          </div>
          <div class="state-panel__options">
            <label class="state-panel__option">
              <input
                class="state-panel__option-input"
                type="checkbox"
                aria-label="Auto set HoldWipers when LED buttons change state"
                data-state-hold-wipers-on-change
                ${getStoredHoldWipersOnLedChange(storedSettings) === false ? "" : "checked"}
              />
              <span class="state-panel__option-box" aria-hidden="true"></span>
              <span class="state-panel__option-label">Auto hold</span>
            </label>
            <label class="state-panel__option">
              <input
                class="state-panel__option-input"
                type="checkbox"
                aria-label="Run Find Signal when LED buttons change state"
                data-state-run-find-signal
                ${storedSettings?.stateControl?.runFindSignalOnStateChange === true ? "checked" : ""}
              />
              <span class="state-panel__option-box" aria-hidden="true"></span>
              <span class="state-panel__option-label">Search phase</span>
            </label>
          </div>
        </div>
        <div class="debug-panel" data-debug-panel>
          <div class="debug-panel__sections">
            <section class="debug-panel__section debug-panel__section--flags">
              <div class="debug-panel__header">
                <span>Command flags</span>
                <span data-debug-flags-status>0x00000000</span>
              </div>
              <label class="debug-panel__option">
                <input type="checkbox" data-debug-flag="holdWipers" />
                <span>HoldWipers</span>
              </label>
              <label class="debug-panel__option">
                <input type="checkbox" data-debug-flag="update" />
                <span>Update</span>
              </label>
            </section>
            <section class="debug-panel__section debug-panel__section--tests">
              <div class="debug-panel__header">
                <span>Tests</span>
                <span data-debug-tests-status>ready</span>
              </div>
              <div class="debug-panel__test-actions">
                <button class="debug-panel__button" type="button" data-debug-test="findSignal">
                  Find Signal
                </button>
                <button class="debug-panel__button" type="button" data-debug-test="getNoiseSample">
                  Get Noise Sample
                </button>
              </div>
            </section>
          </div>
          <div class="debug-panel__footer">
            <div class="debug-panel__actions">
              <button class="debug-panel__button" type="button" data-debug-save-settings>
                Save settings
              </button>
              <button class="debug-panel__button" type="button" data-debug-load-settings>
                Load settings
              </button>
            </div>
            <div class="debug-panel__status">
              <span>settings</span>
              <span data-debug-settings-status>empty</span>
            </div>
          </div>
        </div>
        ${TEST_PANEL_HTML}
        <div class="wiper-debug" data-wiper-debug hidden>
          <div class="wiper-debug__header">
            <span>WebView wipers</span>
            <span data-wiper-debug-status>idle</span>
          </div>
          <div class="wiper-debug__keys" data-wiper-debug-keys>keys: -</div>
          <div class="wiper-debug__grid">
            <span></span>
            <span>web</span>
            <span>model</span>
            ${WIPER_IDS.map((id) => `
              <span>${id}</span>
              <span data-wiper-debug-incoming="${id}">-</span>
              <span data-wiper-debug-model="${id}">${formatDebugValue(model[id]?.wiper)}</span>
            `).join("")}
          </div>
        </div>
      </section>
    </div>
  `;

  document.addEventListener("click", handleButtonTickSound, true);

  const sceneRoot = document.querySelector("[data-scene]");
  const stateButtons = document.querySelectorAll("[data-state-toggle]");
  const stateHoldWipersInput = document.querySelector("[data-state-hold-wipers-on-change]");
  const stateRunFindSignalInput = document.querySelector("[data-state-run-find-signal]");
  const debugFlagInputs = document.querySelectorAll("[data-debug-flag]");
  const debugFlagsStatus = document.querySelector("[data-debug-flags-status]");
  const debugTestButtons = document.querySelectorAll("[data-debug-test]");
  const debugTestsStatus = document.querySelector("[data-debug-tests-status]");
  const debugLoadSettingsButton = document.querySelector("[data-debug-load-settings]");
  const debugSaveSettingsButton = document.querySelector("[data-debug-save-settings]");
  const debugSettingsStatus = document.querySelector("[data-debug-settings-status]");
  const openAnalysisButton = document.querySelector("[data-open-analysis-view]");
  const activeViews = new Map();
  const testPanelRoot = document.querySelector("[data-test-panel]");
  const wiperDebugStatus = document.querySelector("[data-wiper-debug-status]");
  const wiperDebugKeys = document.querySelector("[data-wiper-debug-keys]");
  const incomingDebugById = new Map(
    WIPER_IDS.map((id) => [id, document.querySelector(`[data-wiper-debug-incoming="${id}"]`)]),
  );
  const modelDebugById = new Map(
    WIPER_IDS.map((id) => [id, document.querySelector(`[data-wiper-debug-model="${id}"]`)]),
  );
  let wiperMessageCount = 0;
  let liveWiperRevision = 0;
  let liveWipers = null;
  let formulaTelemetrySettleTimer = null;
  let formulaTelemetrySettleRevision = 0;
  const hasHostTelemetry = Boolean(window.chrome?.webview);
  const analysisChannel = createAnalysisChannel();
  const headlessAnalysisPanel = new AnalysisPanel({
    dataset: new AnalysisDataset({
      sensorModel: new DifferentialAmpSensorModel(
        diffAmpModel?.getSensorModelOptions() ?? { disabled: true },
      ),
    }),
    root: null,
    webView,
  });
  const analysisBridge = createAnalysisBridge(headlessAnalysisPanel, webView, analysisChannel);
  const firebaseStore = new FB_Store({
    onPreviewModel: (modelRun) => previewModelRun({
      activeViews,
      button: openAnalysisButton,
      modelRun,
      webView,
    }),
  });

  if (!diffAmpModel) {
    firebaseStore.panel.appendText(`Please install model for ${DIFF_AMP_COMPONENT}.\n`);
  }

  const circuitScene = new CircuitScene(sceneRoot, model, {
    componentModels,
    onManualWiperInput: handleManualWiperInput,
    onPointerMoveRequest: (pointer) => webView.postMoveMousePointer(pointer),
    onSettingsChange: saveStoredSettings,
  });
  const commandFlagsControl = new DebugFlagsControl({
    initialCommandFlags,
    inputs: debugFlagInputs,
    onChange: () => saveStoredSettings(),
    status: debugFlagsStatus,
    testButtons: debugTestButtons,
    testStatus: debugTestsStatus,
    webView,
  });
  const stateControl = new StateControl({
    buttons: stateButtons,
    commandFlags: commandFlagsControl,
    holdWipersOnLedChangeInput: stateHoldWipersInput,
    initialHoldWipersOnLedChange: getStoredHoldWipersOnLedChange(storedSettings) !== false,
    initialRunFindSignalOnStateChange: storedSettings?.stateControl?.runFindSignalOnStateChange === true,
    onSettingsChange: () => saveStoredSettings(),
    runFindSignalInput: stateRunFindSignalInput,
    webView,
  });

  new DebugSettingsControl({
    applySettings: applyDebugSettings,
    getSettings: () => ({
      ledState: getDebugLedState(),
      wipers: getModelWipers(model),
    }),
    loadButton: debugLoadSettingsButton,
    saveButton: debugSaveSettingsButton,
    status: debugSettingsStatus,
  });

  const testPanel = new TestPanel({
    analysisPanel: analysisBridge,
    commandFlags: commandFlagsControl,
    circuitScene,
    getHardwareWiperRevision: () => liveWiperRevision,
    getHardwareWipers: () => liveWipers,
    model,
    onStatus: (status) => analysisBridge.postTestStatus(status),
    onTestStart: () => openAnalysisViewIfNeeded(webView, activeViews, openAnalysisButton),
    requireWiperAck: hasHostTelemetry,
    root: testPanelRoot,
    setLedState: (activeIds) => stateControl.setActiveIds(activeIds),
    updateWiperDebug,
    webView,
  });

  updateAnalysisButton(openAnalysisButton, activeViews);

  openAnalysisButton?.addEventListener("click", () => {
    toggleAnalysisView(webView, activeViews, openAnalysisButton);
  });

  circuitScene.applySettings(storedSettings);
  circuitScene.start();

  webView.on("setPhotodiodeVoltage", ({ value }) => {
    circuitScene.setPhotoDiodeVoltage(value, { notify: false });
  });

  webView.on("wipersChanged", ({ wipers }) => {
    liveWipers = {
      ...normaliseWipers(wipers),
      state: stateControl.getLastHostState(),
    };
    liveWiperRevision += 1;

    const applied = model.applyWiperValues(wipers);

    updateWiperDebug(wipers, { applied });

    if (applied) {
      circuitScene.render();
    }

    analysisBridge.postFormulaTelemetry({ wipers: liveWipers });
    scheduleSettledFormulaTelemetry();
  });

  webView.on("stateChanged", ({ state }) => {
    stateControl.applyHostState(state);

    if (liveWipers) {
      liveWipers = {
        ...liveWipers,
        state: stateControl.getLastHostState(),
      };
    }
  });

  webView.on("voltagesChanged", ({ voltages }) => {
    if (circuitScene.applyPhysicalVoltages(voltages)) {
      circuitScene.render();
    }

    analysisBridge.postFormulaTelemetry({ voltages });
  });

  webView.on("startTest", ({ test }) => {
    testPanel.startTest(test);
  });

  webView.on("stopTest", ({ test = null } = {}) => {
    testPanel.stopTest(test);
  });

  webView.on("activeViews", ({ views }) => {
    syncActiveViews(activeViews, views);
    updateAnalysisButton(openAnalysisButton, activeViews);
  });

  webView.postGetWipers();
  webView.postGetActiveViews();
  updateWiperDebug(null, { applied: false });
  webView.postReady();

  function saveStoredSettings(settings = circuitScene.getSettings()) {
    const sceneSettings = settings && typeof settings === "object"
      ? settings
      : circuitScene.getSettings();
    const storedSettings = {
      ...sceneSettings,
      commandFlags: commandFlagsControl.getSettings(),
      stateControl: stateControl.getSettings(),
    };

    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(storedSettings));
    } catch {
      // Storage is a convenience here; the circuit still works without it.
    }

    webView.postSettingsChange(sceneSettings);
  }

  function scheduleSettledFormulaTelemetry() {
    formulaTelemetrySettleRevision += 1;
    const scheduledRevision = formulaTelemetrySettleRevision;

    if (formulaTelemetrySettleTimer) {
      clearTimeout(formulaTelemetrySettleTimer);
    }

    formulaTelemetrySettleTimer = setTimeout(() => {
      formulaTelemetrySettleTimer = null;

      if (scheduledRevision !== formulaTelemetrySettleRevision) {
        return;
      }

      analysisBridge.postFormulaTelemetry({
        settled: true,
        voltages: getCurrentFormulaVoltages(),
        wipers: liveWipers,
      });
    }, FORMULA_TELEMETRY_SETTLE_DELAY_MS);
  }

  function getCurrentFormulaVoltages() {
    return {
      sensor1: Number.isFinite(model.sensor1Voltage)
        ? model.sensor1Voltage
        : circuitScene.getSceneSensor1Voltage(),
      sensor2: model.sensor2Voltage,
    };
  }

  function handleManualWiperInput({ phase, wipers }) {
    commandFlagsControl.setFlag(COMMAND_FLAGS.HOLD_WIPERS, true, { post: false });

    if (phase === "start") {
      lastManualWiperCommandKey = null;
      return;
    }

    if (phase !== "change") {
      return;
    }

    const commandWipers = normaliseWipers(wipers);
    const commandKey = JSON.stringify(commandWipers);

    if (commandKey === lastManualWiperCommandKey) {
      return;
    }

    lastManualWiperCommandKey = commandKey;
    webView.postSetWipers(commandWipers);
  }

  function applyDebugSettings(settings) {
    if (!settings?.wipers || !WIPER_IDS.every((id) => settings.wipers[id] !== undefined)) {
      return false;
    }

    const wipers = normaliseWipers(settings.wipers);
    const ledState = normaliseDebugLedState(settings.ledState ?? settings.state);

    if ((settings.ledState !== undefined || settings.state !== undefined) && ledState === null) {
      return false;
    }

    const applied = model.applyWiperValues(wipers);

    commandFlagsControl.setFlag(COMMAND_FLAGS.HOLD_WIPERS, true, { post: false });
    updateWiperDebug(wipers, { applied });
    circuitScene.render();
    webView.postSetWipers(wipers);

    if (ledState !== null) {
      stateControl.sendHoldState(ledState);
    }

    saveStoredSettings(circuitScene.getSettings());

    return true;
  }

  function getDebugLedState() {
    return stateControl.getLastHostState() ?? stateControl.getState();
  }

  function updateWiperDebug(wipers, { applied = false } = {}) {
    if (wipers && typeof wipers === "object") {
      wiperMessageCount += 1;
    }

    WIPER_IDS.forEach((id) => {
      const incomingValue = wipers && typeof wipers === "object" ? wipers[id] : undefined;

      incomingDebugById.get(id).textContent = formatDebugValue(incomingValue);
      modelDebugById.get(id).textContent = formatDebugValue(model[id]?.wiper);
    });

    if (!wiperDebugStatus) {
      return;
    }

    if (!wipers || typeof wipers !== "object") {
      wiperDebugStatus.textContent = "idle";
      wiperDebugKeys.textContent = "keys: -";
      return;
    }

    wiperDebugKeys.textContent = `keys: ${Object.keys(wipers).join(", ") || "-"}`;
    wiperDebugStatus.textContent = applied
      ? `#${wiperMessageCount} applied`
      : `#${wiperMessageCount} ignored`;
  }
}

function getAnalysisSectionHtml() {
  return `
    <section
      class="analysis-div analysis-div--standalone"
      data-analysis-div
    >
      <div class="analysis-panel">
        <div class="analysis-panel__header">
          <div>
            <span class="analysis-panel__eyebrow">Caldera modelling</span>
            <h1>Data analysis</h1>
          </div>
          <div class="analysis-panel__header-actions">
            <span
              class="analysis-panel__range-check"
              data-analysis-range-check
              hidden
            >
              range check
            </span>
            <span class="analysis-panel__badge" data-analysis-badge>empty dataset</span>
            <input
              type="file"
              accept=".csv,text/csv"
              data-analysis-load-csv-input
              hidden
            />
            <button
              class="analysis-panel__button"
              type="button"
              data-analysis-load-csv
            >
              Load CSV
            </button>
            <button
              class="analysis-panel__button"
              type="button"
              data-analysis-save-csv
            >
              Save CSV
            </button>
            <button
              class="analysis-panel__button"
              type="button"
              data-analysis-copy-analysis
            >
              Copy analysis
            </button>
            <button
              class="analysis-panel__button"
              type="button"
              data-analysis-run-stages
            >
              Run next stage
            </button>
          </div>
        </div>
        <div class="analysis-panel__body">
          <section class="analysis-panel__plot-row analysis-panel__plot-row--top">
            <aside class="analysis-panel__sidebar">
              <div class="analysis-metric analysis-metric--primary">
                <span class="analysis-metric__label">Linear slope</span>
                <strong data-analysis-slope>-</strong>
              </div>
              <div class="analysis-metric">
                <span class="analysis-metric__label">Fit RMS</span>
                <strong data-analysis-rms>-</strong>
              </div>
              <div class="analysis-metric">
                <span class="analysis-metric__label">Slope / gain</span>
                <strong data-analysis-slope-ratio>-</strong>
              </div>
              <div class="analysis-metric">
                <span class="analysis-metric__label">Samples</span>
                <strong data-analysis-samples>0</strong>
              </div>
            </aside>
            <div class="analysis-chart" data-analysis-chart></div>
            <div class="analysis-stage-formulae" data-analysis-stage-formulae hidden></div>
            <div class="analysis-stage-constants" data-analysis-stage-constants hidden></div>
          </section>
          <section class="analysis-control-panel" data-analysis-control-panel>
            <div class="analysis-control-panel__surface">
              <div class="analysis-control-panel__grid">
                <section class="analysis-control-panel__column">
                  <h2 class="analysis-control-panel__heading">Modelling</h2>
                  <div class="analysis-control-panel__controls" data-analysis-model-controls></div>
                </section>
                <section class="analysis-control-panel__column">
                  <h2 class="analysis-control-panel__heading">Tools</h2>
                  <div class="analysis-control-panel__controls" data-analysis-comparator-controls></div>
                </section>
                <section class="analysis-control-panel__column analysis-control-panel__column--wide">
                  <h2 class="analysis-control-panel__heading" aria-hidden="true">&nbsp;</h2>
                  <div class="analysis-control-panel__controls" data-analysis-testing-controls></div>
                </section>
              </div>
            </div>
          </section>
          <section class="analysis-panel__plot-row analysis-panel__plot-row--bottom">
            <aside class="analysis-panel__sidebar" data-analysis-stages-container>
              <div class="analysis-stage-description" data-analysis-stage-description hidden></div>
            </aside>
            <div class="analysis-chart" data-analysis-stage-chart></div>
          </section>
          <div class="analysis-panel__status-bar">
            <span class="analysis-panel__test-status" data-analysis-test-status>idle</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function createAnalysisBridge(analysisPanel, webView, analysisChannel) {
  const sourceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let nextMessageId = 0;

  const createMessage = (type, payload = {}) => ({
    type,
    messageId: `${sourceId}-${nextMessageId += 1}`,
    ...payload,
  });

  const postMessage = (message) => {
    webView.postMessage(message);
    analysisChannel.post(message);
  };

  return {
    addSampleFromModel(sampleContext) {
      const sample = analysisPanel.addSampleFromModel(sampleContext);

      postMessage(createMessage("analysisSample", { sample }));
      return sample;
    },
    clear(options = {}) {
      analysisPanel.clear(options);
      postMessage(createMessage("analysisClear", options));
    },
    postTestStatus(status = {}) {
      postMessage(createMessage(
        "testStatus",
        status && typeof status === "object" ? status : { status },
      ));
    },
    postFormulaTelemetry(telemetry = {}) {
      postMessage(createMessage("formulaTelemetry", telemetry));
    },
  };
}

function createAnalysisChannel() {
  const channel = typeof BroadcastChannel === "function"
    ? new BroadcastChannel(ANALYSIS_CHANNEL_NAME)
    : null;

  return {
    listen(handler) {
      if (!channel) {
        return;
      }

      channel.addEventListener("message", (event) => handler(event.data));
    },
    post(message) {
      channel?.postMessage(message);
    },
  };
}

function claimAnalysisMessage(message, seenMessageIds) {
  if (!message || typeof message !== "object") {
    return false;
  }

  const messageId = typeof message.messageId === "string"
    ? message.messageId
    : null;

  if (!messageId) {
    return true;
  }

  if (seenMessageIds.has(messageId)) {
    return false;
  }

  seenMessageIds.add(messageId);

  if (seenMessageIds.size > 40000) {
    seenMessageIds.clear();
  }

  return true;
}

function toggleAnalysisView(webView, activeViews, button) {
  if (isViewActive(activeViews, VIEW_ANALYSIS)) {
    closeAnalysisView(webView, activeViews, button);
    return;
  }

  openAnalysisView(webView, activeViews, button);
}

function openAnalysisViewIfNeeded(webView, activeViews, button, options = {}) {
  if (isViewActive(activeViews, VIEW_ANALYSIS)) {
    return false;
  }

  return openAnalysisView(webView, activeViews, button, options);
}

function previewModelRun({
  activeViews,
  button,
  modelRun,
  webView,
} = {}) {
  const loadFile = modelRun?.payload?.dataset?.sourceFilename;
  const modelType = modelRun?.payload?.details?.modelType;

  if (typeof loadFile !== "string" || !loadFile.trim()) {
    return false;
  }

  return openAnalysisView(webView, activeViews, button, {
    compare: true,
    loadFile,
    modelOwnerUid: typeof modelRun.ownerUid === "string" ? modelRun.ownerUid : "",
    modelRunId: typeof modelRun.id === "string" ? modelRun.id : "",
    modelType: typeof modelType === "string" ? modelType : "",
  });
}

function openAnalysisView(webView, activeViews = null, button = null, options = {}) {
  if (webView.postOpenView(VIEW_ANALYSIS, options)) {
    setActiveView(activeViews, VIEW_ANALYSIS, true);
    updateAnalysisButton(button, activeViews);
    return true;
  }

  const openedWindow = window.open(getViewUrl(VIEW_ANALYSIS, options), "_blank", "popup");

  if (!openedWindow) {
    return false;
  }

  setActiveView(activeViews, VIEW_ANALYSIS, openedWindow);
  updateAnalysisButton(button, activeViews);

  const closeTimer = window.setInterval(() => {
    if (!openedWindow.closed) {
      return;
    }

    window.clearInterval(closeTimer);
    setActiveView(activeViews, VIEW_ANALYSIS, false);
    updateAnalysisButton(button, activeViews);
  }, 500);

  return true;
}

function getViewUrl(view, options = {}) {
  const params = new URLSearchParams({ view });

  if (typeof options.loadFile === "string" && options.loadFile.trim()) {
    params.set("loadFile", options.loadFile);
  }

  if (typeof options.modelType === "string" && options.modelType.trim()) {
    params.set("modelType", options.modelType);
  }

  if (typeof options.modelOwnerUid === "string" && options.modelOwnerUid.trim()) {
    params.set("modelOwnerUid", options.modelOwnerUid);
  }

  if (typeof options.modelRunId === "string" && options.modelRunId.trim()) {
    params.set("modelRunId", options.modelRunId);
  }

  if (options.compare === true) {
    params.set("compare", "1");
  }

  return `${window.location.pathname}?${params.toString()}`;
}

function closeAnalysisView(webView, activeViews = null, button = null) {
  const activeView = activeViews?.get(VIEW_ANALYSIS);

  if (webView.postCloseView(VIEW_ANALYSIS)) {
    setActiveView(activeViews, VIEW_ANALYSIS, false);
    updateAnalysisButton(button, activeViews);
    return true;
  }

  if (activeView && typeof activeView === "object" && "close" in activeView) {
    activeView.close();
  }

  setActiveView(activeViews, VIEW_ANALYSIS, false);
  updateAnalysisButton(button, activeViews);
  return true;
}

function syncActiveViews(activeViews, views) {
  if (!activeViews) {
    return;
  }

  activeViews.clear();

  if (!Array.isArray(views)) {
    return;
  }

  views.forEach((activeView) => {
    if (typeof activeView === "string" && activeView) {
      activeViews.set(activeView, true);
    }
  });
}

function setActiveView(activeViews, viewName, value) {
  if (!activeViews) {
    return;
  }

  if (value) {
    activeViews.set(viewName, value);
    return;
  }

  activeViews.delete(viewName);
}

function isViewActive(activeViews, viewName) {
  return Boolean(activeViews?.has(viewName));
}

function updateAnalysisButton(button, activeViews) {
  if (!button) {
    return;
  }

  const active = isViewActive(activeViews, VIEW_ANALYSIS);

  button.dataset.active = String(active);
  button.setAttribute("aria-pressed", String(active));
  button.textContent = active ? "Close analysis" : "Analysis";
}

function getRequestedView() {
  const requestedView = new URLSearchParams(window.location.search).get("view");

  return requestedView === VIEW_ANALYSIS ? VIEW_ANALYSIS : VIEW_CIRCUIT;
}

function readStoredSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    return null;
  }
}

function getInitialCommandFlags(settings) {
  const storedCommandFlags = settings?.commandFlags?.flags ?? settings?.commandFlags;

  if (storedCommandFlags !== undefined) {
    return normaliseCommandFlags(storedCommandFlags);
  }

  return settings?.freezeWipers?.frozen === true
    ? COMMAND_FLAGS.HOLD_WIPERS
    : COMMAND_FLAGS.NONE;
}

function getStoredHoldWipersOnLedChange(settings) {
  return settings?.stateControl?.holdWipersOnLedChange
    ?? settings?.stateControl?.freezeWipersOnLedChange;
}

function handleButtonTickSound(event) {
  const target = event.target instanceof Element
    ? event.target
    : event.target?.parentElement;
  const button = target?.closest("button");

  if (!button) {
    return;
  }

  if (button.matches("[data-state-toggle]")) {
    const isCurrentlyOn = button.dataset.active === "true"
      || button.getAttribute("aria-pressed") === "true";

    (isCurrentlyOn ? ledButtonOffTickSound : ledButtonOnTickSound).play();
    return;
  }

  buttonTickSound.play();
}

function normaliseDebugLedState(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const state = Number(value);

  return Number.isFinite(state) && state >= 0
    ? Math.trunc(state) >>> 0
    : null;
}

function formatDebugValue(value) {
  const number = Number(value);

  return Number.isFinite(number) ? String(number) : "-";
}
