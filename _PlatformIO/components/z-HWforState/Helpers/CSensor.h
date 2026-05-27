#pragma once
#include "CRunningAverage.h"

class CSensor {
public:
  static constexpr int MIDPOINT = 512;
  static constexpr int MAX_VALUE = 1023;

  enum class Zone { Low = -1, inZone = 0, High = +1, Placeholder = 255} ;
  Zone zone = Zone::Placeholder;
  bool inZone = false;


  CSensor(int pin);

  void begin();
  void invert();

  uint16_t   read(int samplesToAverage = 1);

  inline int lastValue() const { return _lastValue; }
  inline int getPin()    const { return _pin;       }

  CRunningAverageMinMax<uint16_t>& getRunningAverage() { return _ra; }

  double resetFilter();
  float filter(int numSamples, double t = -1.0);
  float lastV() const { return static_cast<float>(_lastV); }
  float lastVariance() const { return static_cast<float>(_lastVariance); }

protected:

  Zone _updateZone();

  int _pin; 
  int _lastValue = 0;

  bool _inverted = false;
  CRunningAverageMinMax<uint16_t> _ra{1};

  double _lastV = -1.0; // for filtering
  double _lastVariance = 0.0;
};
