#pragma once
#include <cstdint>

struct C3Pot {
  
  inline static constexpr double DIGIPOT_VOLTAGE_SOURCE = 3.3;
  inline static constexpr double DIGIPOT_VOLTAGE_SOURCE_RESISTOR = 22000.0;
  inline static constexpr double DIGIPOT_RESISTANCE = 5000.0;
  inline static constexpr double DIGIPOT_GROUND_RESISTOR = 0.0;
  
  inline static constexpr double _totalResistance = DIGIPOT_VOLTAGE_SOURCE_RESISTOR + DIGIPOT_RESISTANCE + DIGIPOT_GROUND_RESISTOR;
  inline static constexpr double _current = DIGIPOT_VOLTAGE_SOURCE / _totalResistance;

  inline static constexpr double DIGIPOT_BOT_VOLTAGE = _current * DIGIPOT_GROUND_RESISTOR;
  inline static constexpr double DIGIPOT_TOP_VOLTAGE = DIGIPOT_BOT_VOLTAGE + _current * DIGIPOT_RESISTANCE;
  inline static constexpr double DIGIPOT_VOLTAGE_RANGE = DIGIPOT_TOP_VOLTAGE - DIGIPOT_BOT_VOLTAGE;

  // all math is done at compile time

  double getMidVoltage(uint8_t mid, uint8_t top, uint8_t bot) const {
    static constexpr double inv255 = 1.0 / 255.0;

    const double botVoltage = DIGIPOT_BOT_VOLTAGE + (bot * inv255) * DIGIPOT_VOLTAGE_RANGE;
    const double topVoltage = DIGIPOT_BOT_VOLTAGE + (top * inv255) * DIGIPOT_VOLTAGE_RANGE;

    return botVoltage + (mid * inv255) * (topVoltage - botVoltage);
  }

};
