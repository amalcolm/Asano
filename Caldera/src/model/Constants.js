export class Constants {
  // Logical supply rails used by the browser-side circuit model.
  static GROUND_VOLTAGE = 0;
  static SUPPLY_VOLTAGE = 3.3;
  static SENSOR_RAIL_MARGIN_V = 0.54;
  static MID_RAIL_VOLTAGE = (Constants.GROUND_VOLTAGE + Constants.SUPPLY_VOLTAGE) / 2;
  static VALID_SENSOR_MIN_V = Constants.GROUND_VOLTAGE + Constants.SENSOR_RAIL_MARGIN_V;
  static VALID_SENSOR_MAX_V = Constants.SUPPLY_VOLTAGE - Constants.SENSOR_RAIL_MARGIN_V;

  // Shared digi-pot assumptions. The UI sliders use the same 8-bit range.
  static DIGIPOT_MIN = 0;
  static DIGIPOT_MAX = 255;
  static DIGIPOT_MIDPOINT = 128;
  static DIGIPOT_RESISTANCE_OHMS = 5000;

  // Three-pot ladder: supply rail feeds the top of the digi-pot through 22K.
  static THREE_POT_RAILS = Object.freeze({
    digipotResistanceOhms: Constants.DIGIPOT_RESISTANCE_OHMS,
    groundResistanceOhms: 0,
    groundVoltage: Constants.GROUND_VOLTAGE,
    supplyResistanceOhms: 22000,
    supplyVoltage: Constants.SUPPLY_VOLTAGE,
  });

  // Offset ladder: resistor values are the measured/nominal rails around the offset digi-pot.
  static OFFSET_RAILS = Object.freeze({
    digipotResistanceOhms: Constants.DIGIPOT_RESISTANCE_OHMS,
    groundResistanceOhms: 79600,
    groundVoltage: Constants.GROUND_VOLTAGE,
    supplyResistanceOhms: 80600,
    supplyVoltage: Constants.SUPPLY_VOLTAGE,
  });

  static DIFFERENTIAL_AMP = Object.freeze((() => {
    const sensorGainRatioPerWiper = 0.39590669654443916;

    return {
      // Nominal physical resistors used by the visual circuit model.
      sourceResistanceOhms: 1000,
      fixedFeedbackResistanceOhms: 1200,
      variableFeedbackResistanceOhms: 100000,

      // Red-label values: inferred parts that closely reproduce the calibrated sensor model.
      calibratedSourceResistanceOhms: 991,
      calibratedFixedFeedbackResistanceOhms: 1810,
      calibratedVariableFeedbackResistanceOhms: 100000,
      calibratedOffsetRails: Object.freeze({
        digipotResistanceOhms: Constants.DIGIPOT_RESISTANCE_OHMS,
        groundResistanceOhms: 68200,
        groundVoltage: Constants.GROUND_VOLTAGE,
        supplyResistanceOhms: 63100,
        supplyVoltage: Constants.SUPPLY_VOLTAGE,
      }),

      // Empirical calibration used by DifferentialAmpSensorModel for actual sensor prediction.
      sensorOffsetTrimV: 0.08195121809338102,
      sensorOffsetLowCorrectionV: -0.0212,
      sensorOffsetHighCorrectionV: 0,
      sensorFixedGainRatio: 1.825648453550745,
      sensorGainRatioPerWiper,
      sensorVariableGainRatio: sensorGainRatioPerWiper * Constants.DIGIPOT_MAX,
    };
  })());
}
