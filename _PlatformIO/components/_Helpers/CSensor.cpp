#include "CSensor.h"
#include "HWforState.h"
#include <Arduino.h>

CSensor::CSensor(int pin): _pin(pin) {}

void CSensor::begin() {}

void CSensor::invert() { _inverted = !_inverted; }


uint16_t CSensor::read(int samplesToAverage) {  if (_pin < 0) return 0; // No sensor pin defined
  
  analogRead(_pin); // discard first reading as it can be inaccurate right after writing to pot


  if (samplesToAverage <= 1) {
    int rawValue = analogRead(_pin);

    _lastValue = _inverted ? 1023 - rawValue : rawValue;
  }
  else
  {
    int totalValue = 0;
    for (int i = 0; i < samplesToAverage; i++)
        totalValue += analogRead(_pin);

    if (_inverted)
        totalValue = (samplesToAverage * 1023) - totalValue;

    _lastValue = totalValue / samplesToAverage;

    _ra.add(_lastValue);
  }

  _updateZone();

  return static_cast<uint16_t>(_lastValue);
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



double CSensor::resetFilter() {
  read(); // update lastValue and zone
  uint16_t rawValue = _inverted ? 1023 - _lastValue : _lastValue;
  _lastV = static_cast<double>(rawValue);
  return _lastV;
}


double getT(int samples) {
  static std::deque<std::pair<int, double>> s_Tstore{};
  for (const auto& [s, t] : s_Tstore) if (s == samples) return t;

  double t = 1.0 - pow(0.05, 1.0 / samples); // 95% settled
  s_Tstore.emplace_back(samples, t);
  return t;
}
double SamplesFromT(double t)
{
  static std::deque<std::pair<double, int>> s_SamplesStore{};
  for (const auto& [tStored, s] : s_SamplesStore) if (tStored == t) return s;

  int samples = static_cast<int>(std::ceil(std::log(0.05) / std::log(1.0 - t)));
  s_SamplesStore.emplace_back(t, samples);
  return samples;
}

float CSensor::filter(int numSamples, double t) {

  if (numSamples == 0 && t <= 0) {
    _lastV = -1.0;
    numSamples = 1;// fall through to single reading
  }

  if (numSamples == 1 && t <= 0) {
    read(); // update _lastValue and zone
    if (inZone == false) {_lastV = -1; return -1; }
   
    uint16_t rawValue = _inverted ? 1023 - _lastValue : _lastValue;

    if (_lastV < 0)
      _lastV =     static_cast<double>(rawValue);
    else
      _lastV = 0.5 * static_cast<double>(rawValue) + 0.5 * _lastV;
    
    return static_cast<float>(_lastV);
  }
  
  if (t < 0) t = getT(numSamples);
  double tInv = 1.0 - t;
  int sensor = getPin();

  _lastV = _lastV < 0 ? static_cast<double>(analogRead(_pin)) : _lastV; 
  uint16_t minV = _lastV, maxV = minV;

   for (int i = 1; i < numSamples; ++i) {
    uint16_t sample = analogRead(sensor);

    if (sample > maxV) maxV = sample;
    else
    if (sample < minV) minV = sample;

    _lastV = t * static_cast<double>(sample) + tInv * _lastV;
  }
  
  _lastVariance = static_cast<double>(maxV - minV);  // performant approximation 

  uint16_t quantised = static_cast<uint16_t>(_lastV + 0.5); 
  _lastValue = _inverted ? 1023 - quantised : quantised;

  _updateZone();
  return static_cast<float>(_lastV);
}
