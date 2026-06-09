#include "_HWTools.h"
#include "HWforState.h"
#include "CCircuit.h"

namespace {
  constexpr int SAMPLES_IN_TESTREAD = 20;
}


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