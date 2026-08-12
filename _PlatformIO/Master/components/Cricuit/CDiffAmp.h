#pragma once
#include <cstdint>

struct CDiffAmp {
  inline static constexpr double SENSOR_SCALAR = 1023.0 / 3.3;
  inline static constexpr double VOLTAGE_SCALAR = 3.3 / 1023.0;

  inline static constexpr double inv255 = 1.0 / 255.0;
  inline static constexpr double SOURCE_RESISTOR = 1000.0;
  inline static constexpr double FIXED_FEEDBACK_RESISTOR = 1200.0;
  inline static constexpr double GAIN_ZERO_RESIDUAL_RESISTOR = 579.58811;
  inline static constexpr double VARIABLE_FEEDBACK_RESISTOR = 102755.50125;


  inline static double multiplier(uint8_t gainWiper) {
    static constexpr double invSourceResistor = 1.0 / SOURCE_RESISTOR;
    double feedbackResistor =
      FIXED_FEEDBACK_RESISTOR
      + GAIN_ZERO_RESIDUAL_RESISTOR
      + (VARIABLE_FEEDBACK_RESISTOR * static_cast<double>(gainWiper) * inv255);
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
    return sensor2VoltageFromSensor1Voltage(sensor1Voltage, gainWiper, offsetWiper) * SENSOR_SCALAR;
  }

  double sensor1FromSensor2(int sensor2, uint8_t gainWiper, uint8_t offsetWiper) const {
    const double sensor2Voltage = sensor2 * VOLTAGE_SCALAR;
    return sensor1VoltageFromSensor2Voltage(sensor2Voltage, gainWiper, offsetWiper) * SENSOR_SCALAR;
  }

  double sensor1VoltageFromSensor2(double sensor2, uint8_t gainWiper, uint8_t offsetWiper) const {
    const double sensor2Voltage = sensor2 * VOLTAGE_SCALAR;
    return sensor1VoltageFromSensor2Voltage(sensor2Voltage, gainWiper, offsetWiper);
  }

  double sensor2VoltageFromSensor1Voltage(double sensor1Voltage, uint8_t gainWiper, uint8_t offsetWiper) const {
    const double offset = offsetVoltage(offsetWiper);
    const double gain = multiplier(gainWiper);

    // Physics model: Vout = Voffset + gain * (Voffset - Vin)
    return offset + gain * (offset - sensor1Voltage);
  }

  double sensor1VoltageFromSensor2Voltage(double sensor2Voltage, uint8_t gainWiper, uint8_t offsetWiper) const {
    const double offset = offsetVoltage(offsetWiper);
    const double gain = multiplier(gainWiper);

    return offset - (sensor2Voltage - offset) / gain;
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
