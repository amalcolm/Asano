#pragma once
#include <cstdint> 

class CCircuit {
private:
  class CDiffAmp* ptr_DiffAmp; // Pimpl to avoid including CDiffAmp in the header
  class CDiffAmp& _DA;

  class C3Pot* ptr_3Pot; // Pimpl to avoid including C3Pot in the header
  class C3Pot& _3Pot;

public:
  CCircuit();
  ~CCircuit();

  double sensor1FromSensor2() const;
  double sensor1FromSensor2(double sensor2) const;

  double midVoltageFromMid() const;
  double midVoltage(int top, int bot, int mid) const;
  
  double midVoltageVolts(int top, int bot, int mid) const;

  double sensor2DeltaFromMidDelta(int midDelta, double sensor2) const;
  double sensor2DeltaFromOffsetDelta(int offsetDelta) const;

};
