#include "_HWTools.h"
#include "HWforState.h"
#include "CCircuit.h"
#include "CUSB.h"
#include <cmath>

constexpr int SAMPLES_IN_TESTREAD = 20;
constexpr int MAX_SEEK_ITERATIONS = 64;
constexpr double MIN_MODEL_DELTA = 0.05;

void HWTools::seekTargets() {


  double newT = CFilteredSensor::getTfromSamples(SAMPLES_IN_TESTREAD);
  hw.sensor1.pushT(newT);
  hw.sensor2.pushT(newT);

  bool seeking = true;
  int iteration = 0;

  while (seeking) {
    if (++iteration > MAX_SEEK_ITERATIONS) {
      USB.printf("st,limit,g=%d,m=%d,o=%d\n", hw.gain.getLevel(), hw.mid.getLevel(), hw.offset.getLevel());
      hw.setPhase(HWforState::Phase::SEARCH);
      break;
    }

    seeking = false;
    double s1 = hw.sensor1.read(SAMPLES_IN_TESTREAD);
    double s2 = hw.sensor2.read(SAMPLES_IN_TESTREAD);
    cache.set(s2);

    double s1_distance = s1 - cache.S1_target;
    double s2_distance = s2 - cache.S2_target;
    if (!std::isfinite(cache.dS1_mid) || std::abs(cache.dS1_mid) < MIN_MODEL_DELTA ||
        !std::isfinite(cache.dS2_offset) || std::abs(cache.dS2_offset) < MIN_MODEL_DELTA) {
      USB.printf("st,badmodel,g=%d,d1=%.2f,d2=%.2f\n", hw.gain.getLevel(), cache.dS1_mid, cache.dS2_offset);
      hw.setPhase(HWforState::Phase::SEARCH);
      break;
    }

    int s1_midDelta_steps = static_cast<int>(std::round(s1_distance / cache.dS1_mid));

    if (std::abs(s1_midDelta_steps) > 4) {
      s1_midDelta_steps = (s1_midDelta_steps > 0) ? 4 : -4;
      seeking = true;
    }
    if (std::abs(s1_midDelta_steps) > 0) {
      hw.mid.changeBy(-s1_midDelta_steps);
      delayMicroseconds(10);
    }

    // re-read after mid adjustment
    s2 = hw.sensor2.read(SAMPLES_IN_TESTREAD);
    s2_distance = s2 - cache.S2_target;

    int s2_offsetDelta_steps = static_cast<int>(std::round(s2_distance / cache.dS2_offset));

    if (std::abs(s2_offsetDelta_steps) > 4) {
      s2_offsetDelta_steps = (s2_offsetDelta_steps > 0) ? 4 : -4;
      seeking = true;
    }

    if (std::abs(s2_offsetDelta_steps) > 0) {
      hw.offset.changeBy(-s2_offsetDelta_steps);
      delayMicroseconds(10);
    }

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
      pot.changeBy(-midDelta_steps);
      delayMicroseconds(10);
    }
  }
  hw.sensor1.popT();
  hw.sensor2.popT();
}
