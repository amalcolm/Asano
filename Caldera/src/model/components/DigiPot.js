import { Digipot as DigiPotShape } from "../../scene/shapes/Digipot.js";
import { Constants } from "../Constants.js";
import { clampInt } from "../Utils.js";
import { isKnownVoltage } from "../voltage.js";

export const DIGIPOT_MIN = Constants.DIGIPOT_MIN;
export const DIGIPOT_MAX = Constants.DIGIPOT_MAX;
export const DIGIPOT_MIDPOINT = Constants.DIGIPOT_MIDPOINT;

export const DIGIPOT_RESISTANCE_OHMS = Constants.DIGIPOT_RESISTANCE_OHMS;


export class DigiPot {
  constructor({
    createShape = false,
    max = DIGIPOT_MAX,
    min = DIGIPOT_MIN,
    onChange = null,
    shape = null,
    wiper,
    sliderOnly = false,
    ...shapeOptions
  } = {}) {
    this.max = max;
    this.min = min;
    this.onChange = onChange;
    this.sliderOnly = sliderOnly;
    this.bottomInputVoltage = null;
    this.outputVoltage = null;
    this.outputValue = sliderOnly ? DIGIPOT_MIN : null;
    this.shape = null;
    this.topInputVoltage = null;
    this.value = clampInt(wiper ?? shapeOptions.value ?? DIGIPOT_MIDPOINT, this.min, this.max);
    this.evaluateSlider();

    if (shape) {
      this.connectShape(shape);
    } else if (createShape) {
      this.shape = new DigiPotShape({
        ...shapeOptions,
        model: this,
        value: this.value,
      });
    }
  }

  get wiper() {
    return this.value;
  }

  get topVoltage() {
    return this.topInputVoltage;
  }

  get bottomVoltage() {
    return this.bottomInputVoltage;
  }

  get wiperVoltage() {
    return this.outputVoltage;
  }

  get wiperValue() {
    return this.outputValue;
  }

  connectShape(shape) {
    this.shape = shape;

    if (shape.model !== this) {
      shape.setModel(this);
    } else {
      this.syncShape();
      this.syncShapeVoltages();
    }

    return this;
  }

  setInputVoltages({ bottom = this.bottomInputVoltage, top = this.topInputVoltage } = {}) {
    this.bottomInputVoltage = normaliseVoltage(bottom);
    this.topInputVoltage = normaliseVoltage(top);
    this.syncShapeVoltages();

    return this;
  }

  setOutputVoltage(voltage) {
    this.outputVoltage = normaliseVoltage(voltage);
    this.syncShapeVoltages();

    return this.outputVoltage;
  }

  setWiper(value, { emit = true, syncShape = true } = {}) {
    const previousValue = this.value;

    this.value = clampInt(value, this.min, this.max);
    this.evaluateSlider();

    if (syncShape) {
      this.syncShape();
    }

    if (emit && this.value !== previousValue) {
      this.emitChange(previousValue);
    }

    return this.value;
  }

  setWiperValue(value, options = {}) {
    return this.setWiper(value, options);
  }

  evaluateVoltage() {
    if (this.sliderOnly) {
      return this.evaluateSlider();
    }

    const topVoltage = this.topVoltage;
    const bottomVoltage = this.bottomVoltage;

    if (!isKnownVoltage(topVoltage) || !isKnownVoltage(bottomVoltage)) {
      this.setOutputVoltage(null);
    } else {
      const travel = this.value / this.max;
      this.setOutputVoltage(bottomVoltage + (topVoltage - bottomVoltage) * travel);
    }

    return this.outputVoltage;
  }

  evaluateSlider() {
    if (!this.sliderOnly) {
      return null;
    }

    this.outputValue = this.value;
    return this.outputValue;
  }

  syncShape() {
    this.shape?.syncWiperFromModel();
  }

  syncShapeVoltages() {
    if (!this.shape) {
      return;
    }

    if (this.shape.topInputPort) {
      this.shape.topInputPort.voltage = this.topInputVoltage;
    }

    if (this.shape.bottomInputPort) {
      this.shape.bottomInputPort.voltage = this.bottomInputVoltage;
    }

    if (this.shape.wiperPort) {
      this.shape.wiperPort.voltage = this.outputVoltage;
    }
  }

  emitChange(previousValue) {
    this.onChange?.({
      model: this,
      previousValue,
      value: this.value,
    });
  }

  snapshot() {
    return {
      bottomVoltage: this.bottomVoltage,
      outputValue: this.wiperValue,
      outputVoltage: this.wiperVoltage,
      sliderOnly: this.sliderOnly,
      topVoltage: this.topVoltage,
      wiper: this.wiper,
    };
  }
}

function normaliseVoltage(value) {
  return isKnownVoltage(value) ? value : null;
}


export function getPoweredDigipotTerminalVoltages({
  digipotResistanceOhms,
  groundResistanceOhms,
  groundVoltage,
  supplyResistanceOhms,
  supplyVoltage,
}) {
  const totalResistance = supplyResistanceOhms + digipotResistanceOhms + groundResistanceOhms;

  if (!isKnownVoltage(supplyVoltage) || !isKnownVoltage(groundVoltage) || totalResistance <= 0) {
    return { bottom: null, top: null };
  }

  const current = (supplyVoltage - groundVoltage) / totalResistance;
  const bottom = groundVoltage + current * groundResistanceOhms;
  const top = bottom + current * digipotResistanceOhms;

  return { bottom, top };
}

export class Slider extends DigiPot {
  constructor(options = {}) {
    super({ ...options, sliderOnly: true });
  }
}
