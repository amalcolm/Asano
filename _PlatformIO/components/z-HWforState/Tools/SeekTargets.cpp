#include "_HWTools.h"
#include "HWforState.h"
#include "CCircuit.h"

constexpr int SAMPLES_IN_TESTREAD = 20;

void HWTools::seekTargets() {
  

  double newT = CFilteredSensor::getTfromSamples(SAMPLES_IN_TESTREAD);
  hw.sensor1.pushT(newT);
  hw.sensor2.pushT(newT);

  
  
  double s1 = hw.sensor1.read(SAMPLES_IN_TESTREAD);
  double s2 = hw.sensor2.read(SAMPLES_IN_TESTREAD);
  cache.set(s2);

  double s1_distance = s1 - cache.S1_target;
  double s2_distance = s2 - cache.S2_target;

  int s1_midDelta_steps = static_cast<int>(std::round(s1_distance / cache.dS1_mid));

  if (std::abs(s1_midDelta_steps) > 0) {
    hw.mid.offsetLevel(-s1_midDelta_steps);
    delayMicroseconds(10);
  }

  // re-read after mid adjustment
  s2 = hw.sensor2.read(SAMPLES_IN_TESTREAD);
  s2_distance = s2 - cache.S2_target;

  int s2_offsetDelta_steps = static_cast<int>(std::round(s2_distance / cache.dS2_offset));
  
  if (std::abs(s2_offsetDelta_steps) > 0) {
    hw.offset.offsetLevel(-s2_offsetDelta_steps);
    delayMicroseconds(10);
  }

  hw.sensor1.popT();
  hw.sensor2.popT(); 
}

void HWTools::seekTarget(CFilteredSensor& sensor, CDigiPot& pot) {
  double newT = CFilteredSensor::getTfromSamples(SAMPLES_IN_TESTREAD);
  hw.sensor1.pushT(newT);
  hw.sensor2.pushT(newT);

  bool isSensor2 = (sensor.getPin() == hw.sensor2.getPin());
  
  double target = isSensor2 ? cache.S2_target : cache.S1_target;

  double delta = (pot == hw.mid   ) ? (isSensor2 ? cache.dS2_mid    : cache.dS1_mid) :
                 (pot == hw.offset) ? (isSensor2 ? cache.dS2_offset : -1.0) :
                 -1.0;

  if (delta > 0) {
    double s = sensor.read(SAMPLES_IN_TESTREAD);
    double distance = s - target;

    int midDelta_steps = static_cast<int>(std::round(distance / delta));

    if (std::abs(midDelta_steps) > 0) {
      pot.offsetLevel(-midDelta_steps);
      delayMicroseconds(10);
    }
  }
  hw.sensor1.popT();
  hw.sensor2.popT(); 
}