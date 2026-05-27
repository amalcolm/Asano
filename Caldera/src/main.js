import { AnalysisPanel } from "./analysis/AnalysisPanel.js";
import { CircuitScene } from "./scene/CircuitScene.js";
import { COMMAND_FLAGS, normaliseCommandFlags } from "./helpers/CommandFlags.js";
import { DebugFlagsControl } from "./helpers/DebugFlagsControl.js";
import { DebugSettingsControl } from "./helpers/DebugSettingsControl.js";
import { Model } from "./model/Model.js";
import { STATE_LED_ROWS, StateControl } from "./helpers/StateControl.js";
import { TEST_PANEL_HTML, TestPanel } from "./analysis/TestPanel.js";
import { TickSound } from "./helpers/TickSound.js";
import { WebView } from "./WebView.js";
import { WIPER_IDS, getModelWipers, normaliseWipers } from "./helpers/Wipers.js";

const BUTTON_TICK_FREQUENCY = 4096;
const LED_BUTTON_OFF_TICK_FREQUENCY = 1024;
const LED_BUTTON_ON_TICK_FREQUENCY = 2048;
const SETTINGS_STORAGE_KEY = "caldera:circuit-settings:v1";
const buttonTickSound = new TickSound({ frequency: BUTTON_TICK_FREQUENCY });
const ledButtonOffTickSound = new TickSound({ frequency: LED_BUTTON_OFF_TICK_FREQUENCY });
const ledButtonOnTickSound = new TickSound({ frequency: LED_BUTTON_ON_TICK_FREQUENCY });
const model = new Model();
const webView = new WebView(model);
const storedSettings = readStoredSettings();
const initialCommandFlags = getInitialCommandFlags(storedSettings);
let lastManualWiperCommandKey = null;

webView.setCommandFlags(initialCommandFlags);

document.querySelector("#app").innerHTML = `
  <div class="app-layout">
    <section class="analysis-div" data-analysis-div>
      <div class="analysis-panel">
        <div class="analysis-panel__header">
          <div>
            <span class="analysis-panel__eyebrow">Caldera modelling</span>
            <h1>Data analysis</h1>
          </div>
          <div class="analysis-panel__header-actions">
            <button
              class="analysis-panel__button"
              type="button"
              data-analysis-copy-csv
            >
              Copy CSV
            </button>
            <button
              class="analysis-panel__button"
              type="button"
              data-analysis-copy-analysis
            >
              Copy analysis
            </button>
            <span class="analysis-panel__badge" data-analysis-badge>empty dataset</span>
          </div>
        </div>
        <div class="analysis-panel__body">
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
            <div class="analysis-breakdown analysis-gain-breakdown" data-analysis-gain-breakdown hidden></div>
            <div class="analysis-breakdown analysis-test1-breakdown" data-analysis-test1-breakdown hidden></div>
            <div class="analysis-todo analysis-panel__disabled">
              <span class="analysis-todo__title">Next calibration passes</span>
              <span>Fit offset endpoint voltages</span>
              <span>Fit gain intercept and slope</span>
              <span>Reject clipped output samples</span>
            </div>
          </aside>
          <div class="analysis-chart" data-analysis-chart></div>
        </div>
      </div>
    </section>
    <section class="circuit-div" data-circuit-div>
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

const analysisRoot = document.querySelector("[data-analysis-div]");
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
const hasHostTelemetry = Boolean(window.chrome?.webview);
const analysisPanel = new AnalysisPanel({ root: analysisRoot });
const circuitScene = new CircuitScene(sceneRoot, model, {
  onManualWiperInput: handleManualWiperInput,
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
new TestPanel({
  analysisPanel,
  commandFlags: commandFlagsControl,
  circuitScene,
  getHardwareWiperRevision: () => liveWiperRevision,
  getHardwareWipers: () => liveWipers,
  model,
  requireWiperAck: hasHostTelemetry,
  root: testPanelRoot,
  setLedState: (activeIds) => stateControl.setActiveIds(activeIds),
  updateWiperDebug,
  webView,
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
});
webView.postGetWipers();

updateWiperDebug(null, { applied: false });

webView.postReady();

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

function normaliseDebugLedState(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const state = Number(value);

  return Number.isFinite(state) && state >= 0
    ? Math.trunc(state) >>> 0
    : null;
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

function formatDebugValue(value) {
  const number = Number(value);

  return Number.isFinite(number) ? String(number) : "-";
}
