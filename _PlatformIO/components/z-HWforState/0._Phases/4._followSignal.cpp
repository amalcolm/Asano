#include "HWforState.h"
#include "_HWTools.h"
#include "CCircuit.h"
#include <algorithm>
#include <cmath>

namespace {
  constexpr int FOLLOW_SAMPLES = 12;
  constexpr double S1_DEADBAND = 4.0;
  constexpr double S2_DEADBAND = 40.0;

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

  sensor1.read(FOLLOW_SAMPLES);
  sensor2.read(FOLLOW_SAMPLES);
  double e1 = sensor1.lastValue() - HWParams::SENSOR1_TARGET;
  double e2 = sensor2.lastValue() - HWParams::SENSOR2_TARGET;

  if (std::abs(e1) > S1_DEADBAND) {
    int command = clampCommand(mid, directionFor(e1));
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

  sensor2.read(FOLLOW_SAMPLES);
  e2 = sensor2.lastValue() - HWParams::SENSOR2_TARGET;
  if (std::abs(e2) > S2_DEADBAND) {
    int command = clampCommand(offset, directionFor(e2));
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
