#include "CSensor.h"
#include "HWforState.h"
#include <Arduino.h>

CSensor::CSensor(int pin): _pin(pin) {}

void CSensor::begin() {}

void CSensor::invert() { _inverted = !_inverted; }


int CSensor::read() {  if (_pin < 0) return 0; // No sensor pin defined
  
  int rawValue = analogRead(_pin);

  _lastValue = _inverted ? 1023 - rawValue : rawValue;

  _updateZone();

  return _lastValue;
}



CSensor::Zone CSensor::_updateZone() {
 static constexpr int       DEADZONE = 128;

 static constexpr int  LOW_THRESHOLD =        DEADZONE;
 static constexpr int HIGH_THRESHOLD = 1023 - DEADZONE;

 if (_lastValue <  LOW_THRESHOLD) zone = Zone::Low;
 else
 if (_lastValue > HIGH_THRESHOLD) zone = Zone::High;
 else
   zone = Zone::inZone;

 inZone = (zone == Zone::inZone);
 return zone;
}
