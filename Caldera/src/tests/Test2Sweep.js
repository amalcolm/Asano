import { Sweep } from "../helpers/Sweep.js";
import {
  addVoltageAverageSample,
  AVERAGE_SAMPLE_COUNT,
  beginVoltageAverage,
  DISCARD_SAMPLE_COUNT,
  getKnownStep,
  getKnownVoltage,
  getVoltageAverage,
} from "./DeltaSweepHelpers.js";

export const OFFSET_SWEEP_START = 16;
export const OFFSET_SWEEP_END = 240;
export const OFFSET_SWEEP_STEP = 32;

export class Test2Sweep extends Sweep {
  constructor(options) {
    super(options);
    this.currentOffset = OFFSET_SWEEP_START;
    this.updateButton();
  }

  start() {
    this.currentOffset = OFFSET_SWEEP_START;
    this.previousMid = null;
    this.previousSensor2Average = null;
    super.start();
  }

  advanceSweep() {
    if (this.advanceMidSweep()) {
      this.beginCurrentPoint();
      return;
    }

    if (this.currentOffset < OFFSET_SWEEP_END) {
      this.currentOffset = Math.min(this.currentOffset + OFFSET_SWEEP_STEP, OFFSET_SWEEP_END);
      this.previousMid = null;
      this.previousSensor2Average = null;
      this.resetMidSweep();
      this.beginCurrentPoint();
      return;
    }

    this.stop("done");
  }

  applyCurrentWipers() {
    this.applyWipers({
      mid: this.currentMid,
      offset: this.currentOffset,
    });
  }

  captureFilterSample() {
    if (this.mode === "range-test") {
      return super.captureFilterSample();
    }

    if (!this.wiperAcknowledged) {
      if (!this.hasHardwareAppliedTargetWipers()) {
        this.updateStatus(`${this.getPointStatus()} ack`);
        return false;
      }

      this.wiperAcknowledged = true;
      this.updateStatus(`${this.getPointStatus()} set`);
      return "settling";
    }

    const voltages = this.readVoltages();

    this.sampleCount += 1;

    if (this.sampleCount <= DISCARD_SAMPLE_COUNT) {
      this.updateStatus(
        `${this.getPointStatus()} d${this.sampleCount}/${DISCARD_SAMPLE_COUNT}`,
      );
      return false;
    }

    const averageSampleIndex = this.sampleCount - DISCARD_SAMPLE_COUNT;
    if (averageSampleIndex === 1) {
      this.voltageAverage = beginVoltageAverage();
    }

    this.voltageAverage = addVoltageAverageSample(this.voltageAverage, voltages);
    this.filteredVoltages = getVoltageAverage(this.voltageAverage);

    this.updateStatus(
      `${this.getPointStatus()} s${averageSampleIndex}/${AVERAGE_SAMPLE_COUNT}`,
    );

    if (this.sampleCount >= this.getRequiredSampleCount()) {
      this.addSample(this.filteredVoltages);
    }

    return true;
  }

  addSample(sensorVoltages) {
    const sensor1Average = getKnownVoltage(sensorVoltages?.sensor1);
    const sensor2Average = getKnownVoltage(sensorVoltages?.sensor2);
    const sensor2Step = getKnownStep(this.previousMid, this.currentMid);
    const sensor2Previous = this.previousSensor2Average;
    const sensor2RawDelta = Number.isFinite(sensor2Average) && Number.isFinite(sensor2Previous)
      ? sensor2Average - sensor2Previous
      : null;
    const sensor2Delta = Number.isFinite(sensor2RawDelta) && Number.isFinite(sensor2Step)
      ? sensor2RawDelta / sensor2Step
      : null;

    this.onSample?.({
      circuitScene: this.circuitScene,
      model: this.model,
      plot: {
        hoverXLabel: "mid",
        hoverYLabel: "Sensor2 d/count",
        kind: "test2-delta",
        x: this.currentMid,
        xLabel: "Mid wiper",
        y: sensor2Delta,
        yLabel: "Sensor2 delta / mid step (V/count)",
      },
      sampleCount: AVERAGE_SAMPLE_COUNT,
      sampleIndex: AVERAGE_SAMPLE_COUNT,
      samplesAveraged: AVERAGE_SAMPLE_COUNT,
      samplesIgnored: DISCARD_SAMPLE_COUNT,
      sensor2Average,
      sensor2Delta,
      sensor2Previous,
      sensor2RawDelta,
      sensor2Step,
      sensorVoltages: {
        sensor1: sensor1Average,
        sensor2: sensor2Average,
      },
      source: this.getSampleSource(),
      ...this.getSampleContext(),
    });

    if (Number.isFinite(sensor2Average)) {
      this.previousMid = this.currentMid;
      this.previousSensor2Average = sensor2Average;
    }
  }

  getRequiredSampleCount() {
    return this.mode === "range-test"
      ? super.getRequiredSampleCount()
      : DISCARD_SAMPLE_COUNT + AVERAGE_SAMPLE_COUNT;
  }

  getSweepStatus() {
    return `T2 o${this.currentOffset} m${this.currentMid}`;
  }

  getSampleSource() {
    return "test2";
  }

  getSampleContext() {
    return {
      ledState: this.getHardwareLedState(),
      test: "Test2",
    };
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    this.button.textContent = this.timer ? "Stop Test2" : "Test2";
    this.button.dataset.running = String(Boolean(this.timer));
  }
}
