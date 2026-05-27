import Tests from "../helpers/Tests.js";
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

const MID_SWEEP_START = 16;
const MID_SWEEP_END = 240;
const MID_SWEEP_STEP = 32;
const OFFSET_RANGE_POINT_COUNT = 16;

export class Test3Sweep extends Sweep {
  constructor(options) {
    super(options);
    this.currentMidPoints = [];
    this.currentOffset = 0;
    this.offsetRangeTest = null;
    this.offsetSweepPoints = [];
    this.updateButton();
  }

  start() {
    this.currentMidPoints = createSteppedWiperPoints({
      end: MID_SWEEP_END,
      start: MID_SWEEP_START,
      step: MID_SWEEP_STEP,
    });
    this.currentMidIndex = 0;
    this.currentMid = this.currentMidPoints[0] ?? MID_SWEEP_START;
    this.currentOffset = 0;
    this.previousOffset = null;
    this.previousSensor2Average = null;
    super.start();
  }

  beginRangeTest() {
    this.offsetRangeTest = new Tests({
      pointCount: OFFSET_RANGE_POINT_COUNT,
      wiperId: "offset",
    });
    this.rangeTest = this.offsetRangeTest;
    this.offsetSweepPoints = [];
    this.previousOffset = null;
    this.previousSensor2Average = null;

    this.beginOffsetRangeTestProbe(this.offsetRangeTest.begin());
  }

  beginOffsetRangeTestProbe(probe) {
    if (!probe || probe.value === null || probe.value === undefined) {
      this.stop("fail");
      return;
    }

    this.mode = "range-test";
    this.currentOffset = probe.value;
    this.beginCurrentPoint();
  }

  recordRangeTestSample() {
    const result = this.offsetRangeTest?.record({
      max: this.sampleVoltageBounds?.sensor2?.max,
      min: this.sampleVoltageBounds?.sensor2?.min,
      sensor2: this.filteredVoltages?.sensor2,
    });

    if (!result || result.failed) {
      this.stop(result?.status || "fail");
      return;
    }

    if (!result.done) {
      this.beginOffsetRangeTestProbe(result.next);
      return;
    }

    this.beginOffsetSweepFromRange(result);
  }

  beginOffsetSweepFromRange(result) {
    this.offsetSweepPoints = Array.isArray(result.points) ? result.points : [];

    if (!this.offsetSweepPoints.length) {
      this.stop("fail");
      return;
    }

    this.mode = "sweep";
    this.offsetRangeTest = null;
    this.rangeTest = null;
    this.previousOffset = null;
    this.previousSensor2Average = null;
    this.resetOffsetSweep();
    this.beginCurrentPoint();
  }

  advanceSweep() {
    if (this.advanceOffsetSweep()) {
      this.beginCurrentPoint();
      return;
    }

    if (this.advanceFixedMidSweep()) {
      this.beginRangeTest();
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
    const sensor2Step = getKnownStep(this.previousOffset, this.currentOffset);
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
        hoverXLabel: "offset",
        hoverYLabel: "Sensor2 d/count",
        kind: "test3-delta",
        x: this.currentOffset,
        xLabel: "Offset wiper",
        y: sensor2Delta,
        yLabel: "Sensor2 delta / offset step (V/count)",
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
      this.previousOffset = this.currentOffset;
      this.previousSensor2Average = sensor2Average;
    }
  }

  getRequiredSampleCount() {
    return this.mode === "range-test"
      ? super.getRequiredSampleCount()
      : DISCARD_SAMPLE_COUNT + AVERAGE_SAMPLE_COUNT;
  }

  getSweepStatus() {
    return `T3 m${this.currentMid} o${this.currentOffset}`;
  }

  getRangeTestStatus() {
    const probe = this.offsetRangeTest?.getCurrentProbe?.();
    const probeStatus = probe?.status ? probe.status : "";

    return `r${probeStatus} m${this.currentMid} o${this.currentOffset}`;
  }

  getSampleSource() {
    return "test3";
  }

  getSampleContext() {
    return {
      ledState: this.getHardwareLedState(),
      test: "Test3",
    };
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    this.button.textContent = this.timer ? "Stop Test3" : "Test3";
    this.button.dataset.running = String(Boolean(this.timer));
  }

  resetOffsetSweep() {
    this.currentOffsetIndex = 0;
    this.currentOffset = this.offsetSweepPoints[0] ?? 0;
  }

  advanceOffsetSweep() {
    if (this.currentOffsetIndex >= this.offsetSweepPoints.length - 1) {
      return false;
    }

    this.currentOffsetIndex += 1;
    this.currentOffset = this.offsetSweepPoints[this.currentOffsetIndex];
    return true;
  }

  advanceFixedMidSweep() {
    if (this.currentMidIndex >= this.currentMidPoints.length - 1) {
      return false;
    }

    this.currentMidIndex += 1;
    this.currentMid = this.currentMidPoints[this.currentMidIndex];
    return true;
  }
}

function createSteppedWiperPoints({ start, end, step }) {
  const direction = end >= start ? 1 : -1;
  const delta = Math.max(1, Math.abs(Math.trunc(Number(step) || 1))) * direction;
  const points = [];

  for (let value = start; direction > 0 ? value <= end : value >= end; value += delta) {
    points.push(value);
  }

  return points;
}
