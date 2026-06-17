#include "_HWTools.h"
#include "HWforState.h"
#include "CUSB.h"
#include <algorithm>
#include <cmath>

namespace {
  constexpr int SAMPLES = 12;
  constexpr int MID_STEP = 1;
  constexpr int OFFSET_STEP = 2;
  constexpr int REQUIRED_STABLE_READS = 2;
  constexpr int MAX_BALANCE_STEPS = 160;
  constexpr double S1_TOLERANCE = 4.0;
  constexpr double S2_TOLERANCE = 40.0;

  struct Reading {
    double s1 = -1.0;
    double s2 = -1.0;
    double e1 = 0.0;
    double e2 = 0.0;
    bool s2InZone = false;
  };

  double logicalValue(const CFilteredSensor& sensor, double raw) {
    return sensor.isInverted() ? CSensor::MAX_VALUE - raw : raw;
  }

  int directionFor(double error) {
    if (!std::isfinite(error) || error == 0.0) return 0;
    return error > 0.0 ? -1 : +1;
  }

  int clampCommand(const CDigiPot& pot, int command) {
    int level = pot.getLevel();
    int requested = level + command;
    int clamped = std::clamp(requested, CDigiPot::WIPER_MIN, CDigiPot::WIPER_MAX);
    return clamped - level;
  }

  bool withinTolerance(double e1, double e2) {
    return std::abs(e1) <= S1_TOLERANCE
        && std::abs(e2) <= S2_TOLERANCE;
  }

  Reading readLogical(HWforState& hw) {
    Reading reading;
    double raw1 = hw.sensor1.read(SAMPLES);
    double raw2 = hw.sensor2.read(SAMPLES);
    reading.s1 = logicalValue(hw.sensor1, raw1);
    reading.s2 = logicalValue(hw.sensor2, raw2);
    reading.e1 = reading.s1 - HWParams::SENSOR1_TARGET;
    reading.e2 = reading.s2 - HWParams::SENSOR2_TARGET;
    reading.s2InZone = hw.sensor2.inZone;
    return reading;
  }
}

bool HWTools::balanceForZoom() {
  auto& balanceFlags = flags;

  readCheck();
  if (hw.getPhase() != HWforState::Phase::ZOOM) {
    balanceFlags.zoomBalanceStableReads = 0;
    balanceFlags.zoomBalanceSteps = 0;
    balanceFlags.zoomBalanceGain = -1;
    return false;
  }

  if (balanceFlags.zoomBalanceGain != hw.gain.getLevel()) {
    balanceFlags.zoomBalanceGain = hw.gain.getLevel();
    balanceFlags.zoomBalanceStableReads = 0;
    balanceFlags.zoomBalanceSteps = 0;
  }

  double quickT = CFilteredSensor::getTfromSamples(SAMPLES);
  hw.sensor1.pushT(quickT);
  hw.sensor2.pushT(quickT);

  Reading before = readLogical(hw);

  if (withinTolerance(before.e1, before.e2)) {
    balanceFlags.zoomBalanceStableReads++;
//    USB.printf("bz,ok,g=%d,m=%d,o=%d,e1=%.1f,e2=%.1f,n=%d\n",
  //    hw.gain.getLevel(), hw.mid.getLevel(), hw.offset.getLevel(), before.e1, before.e2, balanceFlags.zoomBalanceStableReads);

    hw.sensor1.popT();
    hw.sensor2.popT();
    return balanceFlags.zoomBalanceStableReads >= REQUIRED_STABLE_READS;
  }

  balanceFlags.zoomBalanceStableReads = 0;
  if (++balanceFlags.zoomBalanceSteps > MAX_BALANCE_STEPS) {
 //   USB.printf("bz,limit,g=%d,m=%d,o=%d,e1=%.1f,e2=%.1f\n",
 //     hw.gain.getLevel(), hw.mid.getLevel(), hw.offset.getLevel(), before.e1, before.e2);
    hw.sensor1.popT();
    hw.sensor2.popT();
    balanceFlags.zoomFinishAfterBalance = false;
    hw.setPhase(HWforState::Phase::SEARCH);
    return false;
  }

  char axis = '?';
  int command = 0;

  if (std::abs(before.e1) > S1_TOLERANCE) {
    axis = 'm';
    command = clampCommand(hw.mid, directionFor(before.e1) * MID_STEP);
    if (command != 0) {
      hw.mid.offsetLevel(command);
      delayMicroseconds(10);
    }
  } else {
    axis = 'o';
    command = clampCommand(hw.offset, directionFor(before.e2) * OFFSET_STEP);
    if (command != 0) {
      hw.offset.offsetLevel(command);
      delayMicroseconds(10);
    }
  }

  Reading after = readLogical(hw);
/*
  USB.printf("bz,s,g=%d,ax=%c,m=%d,o=%d,e1=%.1f,e2=%.1f,c=%d,a1=%.1f,a2=%.1f\n",
    hw.gain.getLevel(),
    axis,
    hw.mid.getLevel(),
    hw.offset.getLevel(),
    before.e1,
    before.e2,
    command,
    after.e1,
    after.e2
  );
*/
  
  hw.sensor1.popT();
  hw.sensor2.popT();

  if (!after.s2InZone) {
//    USB.printf("bz,rail,g=%d,m=%d,o=%d,a2=%.1f\n",
//      hw.gain.getLevel(), hw.mid.getLevel(), hw.offset.getLevel(), after.e2);
    hw.setPhase(HWforState::Phase::SEARCH);
  } else if (command == 0) {
//    USB.printf("bz,stalled,g=%d,ax=%c,m=%d,o=%d,e1=%.1f,e2=%.1f\n",
//      hw.gain.getLevel(), axis, hw.mid.getLevel(), hw.offset.getLevel(), before.e1, before.e2);
    balanceFlags.zoomFinishAfterBalance = false;
    hw.setPhase(HWforState::Phase::SEARCH);
  }

  return false;
}
