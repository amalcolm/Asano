import { isKnownVoltage } from "../../voltage.js";
import { getPoweredDigipotTerminalVoltages } from "../DigiPot.js";
import { Constants } from "../../Constants.js";

const DEFAULT_OFFSET_TERMINALS = getPoweredDigipotTerminalVoltages(Constants.OFFSET_RAILS);
const DEFAULT_OFFSET_LOW_V = DEFAULT_OFFSET_TERMINALS.bottom;
const DEFAULT_OFFSET_HIGH_V = DEFAULT_OFFSET_TERMINALS.top;
const DEFAULT_OFFSET_TRIM_V = Constants.DIFFERENTIAL_AMP.sensorOffsetTrimV;
const DEFAULT_OFFSET_LOW_CORRECTION_V = Constants.DIFFERENTIAL_AMP.sensorOffsetLowCorrectionV;
const DEFAULT_OFFSET_HIGH_CORRECTION_V = Constants.DIFFERENTIAL_AMP.sensorOffsetHighCorrectionV;
const DEFAULT_WIPER_MIN = Constants.DIGIPOT_MIN;
const DEFAULT_WIPER_MAX = Constants.DIGIPOT_MAX;
const DEFAULT_FIXED_GAIN_RATIO = Constants.DIFFERENTIAL_AMP.sensorFixedGainRatio;
const DEFAULT_VARIABLE_GAIN_RATIO = Constants.DIFFERENTIAL_AMP.sensorVariableGainRatio;

export class DifferentialAmpSensorModel {
  constructor({
    disabled = false,
    fixedGainRatio = DEFAULT_FIXED_GAIN_RATIO,
    offsetHighCorrectionV = DEFAULT_OFFSET_HIGH_CORRECTION_V,
    offsetHighV = DEFAULT_OFFSET_HIGH_V,
    offsetLowCorrectionV = DEFAULT_OFFSET_LOW_CORRECTION_V,
    offsetLowV = DEFAULT_OFFSET_LOW_V,
    offsetTrimV = DEFAULT_OFFSET_TRIM_V,
    physicsConstants = null,
    variableGainRatio = DEFAULT_VARIABLE_GAIN_RATIO,
    wiperMax = DEFAULT_WIPER_MAX,
    wiperMin = DEFAULT_WIPER_MIN,
  } = {}) {
    this.disabled = disabled === true;
    this.fixedGainRatio = fixedGainRatio;
    this.offsetHighCorrectionV = offsetHighCorrectionV;
    this.offsetHighV = offsetHighV;
    this.offsetLowCorrectionV = offsetLowCorrectionV;
    this.offsetLowV = offsetLowV;
    this.offsetTrimV = offsetTrimV;
    this.physicsConstants = normalisePhysicsConstants(physicsConstants);
    this.variableGainRatio = variableGainRatio;
    this.wiperMax = wiperMax;
    this.wiperMin = wiperMin;
  }

  getSensorErrorVoltages(model) {
    const readings = this.getSensorErrorReadings(model);

    return {
      sensor1: readings.sensor1.errorVoltage,
      sensor2: readings.sensor2.errorVoltage,
    };
  }

  getSensorErrorReadings(model) {
    const gainWiper = model.gain?.wiper;
    const offsetWiper = model.offset?.wiper;
    const sensor1Voltage = model.sensor1Voltage;
    const sensor2Voltage = model.sensor2Voltage;
    const sensor1PredictedVoltage = this.sensor1FromSensor2(
      sensor2Voltage,
      gainWiper,
      offsetWiper,
    );
    const sensor2PredictedVoltage = this.sensor2FromSensor1(
      sensor1Voltage,
      gainWiper,
      offsetWiper,
    );

    return {
      sensor1: this.getSensorErrorReading(sensor1PredictedVoltage, sensor1Voltage, {
        sourceVoltage: sensor2Voltage,
      }),
      sensor2: this.getSensorErrorReading(sensor2PredictedVoltage, sensor2Voltage, {
        sourceVoltage: sensor1Voltage,
      }),
    };
  }

  getSensorErrorReading(modeledVoltage, measuredVoltage, { sourceVoltage } = {}) {
    return {
      errorVoltage: this.getSensorErrorVoltage(modeledVoltage, measuredVoltage),
      measuredVoltage,
      predictedVoltage: modeledVoltage,
      sourceVoltage,
    };
  }

  getSensorErrorVoltage(modeledVoltage, measuredVoltage) {
    if (!isKnownVoltage(modeledVoltage) || !isKnownVoltage(measuredVoltage)) {
      return null;
    }

    return modeledVoltage - measuredVoltage;
  }

  offsetVoltageFromWiper(offsetWiper) {
    if (this.disabled) {
      return null;
    }

    offsetWiper = this.clampWiper(Number(offsetWiper));

    if (this.physicsConstants) {
      const {
        digipotResistanceOhms,
        offsetBottomResistanceOhms,
        offsetTopResistanceOhms,
        supplyVoltage,
        wiperMax,
      } = this.physicsConstants;
      const offsetResistance = digipotResistanceOhms * offsetWiper / wiperMax;
      const totalResistance = offsetTopResistanceOhms
        + digipotResistanceOhms
        + offsetBottomResistanceOhms;

      return supplyVoltage * (offsetBottomResistanceOhms + offsetResistance) / totalResistance;
    }

    return this.offsetLowV
      + offsetWiper * (this.offsetHighV - this.offsetLowV) / this.wiperMax
      + this.offsetTrimV
      + this.offsetCorrectionFromWiper(offsetWiper);
  }

  offsetCorrectionFromWiper(offsetWiper) {
    if (this.disabled) {
      return null;
    }

    offsetWiper = this.clampWiper(Number(offsetWiper));

    return this.offsetLowCorrectionV
      + offsetWiper * (this.offsetHighCorrectionV - this.offsetLowCorrectionV) / this.wiperMax;
  }

  gainRatioFromWiper(gainWiper) {
    if (this.disabled) {
      return null;
    }

    gainWiper = this.clampWiper(Number(gainWiper));

    if (this.physicsConstants) {
      const {
        fixedFeedbackResistanceOhms,
        gainZeroResidualResistanceOhms,
        sourceResistanceOhms,
        variableFeedbackResistanceOhms,
        wiperMax,
      } = this.physicsConstants;
      const feedbackResistance = fixedFeedbackResistanceOhms
        + gainZeroResidualResistanceOhms
        + variableFeedbackResistanceOhms * gainWiper / wiperMax;

      return feedbackResistance / sourceResistanceOhms;
    }

    return this.fixedGainRatio + gainWiper * this.variableGainRatio / this.wiperMax;
  }

  sensor2FromSensor1(sensor1V, gainWiper, offsetWiper) {
    if (!isKnownVoltage(sensor1V)) {
      return null;
    }

    const offsetV = this.offsetVoltageFromWiper(offsetWiper);
    const gainRatio = this.gainRatioFromWiper(gainWiper);

    if (!isKnownVoltage(offsetV) || !isKnownVoltage(gainRatio)) {
      return null;
    }

    return offsetV + gainRatio * (offsetV - sensor1V);
  }

  sensor1FromSensor2(sensor2V, gainWiper, offsetWiper) {
    if (!isKnownVoltage(sensor2V)) {
      return null;
    }

    const offsetV = this.offsetVoltageFromWiper(offsetWiper);
    const gainRatio = this.gainRatioFromWiper(gainWiper);

    if (!isKnownVoltage(offsetV) || !isKnownVoltage(gainRatio) || gainRatio === 0) {
      return null;
    }

    return offsetV - (sensor2V - offsetV) / gainRatio;
  }

  clampWiper(value) {
    return Math.max(this.wiperMin, Math.min(this.wiperMax, value));
  }
}

function normalisePhysicsConstants(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const constants = {
    digipotResistanceOhms: getPositiveNumber(value.digipotResistanceOhms),
    fixedFeedbackResistanceOhms: getPositiveNumber(value.fixedFeedbackResistanceOhms),
    gainZeroResidualResistanceOhms: getKnownNumber(value.gainZeroResidualResistanceOhms),
    offsetBottomResistanceOhms: getPositiveNumber(value.offsetBottomResistanceOhms),
    offsetTopResistanceOhms: getPositiveNumber(value.offsetTopResistanceOhms),
    sourceResistanceOhms: getPositiveNumber(value.sourceResistanceOhms),
    supplyVoltage: getPositiveNumber(value.supplyVoltage),
    variableFeedbackResistanceOhms: getPositiveNumber(value.variableFeedbackResistanceOhms),
    wiperMax: getPositiveNumber(value.wiperMax),
  };

  return Object.values(constants).every(Number.isFinite) ? constants : null;
}

function getKnownNumber(value) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getPositiveNumber(value) {
  const number = getKnownNumber(value);

  return Number.isFinite(number) && number > 0 ? number : null;
}
