#pragma once
#include <cstdint>

struct CDiffAmp {
  inline static constexpr double inv255 = 1.0 / 255.0;
  inline static constexpr double SOURCE_RESISTOR = 991.0;
  inline static constexpr double FIXED_FEEDBACK_RESISTOR = 1810.0;
  inline static constexpr double VARIABLE_FEEDBACK_RESISTOR = 100000.0;


  static double multiplier(uint8_t gainWiper) {
    static double invSourceResistor = 1.0 / SOURCE_RESISTOR;
    double feedbackResistor = FIXED_FEEDBACK_RESISTOR + (VARIABLE_FEEDBACK_RESISTOR * gainWiper * inv255);
    return feedbackResistor * invSourceResistor;
  }



  inline static constexpr double OFFSET_VOLTAGE_SOURCE = 3.3;
  inline static constexpr double OFFSET_VOLTAGE_SOURCE_RESISTOR = 63100.0;
  inline static constexpr double OFFSET_GROUND_SOURCE_RESISTOR = 68200.0;
  inline static constexpr double OFFSET_DIGIPOT_RESISTOR = 5000.0;

  inline static constexpr double _totalResistance = OFFSET_VOLTAGE_SOURCE_RESISTOR + OFFSET_DIGIPOT_RESISTOR + OFFSET_GROUND_SOURCE_RESISTOR;
  inline static constexpr double _current = OFFSET_VOLTAGE_SOURCE / _totalResistance;

  inline static constexpr double OFFSET_BOT_VOLTAGE = _current * OFFSET_GROUND_SOURCE_RESISTOR;
  inline static constexpr double OFFSET_TOP_VOLTAGE = OFFSET_BOT_VOLTAGE + _current * OFFSET_DIGIPOT_RESISTOR;
  inline static constexpr double OFFSET_VOLTAGE_RANGE = OFFSET_TOP_VOLTAGE - OFFSET_BOT_VOLTAGE;

  // all math is done at compile time

  inline double offsetVoltage(uint8_t offsetWiper) const {
    return OFFSET_BOT_VOLTAGE + offsetWiper * inv255 * OFFSET_VOLTAGE_RANGE;
  }

  double sensor2FromSensor1(double sensor1Voltage, uint8_t gainWiper, uint8_t offsetWiper) const {
    const double offset = offsetVoltage(offsetWiper);
    const double gain = multiplier(gainWiper);

    // Physics model: Vout = Voffset + gain * (Voffset - Vin)
    return offset + gain * (offset - sensor1Voltage);
  }

  double sensor1FromSensor2(double sensor2Voltage, uint8_t gainWiper, uint8_t offsetWiper) const {
    const double offset = offsetVoltage(offsetWiper);
    const double gain = multiplier(gainWiper);

    return offset - (sensor2Voltage - offset) / gain;
  }

};
