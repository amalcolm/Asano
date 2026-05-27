import { isKnownVoltage } from "../model/voltage.js";
import { getPoweredDigipotTerminalVoltages } from "../model/components/DigiPot.js";
import { Constants } from "../model/Constants.js";

const DEFAULT_OFFSET_TERMINALS = getPoweredDigipotTerminalVoltages(Constants.OFFSET_RAILS);
const DEFAULT_CIRCUIT_OFFSET_TERMINALS = getPoweredDigipotTerminalVoltages(
  Constants.DIFFERENTIAL_AMP.calibratedOffsetRails,
);
const DEFAULT_CIRCUIT_FIXED_FEEDBACK_RESISTANCE_OHMS =
  Constants.DIFFERENTIAL_AMP.calibratedFixedFeedbackResistanceOhms;
const DEFAULT_CIRCUIT_OFFSET_LOW_V = DEFAULT_CIRCUIT_OFFSET_TERMINALS.bottom;
const DEFAULT_CIRCUIT_OFFSET_HIGH_V = DEFAULT_CIRCUIT_OFFSET_TERMINALS.top;
const DEFAULT_CIRCUIT_SOURCE_RESISTANCE_OHMS =
  Constants.DIFFERENTIAL_AMP.calibratedSourceResistanceOhms;
const DEFAULT_CIRCUIT_VARIABLE_FEEDBACK_RESISTANCE_OHMS =
  Constants.DIFFERENTIAL_AMP.calibratedVariableFeedbackResistanceOhms;
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
    circuitFixedFeedbackResistanceOhms = DEFAULT_CIRCUIT_FIXED_FEEDBACK_RESISTANCE_OHMS,
    circuitOffsetHighV = DEFAULT_CIRCUIT_OFFSET_HIGH_V,
    circuitOffsetLowV = DEFAULT_CIRCUIT_OFFSET_LOW_V,
    circuitSourceResistanceOhms = DEFAULT_CIRCUIT_SOURCE_RESISTANCE_OHMS,
    circuitVariableFeedbackResistanceOhms = DEFAULT_CIRCUIT_VARIABLE_FEEDBACK_RESISTANCE_OHMS,
    fixedGainRatio = DEFAULT_FIXED_GAIN_RATIO,
    offsetHighCorrectionV = DEFAULT_OFFSET_HIGH_CORRECTION_V,
    offsetHighV = DEFAULT_OFFSET_HIGH_V,
    offsetLowCorrectionV = DEFAULT_OFFSET_LOW_CORRECTION_V,
    offsetLowV = DEFAULT_OFFSET_LOW_V,
    offsetTrimV = DEFAULT_OFFSET_TRIM_V,
    variableGainRatio = DEFAULT_VARIABLE_GAIN_RATIO,
    wiperMax = DEFAULT_WIPER_MAX,
    wiperMin = DEFAULT_WIPER_MIN,
  } = {}) {
    this.circuitFixedFeedbackResistanceOhms = circuitFixedFeedbackResistanceOhms;
    this.circuitOffsetHighV = circuitOffsetHighV;
    this.circuitOffsetLowV = circuitOffsetLowV;
    this.circuitSourceResistanceOhms = circuitSourceResistanceOhms;
    this.circuitVariableFeedbackResistanceOhms = circuitVariableFeedbackResistanceOhms;
    this.fixedGainRatio = fixedGainRatio;
    this.offsetHighCorrectionV = offsetHighCorrectionV;
    this.offsetHighV = offsetHighV;
    this.offsetLowCorrectionV = offsetLowCorrectionV;
    this.offsetLowV = offsetLowV;
    this.offsetTrimV = offsetTrimV;
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

  getCircuitMathErrorReadings(model) {
    const gainWiper = model.gain?.wiper;
    const offsetWiper = model.offset?.wiper;
    const sensor1Voltage = model.sensor1Voltage;
    const sensor2Voltage = model.sensor2Voltage;
    const sensor1ModeledVoltage = this.sensor1FromSensor2(
      sensor2Voltage,
      gainWiper,
      offsetWiper,
    );
    const sensor2ModeledVoltage = this.sensor2FromSensor1(
      sensor1Voltage,
      gainWiper,
      offsetWiper,
    );
    const sensor1CircuitVoltage = this.circuitSensor1FromSensor2(
      sensor2Voltage,
      gainWiper,
      offsetWiper,
    );
    const sensor2CircuitVoltage = this.circuitSensor2FromSensor1(
      sensor1Voltage,
      gainWiper,
      offsetWiper,
    );

    return {
      sensor1: this.getSensorErrorReading(sensor1ModeledVoltage, sensor1CircuitVoltage, {
        sourceVoltage: sensor2Voltage,
      }),
      sensor2: this.getSensorErrorReading(sensor2ModeledVoltage, sensor2CircuitVoltage, {
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
    offsetWiper = this.clampWiper(Number(offsetWiper));

    return this.offsetLowV
      + offsetWiper * (this.offsetHighV - this.offsetLowV) / this.wiperMax
      + this.offsetTrimV
      + this.offsetCorrectionFromWiper(offsetWiper);
  }

  offsetCorrectionFromWiper(offsetWiper) {
    offsetWiper = this.clampWiper(Number(offsetWiper));

    return this.offsetLowCorrectionV
      + offsetWiper * (this.offsetHighCorrectionV - this.offsetLowCorrectionV) / this.wiperMax;
  }

  gainRatioFromWiper(gainWiper) {
    gainWiper = this.clampWiper(Number(gainWiper));

    return this.fixedGainRatio + gainWiper * this.variableGainRatio / this.wiperMax;
  }

  circuitOffsetVoltageFromWiper(offsetWiper) {
    offsetWiper = this.clampWiper(Number(offsetWiper));

    return this.circuitOffsetLowV
      + offsetWiper * (this.circuitOffsetHighV - this.circuitOffsetLowV) / this.wiperMax;
  }

  circuitGainRatioFromWiper(gainWiper) {
    gainWiper = this.clampWiper(Number(gainWiper));

    const feedbackResistance = this.circuitFixedFeedbackResistanceOhms
      + gainWiper * this.circuitVariableFeedbackResistanceOhms / this.wiperMax;

    return feedbackResistance / this.circuitSourceResistanceOhms;
  }

  sensor2FromSensor1(sensor1V, gainWiper, offsetWiper) {
    if (!isKnownVoltage(sensor1V)) {
      return null;
    }

    const offsetV = this.offsetVoltageFromWiper(offsetWiper);
    const gainRatio = this.gainRatioFromWiper(gainWiper);

    return offsetV + gainRatio * (offsetV - sensor1V);
  }

  sensor1FromSensor2(sensor2V, gainWiper, offsetWiper) {
    if (!isKnownVoltage(sensor2V)) {
      return null;
    }

    const offsetV = this.offsetVoltageFromWiper(offsetWiper);
    const gainRatio = this.gainRatioFromWiper(gainWiper);

    return offsetV - (sensor2V - offsetV) / gainRatio;
  }

  circuitSensor2FromSensor1(sensor1V, gainWiper, offsetWiper) {
    if (!isKnownVoltage(sensor1V)) {
      return null;
    }

    const offsetV = this.circuitOffsetVoltageFromWiper(offsetWiper);
    const gainRatio = this.circuitGainRatioFromWiper(gainWiper);

    return offsetV + gainRatio * (offsetV - sensor1V);
  }

  circuitSensor1FromSensor2(sensor2V, gainWiper, offsetWiper) {
    if (!isKnownVoltage(sensor2V)) {
      return null;
    }

    const offsetV = this.circuitOffsetVoltageFromWiper(offsetWiper);
    const gainRatio = this.circuitGainRatioFromWiper(gainWiper);

    return offsetV - (sensor2V - offsetV) / gainRatio;
  }

  clampWiper(value) {
    return Math.max(this.wiperMin, Math.min(this.wiperMax, value));
  }
}
