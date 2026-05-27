import { WiperRangeCalibrator } from "./WiperRangeCalibrator.js";
import {
  VALID_SENSOR_MAX_V,
  VALID_SENSOR_MIN_V,
  isKnownVoltage,
  isValidSensorVoltage,
} from "../model/voltage.js";

export const DEFAULT_SWEEP_POINT_COUNT = 29;
export const MAX_BOUNDS_SAMPLE_SPREAD_V = 0.1;

export default class Tests {
  constructor({
    end = 255,
    pointCount = DEFAULT_SWEEP_POINT_COUNT,
    start = 0,
    wiperId = "mid",
  } = {}) {
    this.calibrator = new WiperRangeCalibrator({
      end,
      pointCount,
      start,
      wiperId,
    });
  }

  begin() {
    return this.formatProbe(this.calibrator.begin());
  }

  record(reading) {
    return this.formatResult(
      this.calibrator.record(Tests.classifySensorVoltage(reading)),
    );
  }

  getCurrentProbe() {
    return this.formatProbe(this.calibrator.getCurrentProbe());
  }

  formatProbe(probe) {
    if (!probe) {
      return probe;
    }

    return {
      ...probe,
      status: getProbeStatus(this.calibrator.search?.phase),
    };
  }

  formatResult(result) {
    if (!result) {
      return result;
    }

    const next = result.next ? this.formatProbe(result.next) : null;

    return {
      ...result,
      max: result.upperBound ?? null,
      min: result.lowerBound ?? null,
      next,
      status: result.failed
        ? "fail"
        : getResultStatus(result, this.calibrator.search?.phase),
    };
  }

  static classifySensorVoltage(reading) {
    const voltage = getReadingVoltage(reading);

    if (getReadingSpread(reading) > MAX_BOUNDS_SAMPLE_SPREAD_V) {
      return getInvalidReadingSide(reading, voltage);
    }

    if (isValidSensorVoltage(voltage)) {
      return "valid";
    }

    if (!isKnownVoltage(voltage)) {
      return "invalid";
    }

    return voltage < VALID_SENSOR_MIN_V || voltage > VALID_SENSOR_MAX_V
      ? getInvalidVoltageSide(voltage)
      : "invalid";
  }
}

function getProbeStatus(phase) {
  switch (phase) {
    case "lower-start":
    case "lower-end":
    case "upper-end":
      return "chk";

    case "anchor-directed":
    case "anchor-binary":
      return "find";

    case "lower-binary":
      return "min";

    case "upper-binary":
      return "max";

    default:
      return "chk";
  }
}

function getResultStatus(result, phase) {
  if (result.done) {
    const min = result.lowerBound ?? null;
    const max = result.upperBound ?? null;

    return min === null || max === null ? "ok" : `r${min}-${max}`;
  }

  return getProbeStatus(phase);
}

function getReadingVoltage(reading) {
  if (reading && typeof reading === "object") {
    return getKnownVoltage(reading.sensor2 ?? reading.voltage ?? reading.value ?? reading.sensor1);
  }

  return getKnownVoltage(reading);
}

function getReadingSpread(reading) {
  if (!reading || typeof reading !== "object") {
    return 0;
  }

  const min = getKnownVoltage(reading.min ?? reading.sensor2Min ?? reading.voltageMin);
  const max = getKnownVoltage(reading.max ?? reading.sensor2Max ?? reading.voltageMax);

  return Number.isFinite(min) && Number.isFinite(max)
    ? Math.abs(max - min)
    : 0;
}

function getInvalidReadingSide(reading, voltage) {
  const min = getKnownVoltage(reading?.min ?? reading?.sensor2Min ?? reading?.voltageMin);
  const max = getKnownVoltage(reading?.max ?? reading?.sensor2Max ?? reading?.voltageMax);

  if (Number.isFinite(min) && min < VALID_SENSOR_MIN_V) {
    return Number.isFinite(max) && max > VALID_SENSOR_MAX_V ? "invalid" : "low";
  }

  if (Number.isFinite(max) && max > VALID_SENSOR_MAX_V) {
    return "high";
  }

  return isKnownVoltage(voltage) ? getInvalidVoltageSide(voltage) : "invalid";
}

function getInvalidVoltageSide(voltage) {
  if (voltage < VALID_SENSOR_MIN_V) {
    return "low";
  }

  if (voltage > VALID_SENSOR_MAX_V) {
    return "high";
  }

  return "invalid";
}

function getKnownVoltage(value) {
  const voltage = Number(value);

  return Number.isFinite(voltage) ? voltage : null;
}
