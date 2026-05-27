#pragma once
#include "Arduino.h"

class CCalibrator {
public:
  // Measures actual CPU frequency (Hz) using RTC 1Hz tick
  static double measureF_CPU();

private:
  static void setupRTCAlarm();
  static void rtcISR();
};
