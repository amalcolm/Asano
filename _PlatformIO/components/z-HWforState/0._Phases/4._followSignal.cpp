#include "HWforState.h"
#include "_HWTools.h"
#include "CCircuit.h"
#include <algorithm>
#include <cmath>

namespace {
  constexpr int FOLLOW_SAMPLES = 12;
  constexpr double S1_DEADBAND = 1.5;
  constexpr double S2_DEADBAND = 40.0;

  int getChange(const CDigiPot& pot, double error) {
    int level = pot.getLevel();    if (error == 0.0) return 0;

    // error = sensor - target, so positive error requests a lower wiper level.
    int requested = error > 0.0 ? level - 1 : level + 1;
    return std::clamp(requested, CDigiPot::WIPER_MIN, CDigiPot::WIPER_MAX) - level;
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
    int delta = getChange(mid, e1);
    if (delta != 0) {
      double change = tools.circuit.sensor2DeltaFromMidDelta(delta, sensor2.lastV());
      mid.changeBy(delta);
      _compensateSensor2(change);
    } else {
      tools.adjustTopBot();
    }
    return;
  }

  sensor2.read(FOLLOW_SAMPLES);
  e2 = sensor2.lastValue() - HWParams::SENSOR2_TARGET;
  if (std::abs(e2) > S2_DEADBAND) {
    int delta = getChange(offset, e2);
    if (delta != 0) {
      double change = tools.circuit.sensor2DeltaFromOffsetDelta(delta);
      offset.changeBy(delta);
      _compensateSensor2(change);
    } else {
      phase = Phase::SEARCH;
    }
  }
}
