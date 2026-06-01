#include "CFilteredSensor.h"
#include "Helpers.h"
#include <Arduino.h>
#include <cmath>
#include <deque>

CFilteredSensor::CFilteredSensor(int pin, double t) : CSensor(pin) { setT(t); }

void CFilteredSensor::reset() { 
  _lastValue = CSensor::read();
  _lastV = _readSingle();
  _counter = 1; 
  _minV = CSensor::MAX_VALUE; _maxV = 0; 
}

inline double CFilteredSensor::_readSingle() { 
  int sample = analogRead(_pin);
  if (sample > _maxV) _maxV = sample;
  else
  if (sample < _minV) _minV = sample;

  return static_cast<double>(sample); 
}

double CFilteredSensor::read(int numSamples) { if (numSamples <= 0) ERROR("CFilteredSensor::read: numSamples must be > 0");
  int itt = 0;
  _minV = CSensor::MAX_VALUE; _maxV = 0;

  while (++itt <= numSamples && ++_counter < _minForT) {
    double sample = _readSingle();
    double t = getTfromSamples(_counter);
    double tInv = 1.0 - t;

    if (_lastV < 0)
      _lastV = sample;
    else
      _lastV = t * sample + tInv * _lastV;

  }

  while (itt <= numSamples) {  // _lastV will now be valid
    double sample = _readSingle();

    _lastV = _t * sample + _tInv * _lastV;

    itt++;
    _counter++;
  }

  _lastValue = static_cast<int>(_lastV); // update sensor's lastValue for zone checking
  if (_inverted) _lastValue = 1023 - _lastValue;

  return _lastV;
}


 void CFilteredSensor::setT(double t) { if (t <= 0.0 || t >= 1.0) ERROR("CFilteredSensor::setT: t must be > 0 and < 1"); 
  _t = t; 
  _tInv = 1.0 - t; 
  _minForT = getSamplesFromT(t); 
}

inline int    CFilteredSensor::getVariance() const { return  _maxV - _minV; }

inline double CFilteredSensor::getTfromSamples(int samples) { return 1.0 - std::pow(0.05, 1.0 / samples); } // 95% settle - no error check
inline int    CFilteredSensor::getSamplesFromT(double t)    { return static_cast<int>(std::ceil(std::log(0.05) / std::log(1.0 - t))); }
