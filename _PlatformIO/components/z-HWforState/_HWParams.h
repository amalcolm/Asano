#pragma once
#include <cstdint>

struct HWParams {

  static inline    int     GAP_TOPBOT   = 4;
  static inline    int     MID_STEP     = 70;  // depends on GAP_TOPBOT - set in contructor

  static constexpr uint8_t SAFE_MIN_WIPER_LEVEL = 16;
  static constexpr uint8_t SAFE_MAX_WIPER_LEVEL = 255 - SAFE_MIN_WIPER_LEVEL;
  
  static constexpr int16_t SENSOR1_TARGET = 490;
  static constexpr int16_t SENSOR2_TARGET = 1023 - SENSOR1_TARGET;  // as sensor2 is inverted, stable state is at sensor2 = 1023 - sensor1, when perceived gain is zero

  static constexpr double  SENSOR1_FILTER_T = 0.01;
  static constexpr double  SENSOR2_FILTER_T = 0.002;

  static constexpr int     SAMPLES_IN_SENSOR1_LONGREAD = 20;
  static constexpr int     SAMPLES_IN_SENSOR2_LONGREAD = 50;

};  