export const MID_STEP_COMPONENT = "Mid Step";

export const MID_STEP_MODEL_SCHEMA = Object.freeze({
  schemaVersion: 1,
  name: "Mid Step math model",
  purpose: "Defines the pivot-state Mid Step model derived from Test4 calibration data.",
  inputs: {
    midVoltage: { description: "Calculated mid wiper voltage.", unit: "V" },
    sensor1Estimate: { description: "Sensor1 estimate at the current mid voltage.", unit: "V" },
  },
  outputs: {
    pivotMidVoltage: { description: "Shared mid-voltage pivot used by the finite-difference model.", unit: "V" },
    pivotSensor1Estimate: { description: "Shared Sensor1 estimate at the pivot.", unit: "V" },
    residual: { description: "Measured-minus-predicted Sensor2 delta per mid step.", unit: "V/count" },
  },
  requiredConstants: {
    calibrated: {
      pivotMidVoltage: { role: "Shared mid-voltage pivot used by the finite-difference model.", source: "calculated", unit: "V" },
      pivotSensor1Estimate: { role: "Shared Sensor1 estimate at the pivot.", source: "calculated", unit: "V" },
      residualMaxAbs: { role: "Maximum absolute measured-minus-predicted Sensor2 delta residual.", source: "calculated", unit: "V/count" },
      residualMean: { role: "Mean measured-minus-predicted Sensor2 delta residual.", source: "calculated", unit: "V/count" },
      residualRmse: { role: "Root-mean-square Sensor2 delta residual.", source: "calculated", unit: "V/count" },
    },
    assumed: {},
  },
});

export function createMidStepModelPayload(modelSnapshot = null) {
  const pivot = isPlainObject(modelSnapshot?.pivot) ? modelSnapshot.pivot : {};
  const residual = isPlainObject(modelSnapshot?.residual) ? modelSnapshot.residual : {};

  return {
    schema: MID_STEP_MODEL_SCHEMA,
    constants: {
      calibrated: {
        pivotMidVoltage: getFiniteNumberOrNull(pivot.midVoltage),
        pivotSensor1Estimate: getFiniteNumberOrNull(pivot.sensor1Estimate),
        residualMaxAbs: getFiniteNumberOrNull(residual.maxAbs),
        residualMean: getFiniteNumberOrNull(residual.mean),
        residualRmse: getFiniteNumberOrNull(residual.rmse),
      },
      assumed: {},
    },
  };
}

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value);
}

function getFiniteNumberOrNull(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

