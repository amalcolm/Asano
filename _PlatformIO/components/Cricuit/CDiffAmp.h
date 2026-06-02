#pragma once
#include <cstdint>

struct CDiffAmp {
  inline static constexpr double SENSOR_SCALAR = 1023.0 / 3.3;
  inline static constexpr double VOLTAGE_SCALAR = 3.3 / 1023.0;

  inline static constexpr double inv255 = 1.0 / 255.0;
  inline static constexpr double SOURCE_RESISTOR = 991.0;
  inline static constexpr double FIXED_FEEDBACK_RESISTOR = 1810.0;
  inline static constexpr double VARIABLE_FEEDBACK_RESISTOR = 100000.0;


  inline static double multiplier(uint8_t gainWiper) {
    static double invSourceResistor = 1.0 / SOURCE_RESISTOR;
    double feedbackResistor = FIXED_FEEDBACK_RESISTOR + (VARIABLE_FEEDBACK_RESISTOR * static_cast<double>(gainWiper) * inv255);
    return feedbackResistor * invSourceResistor;
  }



  inline static constexpr double OFFSET_VOLTAGE_SOURCE = 3.3;
  inline static constexpr double OFFSET_VOLTAGE_SOURCE_RESISTOR = 63100.0;
  inline static constexpr double OFFSET_GROUND_SOURCE_RESISTOR = 68200.0;
  inline static constexpr double OFFSET_DIGIPOT_RESISTOR = 5000.0;

  inline static constexpr double OFFSET_TOTAL_RESISTANCE = OFFSET_VOLTAGE_SOURCE_RESISTOR + OFFSET_DIGIPOT_RESISTOR + OFFSET_GROUND_SOURCE_RESISTOR;
  inline static constexpr double OFFSET_CURRENT = OFFSET_VOLTAGE_SOURCE / OFFSET_TOTAL_RESISTANCE;

  inline static constexpr double OFFSET_BOT_VOLTAGE = OFFSET_CURRENT * OFFSET_GROUND_SOURCE_RESISTOR;
  inline static constexpr double OFFSET_TOP_VOLTAGE = OFFSET_BOT_VOLTAGE + OFFSET_CURRENT * OFFSET_DIGIPOT_RESISTOR;
  inline static constexpr double OFFSET_VOLTAGE_RANGE = OFFSET_TOP_VOLTAGE - OFFSET_BOT_VOLTAGE;

  // all constexpr math is done at compile time


  double sensor2FromSensor1(int sensor1, uint8_t gainWiper, uint8_t offsetWiper) const {
    const double sensor1Voltage = sensor1 * VOLTAGE_SCALAR;
    const double offset = offsetVoltage(offsetWiper);
    const double gain = multiplier(gainWiper);

    // Physics model: Vout = Voffset + gain * (Voffset - Vin)
    double volts = offset + gain * (offset - sensor1Voltage);
    return volts * SENSOR_SCALAR;
  }

  double sensor1FromSensor2(int sensor2, uint8_t gainWiper, uint8_t offsetWiper) const {
    const double sensor2Voltage = sensor2 * VOLTAGE_SCALAR;
    const double offset = offsetVoltage(offsetWiper);
    const double gain = multiplier(gainWiper);

    double volts = offset - (sensor2Voltage - offset) / gain;
    return volts * SENSOR_SCALAR;
  }


  double sensor2DeltaFromOffsetDelta(int offsetDelta, uint8_t gainWiper) const {
    double gain = multiplier(gainWiper);
    
    double volts = (1.0 + gain) * offsetDelta * inv255 * OFFSET_VOLTAGE_RANGE;

    return volts * SENSOR_SCALAR;
  }

private:
  inline double offsetVoltage(uint8_t offsetWiper) const {
    return OFFSET_BOT_VOLTAGE + offsetWiper * inv255 * OFFSET_VOLTAGE_RANGE;
  }


};
