#pragma once

class CFilter {
public:
  CFilter(int sensorPin, double t);

  void reset();
  double read(int numSamples);
  inline double readSingle();

  inline void   setT(double t);
  inline double getT() const;

  inline double getVariance() const;
  inline double getTfromSamples(int samples);
  inline int    getSamplesFromT(double t);

private:
  int _sensorPin;
  double _t = -1.0;
  double _tInv = -1.0;
  double _lastV = -1.0;

  int _counter = 0;
  int _minForT = -1;
  int _minV = 1023;
  int _maxV = 0;
};