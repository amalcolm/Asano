import { GainSweep, OffsetSweep, Sweep } from "../helpers/Sweep.js";
import { Test1Sweep } from "../tests/Test1Sweep.js";
import { Test2Sweep } from "../tests/Test2Sweep.js";
import { Test3Sweep } from "../tests/Test3Sweep.js";
import { Test4Sweep } from "../tests/Test4Sweep.js";
import { DEFAULT_MODEL_MAPPING } from "./ModelMapping.js";

// Test naming convention:
// - Columns describe how the data is gathered: Single, Stacked, Calibration, or Custom.
// - Model rows describe why the data is gathered, such as Calibration.
// - Stable data attributes keep legacy sweep IDs separate from UI labels.
const TEST_PANEL_MODEL_MAPPING = DEFAULT_MODEL_MAPPING;

export const TEST_PANEL_HTML = `
  <div class="test-panel" data-test-panel>
    <div class="test-panel__header">
      <span>Tests</span>
    </div>
    <table class="test-panel__matrix" aria-label="Test selection">
      <tbody>
        <tr class="test-panel__matrix-row test-panel__matrix-row--heading">
          <th scope="col">Single</th>
          <th scope="col">Stacked</th>
          <th scope="col">Calibration</th>
          <th scope="col">Custom</th>
        </tr>
        <tr class="test-panel__matrix-row test-panel__matrix-row--buttons">
          <td>
            <div class="test-panel__actions">
              <button
                class="test-panel__button"
                type="button"
                data-mid-sweep-button
                data-test-id="mid"
                data-test-category="Single"
                data-test-name="Sweep mid"
              >
                Sweep mid
              </button>
            </div>
          </td>
          <td>
            <div class="test-panel__actions">
              <button
                class="test-panel__button"
                type="button"
                data-offset-sweep-button
                data-test-id="offset"
                data-test-category="Stacked"
                data-test-name="Sweep offset"
              >
                Sweep offset
              </button>
              <button
                class="test-panel__button"
                type="button"
                data-gain-sweep-button
                data-test-id="gain"
                data-test-category="Stacked"
                data-test-name="Sweep gain"
              >
                Sweep gain
              </button>
            </div>
          </td>
          <td>
            <div class="test-panel__actions">
              <button
                class="test-panel__button"
                type="button"
                data-test1-button
                data-test-id="test1"
                data-test-category="Calibration"
                data-test-name="Diff.Amp."
              >
                Diff.Amp.
              </button>
              <button
                class="test-panel__button"
                type="button"
                data-test4-button
                data-test-id="test4"
                data-test-category="Calibration"
                data-test-name="Mid Step"
              >
                Mid Step
              </button>
            </div>
          </td>
          <td>
            <div class="test-panel__actions">
              <button
                class="test-panel__button"
                type="button"
                data-test2-button
                data-test-id="test2"
                data-test-category="Custom"
                data-test-name="Test2"
              >
                Test2
              </button>
              <button
                class="test-panel__button"
                type="button"
                data-test3-button
                data-test-id="test3"
                data-test-category="Custom"
                data-test-name="Test3"
              >
                Test3
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="test-panel__sequence">
      <select
        class="test-panel__select"
        aria-label="Available hardware state sets"
        data-test-sequence-select
      ></select>
      <button
        class="test-panel__button test-panel__button--load"
        type="button"
        data-load-test-sequence
      >
        Load States
      </button>
    </div>
    <div class="test-panel__footer">
      <span data-test-status>idle</span>
    </div>
  </div>
`;

export class TestPanel {
  constructor({
    analysisPanel,
    commandFlags,
    circuitScene,
    getHardwareWiperRevision = null,
    getHardwareWipers = null,
    model,
    requireWiperAck = false,
    root,
    setLedState = null,
    onStatus = null,
    onTestStart = null,
    updateWiperDebug,
    webView,
  }) {
    this.analysisPanel = analysisPanel;
    this.onStatus = onStatus;
    this.onTestStart = onTestStart;
    this.root = root;
    this.status = root?.querySelector("[data-test-status]");
    this.webView = webView;
    this.sequenceSelect = root?.querySelector("[data-test-sequence-select]");
    this.loadSequenceButton = root?.querySelector("[data-load-test-sequence]");
    this.sweeps = [];
    this.sweepsById = new Map();

    const commonOptions = {
      commandFlags,
      circuitScene,
      getHardwareWiperRevision,
      getHardwareWipers,
      model,
      onSample: (sampleContext) => this.analysisPanel.addSampleFromModel(sampleContext),
      onStatus: (status, sweep) => this.handleStatus(status, sweep),
      requireWiperAck,
      status: this.status,
      updateWiperDebug,
      webView,
    };

    const midSweepButton = root?.querySelector("[data-mid-sweep-button]");
    const offsetSweepButton = root?.querySelector("[data-offset-sweep-button]");
    const gainSweepButton = root?.querySelector("[data-gain-sweep-button]");
    const test1Button = root?.querySelector("[data-test1-button]");
    const test2Button = root?.querySelector("[data-test2-button]");
    const test3Button = root?.querySelector("[data-test3-button]");
    const test4Button = root?.querySelector("[data-test4-button]");

    this.midSweep = new Sweep({
      ...commonOptions,
      button: midSweepButton,
      onClear: () => this.analysisPanel.clear(getButtonDatasetOptions(midSweepButton)),
      onStart: () => this.handleStart(this.midSweep),
    });
    this.offsetSweep = new OffsetSweep({
      ...commonOptions,
      button: offsetSweepButton,
      onClear: () => this.analysisPanel.clear(getButtonDatasetOptions(offsetSweepButton)),
      onStart: () => this.handleStart(this.offsetSweep),
    });
    this.gainSweep = new GainSweep({
      ...commonOptions,
      button: gainSweepButton,
      onClear: () => this.analysisPanel.clear({
        ...getButtonDatasetOptions(gainSweepButton),
        panel: "gain",
      }),
      onStart: () => this.handleStart(this.gainSweep),
    });
    this.test1Sweep = new Test1Sweep({
      ...commonOptions,
      button: test1Button,
      onClear: () => this.analysisPanel.clear({
        ...getButtonDatasetOptions(test1Button),
        panel: "test1",
      }),
      onStart: () => this.handleStart(this.test1Sweep),
      setLedState,
    });
    this.test2Sweep = new Test2Sweep({
      ...commonOptions,
      button: test2Button,
      onClear: () => this.analysisPanel.clear(getButtonDatasetOptions(test2Button)),
      onStart: () => this.handleStart(this.test2Sweep),
    });
    this.test3Sweep = new Test3Sweep({
      ...commonOptions,
      button: test3Button,
      onClear: () => this.analysisPanel.clear(getButtonDatasetOptions(test3Button)),
      onStart: () => this.handleStart(this.test3Sweep),
    });
    this.test4Sweep = new Test4Sweep({
      ...commonOptions,
      button: test4Button,
      onClear: () => this.analysisPanel.clear(getButtonDatasetOptions(test4Button)),
      onStart: () => this.handleStart(this.test4Sweep),
    });
    this.sweeps = [
      this.midSweep,
      this.offsetSweep,
      this.gainSweep,
      this.test1Sweep,
      this.test2Sweep,
      this.test3Sweep,
      this.test4Sweep,
    ];
    this.sweepsById = new Map([
      ["mid", this.midSweep],
      ["offset", this.offsetSweep],
      ["gain", this.gainSweep],
      ["test1", this.test1Sweep],
      ["test2", this.test2Sweep],
      ["test3", this.test3Sweep],
      ["test4", this.test4Sweep],
    ]);

    this.sequenceSelect?.addEventListener("change", () => this.updateLoadSequenceButtonState());
    this.loadSequenceButton?.addEventListener("click", () => this.loadSelectedTestSequence());
    this.syncTestSequenceOptions();
    webView?.on("hostConfig", () => this.syncTestSequenceOptions());
  }

  startTest(testId) {
    const sweep = this.getSweep(testId);

    if (!sweep) {
      return false;
    }

    if (!sweep.timer) {
      sweep.start();
    }

    return true;
  }

  stopTest(testId = null) {
    const sweep = testId ? this.getSweep(testId) : null;

    if (sweep) {
      sweep.stop("stopped");
      return true;
    }

    this.sweeps.forEach((item) => item?.stop("stopped"));
    return true;
  }

  handleStart(activeSweep) {
    this.onTestStart?.({
      test: this.getSweepId(activeSweep),
    });
    this.stopOtherSweeps(activeSweep);
  }

  stopOtherSweeps(activeSweep) {
    this.sweeps.forEach((sweep) => {
      if (sweep && sweep !== activeSweep) {
        sweep.stop("idle");
      }
    });
  }

  getSweep(testId) {
    return this.sweepsById.get(String(testId ?? "").toLowerCase()) ?? null;
  }

  handleStatus(status, sweep) {
    this.onStatus?.({
      mode: sweep?.mode ?? "idle",
      rangeCheck: sweep?.mode === "range-test",
      running: Boolean(sweep?.timer),
      status,
      test: this.getSweepId(sweep),
    });
  }

  getSweepId(sweep) {
    for (const [id, item] of this.sweepsById) {
      if (item === sweep) {
        return id;
      }
    }

    return null;
  }

  syncTestSequenceOptions() {
    if (!this.sequenceSelect || !this.loadSequenceButton) {
      return;
    }

    const selectedName = this.sequenceSelect.value;
    const sequences = getHostTestSequences(this.webView);

    this.sequenceSelect.replaceChildren();

    if (sequences.length === 0) {
      this.sequenceSelect.append(new Option("No hardware states", ""));
      this.sequenceSelect.disabled = true;
      this.loadSequenceButton.disabled = true;
      return;
    }

    this.sequenceSelect.append(new Option("Please select test set...", ""));

    for (const sequence of sequences) {
      this.sequenceSelect.append(new Option(sequence.name, sequence.name));
    }

    if (selectedName && sequences.some((sequence) => sequence.name === selectedName)) {
      this.sequenceSelect.value = selectedName;
    }

    this.sequenceSelect.disabled = false;
    this.updateLoadSequenceButtonState();
  }

  updateLoadSequenceButtonState() {
    if (!this.loadSequenceButton) {
      return;
    }

    this.loadSequenceButton.disabled = !this.sequenceSelect?.value;
  }

  loadSelectedTestSequence() {
    const name = this.sequenceSelect?.value;
    if (!name) {
      return false;
    }

    this.stopTest();

    const posted = this.webView?.postLoadTestSequence({ name }) ?? false;
    if (this.status) {
      this.status.textContent = posted ? `loading ${name}` : "host unavailable";
    }

    return posted;
  }
}

function getHostTestSequences(webView) {
  const sequences = webView?.hostConfig?.testSequences;
  return Array.isArray(sequences)
    ? sequences.filter((sequence) => sequence?.name)
    : [];
}

function getButtonLabel(button) {
  const label = String(button?.textContent ?? "").replace(/\s+/g, " ").trim();

  return label.replace(/^Stop\s+/i, "") || null;
}

function getButtonDatasetOptions(button) {
  const mappedDataset = TEST_PANEL_MODEL_MAPPING.resolveDataset({
    category: button?.dataset.testCategory,
    name: button?.dataset.testName ?? getButtonLabel(button),
    testId: button?.dataset.testId,
  });

  return {
    category: mappedDataset.category,
    label: mappedDataset.label,
    name: mappedDataset.name,
    source: mappedDataset.source,
    testId: mappedDataset.testId,
  };
}
