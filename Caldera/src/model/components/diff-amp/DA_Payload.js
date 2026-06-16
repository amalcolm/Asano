import { Constants } from "../../Constants.js";

export const DIFFERENTIAL_AMP_MODEL_STRUCTURE_VERSION = 1;

export const modelStructure = deepFreeze({
  schemaVersion: DIFFERENTIAL_AMP_MODEL_STRUCTURE_VERSION,
  name: "Differential amplifier physics model",
  purpose: "Defines the constants and equations needed to estimate either sensor voltage from the other sensor voltage, gain wiper, and offset wiper.",
  inputs: {
    gain   : { description: "8-bit gain feedback wiper value." ,      unit: "step",  },
    offset : { description: "8-bit offset divider wiper value.",      unit: "step",  },
    sensor1: { description: "Measured or estimated Sensor1 voltage.", unit: "V",     },
    sensor2: { description: "Measured or estimated Sensor2 voltage.", unit: "V",     },
  },
  outputs: {
    centre     : { description: "Differential amplifier non-inverting reference voltage.",          unit: "V",     },
    feedback   : { description: "Total effective feedback resistance used by the inverting stage.", unit: "Ω",     },
    multiplier : { description: "feedback / sourceResistance.",                                     unit: "ratio", },
    sensor1_est: { description: "Sensor1 estimated from Sensor2.",                                  unit: "V",     },
    sensor2_est: { description: "Sensor2 estimated from Sensor1.",                                  unit: "V",     },
  },
  requiredConstants: {
    assumed: {
      digitpotResistanceOhms     : { role: "Offset divider variable element total resistance.",        source: "given", unit: "Ω",    },
      fixedFeedbackResistanceOhms: { role: "Fixed resistor in series with the gain feedback element.", source: "given", unit: "Ω",    },
      sourceResistanceOhms       : { role: "Input/source resistor into the inverting node.",           source: "given", unit: "Ω",    },
      supplyVoltage              : { role: "Offset divider supply rail.",                              source: "given", unit: "V",    },
      wiperMax                   : { role: "Maximum digi-pot wiper code.",                             source: "given", unit: "step", },
    },
    calibrated: {
      gainZeroResidualResistanceOhms: { role: "Additional gain-zero feedback term that is not assigned to the marked fixed resistor.", source: "calculated", unit: "Ω", },
      offsetBottomResistanceOhms    : { role: "Resistance below the offset digi-pot ladder.",                                          source: "calculated", unit: "Ω", },
      offsetTopResistanceOhms       : { role: "Resistance above the offset digi-pot ladder.",                                          source: "calculated", unit: "Ω", },
      variableFeedbackResistanceOhms: { role: "Calibrated effective end-to-end gain feedback element.",                                source: "calculated", unit: "Ω", },
    },
  },
  equations: [
    "feedback = fixedFeedbackResistanceOhms + gainZeroResidualResistanceOhms + variableFeedbackResistanceOhms * gain / wiperMax",
    "offsetResistance = digitpotResistanceOhms * offset / wiperMax",
    "centre = supplyVoltage * (offsetBottomResistanceOhms + offsetResistance) / (offsetTopResistanceOhms + digitpotResistanceOhms + offsetBottomResistanceOhms)",
    "multiplier = feedback / sourceResistanceOhms",
    "sensor2_est = centre - multiplier * (sensor1 - centre)",
    "sensor1_est = centre + (centre - sensor2) / multiplier",
  ],
  circuitViewNotes: [
    "The current visual DifferentialAmp component already models source, fixed feedback, and variable feedback resistances.",
    "The current visual component does not yet have a named gainZeroResidual term; that term should become an explicit series feedback element or be folded into a composed feedback expression.",
    "The current DifferentialAmpSensorModel has empirical and circuit-prediction paths. This structure is intended to replace those split constants with one exported physics model.",
  ],
});

export function createDifferentialAmpModelStructure(derived = null) {
  const constants = getDifferentialAmpModelConstants(derived);

  return {
    ...modelStructure,
    constants,
    ready: Boolean(derived?.ready),
  };
}

export function createDifferentialAmpModelPayload(derived = null) {
  return {
    schema: modelStructure,
    constants: getDifferentialAmpModelConstants(derived),
  };
}

export function getDifferentialAmpModelConstants(derived = null) {
  const gain = derived?.gain ?? {};
  const offset = derived?.offset ?? {};

  return {
    calibrated: {
      gainZeroResidualResistanceOhms: getKnownNumberOrNull(gain.gainZeroResidualResistanceOhms),
      offsetBottomResistanceOhms: getKnownNumberOrNull(offset.bottomResistanceOhms),
      offsetTopResistanceOhms: getKnownNumberOrNull(offset.topResistanceOhms),
      variableFeedbackResistanceOhms: getKnownNumberOrNull(gain.variableFeedbackEffectiveOhms),
    },
    assumed: {
      digitpotResistanceOhms: getKnownNumberOrNull(offset.offsetPotResistanceOhms)
        ?? Constants.DIGIPOT_RESISTANCE_OHMS,
      fixedFeedbackResistanceOhms: getKnownNumberOrNull(gain.fixedFeedbackResistanceOhms)
        ?? Constants.DIFFERENTIAL_AMP.fixedFeedbackResistanceOhms,
      sourceResistanceOhms: getKnownNumberOrNull(gain.sourceResistanceOhms)
        ?? Constants.DIFFERENTIAL_AMP.sourceResistanceOhms,
      supplyVoltage: getKnownNumberOrNull(offset.supplyVoltage)
        ?? Constants.SUPPLY_VOLTAGE,
      wiperMax: getKnownNumberOrNull(gain.wiperMax)
        ?? getKnownNumberOrNull(offset.wiperMax)
        ?? Constants.DIGIPOT_MAX,
    },
  };
}

function getKnownNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.values(value).forEach(deepFreeze);

  return Object.freeze(value);
}
