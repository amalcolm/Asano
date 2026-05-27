import { Sweep } from "../helpers/Sweep.js";

export const TEST1_WIPERS = Object.freeze({ top: 73, bot: 61, mid: 255, offset: 0, gain: 4 });
export const TEST1_LEDS_TO_TEST = Object.freeze(["RED1", "IR2"]);

export class Test1Sweep extends Sweep {
  constructor({
    ledsToTest = TEST1_LEDS_TO_TEST,
    setLedState = null,
    testWipers = TEST1_WIPERS,
    ...options
  }) {
    super(options);
    this.appliedLedKey = null;
    this.currentLedCombinationIndex = 0;
    this.currentTargetLedState = null;
    this.ledsToTest = Array.from(ledsToTest ?? [], normaliseLedId);
    this.ledCombinations = getLedCombinations(this.ledsToTest);
    this.setLedState = setLedState;
    this.testWipers = testWipers;
    this.updateButton();
  }

  start() {
    this.appliedLedKey = null;
    this.currentLedCombinationIndex = 0;
    super.start();
  }

  advanceSweep() {
    if (this.advanceMidSweep()) {
      this.beginCurrentPoint();
      return;
    }

    if (this.currentLedCombinationIndex < this.ledCombinations.length - 1) {
      this.currentLedCombinationIndex += 1;
      this.resetMidSweep();
      this.beginCurrentPoint();
      return;
    }

    this.stop("done");
  }

  applyCurrentWipers() {
    this.applyCurrentLedState();
    this.applyWipers({
      ...this.testWipers,
      mid: this.currentMid,
    });
  }

  applyCurrentLedState() {
    const activeLeds = this.getCurrentLedCombination();
    const ledKey = activeLeds.join("|");

    if (ledKey === this.appliedLedKey) {
      return;
    }

    this.currentTargetLedState = getKnownState(this.setLedState?.(activeLeds));
    this.appliedLedKey = ledKey;
  }

  hasHardwareAppliedTargetWipers() {
    if (!super.hasHardwareAppliedTargetWipers()) {
      return false;
    }

    if (this.currentTargetLedState === null) {
      return true;
    }

    return this.getHardwareLedState() === this.currentTargetLedState;
  }

  getCurrentLedCombination() {
    return this.ledCombinations[this.currentLedCombinationIndex] ?? [];
  }

  getCurrentLedMap() {
    const activeLeds = new Set(this.getCurrentLedCombination());

    return Object.fromEntries(
      this.ledsToTest.map((id) => [id, activeLeds.has(id)]),
    );
  }

  getCurrentLedLabel() {
    const activeLeds = this.getCurrentLedCombination();

    return activeLeds.length ? activeLeds.join("+") : "off";
  }

  getCurrentLedProgressLabel() {
    const activeLeds = this.getCurrentLedCombination();

    return activeLeds.length
      ? activeLeds.map(formatProgressLedId).join("+")
      : "off";
  }

  getSweepStatus() {
    return `T1 ${this.getCurrentLedProgressLabel()} m${this.currentMid}`;
  }

  getSampleSource() {
    return "test1";
  }

  getSampleContext() {
    return {
      ledLabel: this.getCurrentLedLabel(),
      leds: this.getCurrentLedMap(),
      ledState: this.getHardwareLedState() ?? this.currentTargetLedState,
      test: "Test1",
    };
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    this.button.textContent = this.timer ? "Stop Test1" : "Test1";
    this.button.dataset.running = String(Boolean(this.timer));
  }
}

function getLedCombinations(leds) {
  const ledCount = leds.length;
  const combinationCount = 2 ** ledCount;

  return Array.from({ length: combinationCount }, (_, mask) => (
    leds.filter((_, index) => Boolean(mask & (1 << index)))
  ));
}

function normaliseLedId(id) {
  return String(id ?? "").trim().toUpperCase();
}

function formatProgressLedId(id) {
  return String(id ?? "")
    .toUpperCase()
    .replace("RED", "R")
    .replace("IR", "I");
}

function getKnownState(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const state = Number(value);

  return Number.isFinite(state) && state >= 0
    ? Math.trunc(state) >>> 0
    : null;
}
