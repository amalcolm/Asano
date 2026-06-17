#pragma once
#include "CSensor.h"
#include <stack>
class CFilteredSensor : public CSensor {
public:
  CFilteredSensor(int pin, double t);

  void reset();
  using CSensor::read;
  double read(int numSamples);


         void   setT(double t);
  inline double getT() const  { return _t; }

  inline double lastV() const { return _lastV; }
  inline int    getVariance() const;

  static double getTfromSamples(int samples);
  static int    getSamplesFromT(double t);

  inline void   offset_lastV(double dV)  { _lastV += dV; _lastValue += static_cast<int>(dV + 0.5); }

  inline void   offset_Env(double dEnv) { _envOffset += dEnv; }
  inline double env() const { return _lastV + _envOffset; }

  // use these for short samples.  Do not hold for more than a millisecond
         void  pushT(double t);
         void  popT();

private:
  inline double _readSingle();
  double _t = -1.0;
  double _tInv = -1.0;
  double _lastV = -1.0;
  double _envOffset = 0.0;

  int _counter = 0;
  int _minForT = -1;
  int _minV = 1023;
  int _maxV = 0;

  std::stack<CFilteredSensor> _tStack;

  inline  void _copyFrom(const CFilteredSensor& other) {
    CSensor::copyFrom(static_cast<const CSensor&>(other));
    setT(other.getT());
    _lastV = other._lastV;
    _envOffset = other._envOffset;

    _counter = other._counter;
    _minForT = other._minForT;
    _minV = other._minV;
    _maxV = other._maxV;

    // ignore _tStack, 
  }
};
