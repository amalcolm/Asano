import { GainSweep, OffsetSweep, Sweep } from "../helpers/Sweep.js";
import { Test1Sweep } from "../tests/Test1Sweep.js";
import { Test2Sweep } from "../tests/Test2Sweep.js";
import { Test3Sweep } from "../tests/Test3Sweep.js";
import { Test4Sweep } from "../tests/Test4Sweep.js";

export const TEST_PANEL_HTML = `
  <div class="test-panel" data-test-panel>
    <div class="test-panel__header">
      <span>Analsies</span>
    </div>
    <div class="test-panel__groups">
      <section class="test-panel__group">
        <h2 class="test-panel__group-title">Single</h2>
        <div class="test-panel__actions">
          <button class="test-panel__button" type="button" data-mid-sweep-button>
            Sweep mid
          </button>
        </div>
      </section>
      <section class="test-panel__group">
        <h2 class="test-panel__group-title">Stacked</h2>
        <div class="test-panel__actions">
          <button class="test-panel__button" type="button" data-offset-sweep-button>
            Sweep offset
          </button>
          <button class="test-panel__button" type="button" data-gain-sweep-button>
            Sweep gain
          </button>
        </div>
      </section>
      <section class="test-panel__group">
        <h2 class="test-panel__group-title">Custom</h2>
        <div class="test-panel__actions">
          <button class="test-panel__button" type="button" data-test1-button>
            Test1
          </button>
          <button class="test-panel__button" type="button" data-test2-button>
            Test2
          </button>
          <button class="test-panel__button" type="button" data-test3-button>
            Test3
          </button>
          <button class="test-panel__button" type="button" data-test4-button>
            Test4
          </button>
        </div>
      </section>
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
      onClear: () => this.analysisPanel.clear({ label: getButtonLabel(midSweepButton) }),
      onStart: () => this.handleStart(this.midSweep),
    });
    this.offsetSweep = new OffsetSweep({
      ...commonOptions,
      button: offsetSweepButton,
      onClear: () => this.analysisPanel.clear({ label: getButtonLabel(offsetSweepButton) }),
      onStart: () => this.handleStart(this.offsetSweep),
    });
    this.gainSweep = new GainSweep({
      ...commonOptions,
      button: gainSweepButton,
      onClear: () => this.analysisPanel.clear({
        label: getButtonLabel(gainSweepButton),
        panel: "gain",
      }),
      onStart: () => this.handleStart(this.gainSweep),
    });
    this.test1Sweep = new Test1Sweep({
      ...commonOptions,
      button: test1Button,
      onClear: () => this.analysisPanel.clear({
        label: getButtonLabel(test1Button),
        panel: "test1",
      }),
      onStart: () => this.handleStart(this.test1Sweep),
      setLedState,
    });
    this.test2Sweep = new Test2Sweep({
      ...commonOptions,
      button: test2Button,
      onClear: () => this.analysisPanel.clear({ label: getButtonLabel(test2Button) }),
      onStart: () => this.handleStart(this.test2Sweep),
    });
    this.test3Sweep = new Test3Sweep({
      ...commonOptions,
      button: test3Button,
      onClear: () => this.analysisPanel.clear({ label: getButtonLabel(test3Button) }),
      onStart: () => this.handleStart(this.test3Sweep),
    });
    this.test4Sweep = new Test4Sweep({
      ...commonOptions,
      button: test4Button,
      onClear: () => this.analysisPanel.clear({ label: getButtonLabel(test4Button) }),
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
}

function getButtonLabel(button) {
  const label = String(button?.textContent ?? "").replace(/\s+/g, " ").trim();

  return label.replace(/^Stop\s+/i, "") || null;
}
