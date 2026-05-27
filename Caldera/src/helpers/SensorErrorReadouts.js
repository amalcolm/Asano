import { isKnownVoltage, isValidSensorVoltage } from "../model/voltage.js";

const DEFAULT_PLUS_WIDTH = 0.082;
const DEFAULT_MINUS_WIDTH = 0.056;

export class SensorErrorReadouts {
  constructor({
    minusWidth = DEFAULT_MINUS_WIDTH,
    plusWidth = DEFAULT_PLUS_WIDTH,
    unknownText = "---",
  } = {}) {
    this.minusWidth = minusWidth;
    this.plusWidth = plusWidth;
    this.readoutById = new Map();
    this.baseXById = new Map();
    this.unknownText = unknownText;

    this.formatSignedVoltage = this.formatSignedVoltage.bind(this);
  }

  register(id, readout, baseX) {
    this.readoutById.set(id, readout);
    this.baseXById.set(id, baseX);

    return readout;
  }

  getPosition(baseX, y, { value = 0, z = 0 } = {}) {
    return [this.getX(baseX, value), y, z];
  }

  setVoltage(id, voltage, {
    measuredVoltage,
    predictedVoltage,
    sourceVoltage,
  } = {}) {
    const readout = this.readoutById.get(id);
    const baseX = this.baseXById.get(id);
    const displayVoltage = getPrintableErrorVoltage(voltage, {
      measuredVoltage,
      predictedVoltage,
      sourceVoltage,
    });

    if (!readout) {
      return;
    }

    if (Number.isFinite(baseX)) {
      readout.position.x = this.getX(baseX, displayVoltage);
    }

    readout.setDisplayVoltage(displayVoltage);
  }

  getX(baseX, value) {
    return baseX - this.getPrefixWidth(value);
  }

  getPrefixWidth(value) {
    return Number(value) < 0
      ? this.minusWidth
      : this.plusWidth;
  }

  formatSignedVoltage(value) {
    if (!isKnownVoltage(value)) {
      return this.unknownText;
    }

    return `${value >= 0 ? "+" : ""}${value.toFixed(3)} V`;
  }
}

function getPrintableErrorVoltage(errorVoltage, {
  measuredVoltage,
  predictedVoltage,
  sourceVoltage,
} = {}) {
  if (!isKnownVoltage(errorVoltage)) {
    return null;
  }

  if (!isPrintableSensorVoltage(predictedVoltage)) {
    return null;
  }

  if (!isPrintableSensorVoltage(measuredVoltage)) {
    return null;
  }

  if (!isPrintableSensorVoltage(sourceVoltage)) {
    return null;
  }

  return errorVoltage;
}

function isPrintableSensorVoltage(voltage) {
  return voltage === undefined || isValidSensorVoltage(voltage);
}
