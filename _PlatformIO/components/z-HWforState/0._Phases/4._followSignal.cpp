#include "HWforState.h"
#include "_HWTools.h"
#include "CCircuit.h"
#include <algorithm>
#include <cmath>

namespace {
  constexpr int FOLLOW_SAMPLES = 12;
  constexpr int MID_STEP = 1;
  constexpr int OFFSET_STEP = 1;
  constexpr double S1_DEADBAND = 4.0;
  constexpr double S2_DEADBAND = 40.0;

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

  void compensateSensor2Estimate(HWforState& hw, double change) {
    hw.sensor2.offset_lastV(change);
    hw.sensor2.offset_Env(-change);
  }
}

void HWforState::_followSignal() {
  tools.readCheck(); if (phase != Phase::FOLLOW) return; // check if signal is lost before attempting to follow

  if (mid.getLevel() < HWParams::SAFE_MIN_WIPER_LEVEL || mid.getLevel() > HWParams::SAFE_MAX_WIPER_LEVEL) {
    tools.adjustTopBot();
    return;
  }

  double s1 = logicalValue(sensor1, sensor1.read(FOLLOW_SAMPLES));
  double s2 = logicalValue(sensor2, sensor2.read(FOLLOW_SAMPLES));
  double e1 = s1 - HWParams::SENSOR1_TARGET;
  double e2 = s2 - HWParams::SENSOR2_TARGET;

  if (std::abs(e1) > S1_DEADBAND) {
    int command = clampCommand(mid, directionFor(e1) * MID_STEP);
    if (command != 0) {
      double change = tools.circuit.sensor2DeltaFromMidDelta(command, sensor2.lastV());
      mid.offsetLevel(command);
      compensateSensor2Estimate(*this, change);
      delayMicroseconds(10);
    } else {
      tools.adjustTopBot();
    }
    return;
  }

  if (std::abs(e2) > S2_DEADBAND) {
    int command = clampCommand(offset, directionFor(e2) * OFFSET_STEP);
    if (command != 0) {
      double change = tools.circuit.sensor2DeltaFromOffsetDelta(command);
      offset.offsetLevel(command);
      compensateSensor2Estimate(*this, change);
      delayMicroseconds(10);
    } else {
      phase = Phase::SEARCH;
    }
  }
}
