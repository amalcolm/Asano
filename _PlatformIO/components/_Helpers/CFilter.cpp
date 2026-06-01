#include "CFilter.h"
#include "Helpers.h"
#include <Arduino.h>
#include <cmath>
#include <deque>

CFilter::CFilter(int sensorPin, double t) : _sensorPin(sensorPin) { setT(t); }

void CFilter::reset() { _minV = 1E6; _maxV = 0; _lastV = readSingle(); _counter = 1; }

inline double CFilter::readSingle() { 
  int sample = analogRead(_sensorPin);
  if (sample > _maxV) _maxV = sample;
  else
  if (sample < _minV) _minV = sample;

  return static_cast<double>(sample); 
}

double CFilter::read(int numSamples) { if (numSamples <= 0) ERROR("CFilter::read: numSamples must be > 0");
  int itt = 0;
  _minV = 1E6; _maxV = 0;

  while (++itt <= numSamples && ++_counter < _minForT) {
    double sample = readSingle();
    double t = getTfromSamples(_counter);
    double tInv = 1.0 - t;

    if (_lastV < 0)
      _lastV = sample;
    else
      _lastV = t * sample + tInv * _lastV;

  }

  while (itt <= numSamples) {  // _lastV will now be valid
    double sample = readSingle();

    _lastV = _t * sample + _tInv * _lastV;

    itt++;
    _counter++;
  }

  return _lastV;
}


inline double CFilter::getT() const   { return _t; }
inline void   CFilter::setT(double t) { if (t <= 0.0 || t >= 1.0) ERROR("CFilter::setT: t must be > 0 and < 1"); 
  _t = t; 
  _tInv = 1.0 - t; 
  _minForT = getSamplesFromT(t); 
}

inline int    CFilter::getVariance() const { return  _maxV - _minV; }

inline double CFilter::getTfromSamples(int samples) { return 1.0 - std::pow(0.05, 1.0 / samples); } // 95% settle - no error check
inline int    CFilter::getSamplesFromT(double t)    { return static_cast<int>(std::ceil(std::log(0.05) / std::log(1.0 - t))); }
