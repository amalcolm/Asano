#pragma once
#include "CSensor.h"
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

  inline double getTfromSamples(int samples);
  inline int    getSamplesFromT(double t);

  inline void   offset_lastV(double dV)  { _lastV += dV; _lastValue += static_cast<int>(dV + 0.5); }

  inline void   offset_Env(double dEnv) { _envOffset += dEnv; }
  inline double env() const { return _lastV + _envOffset; }


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
};