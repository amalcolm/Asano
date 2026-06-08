#include "HWforState.h"
#include "_HWTools.h"
#include "CCircuit.h"
#include "HWforState.h"
#include "C32bitTimer.h"
#include "CA2D.h"

namespace {
  constexpr int SAMPLES_IN_TESTREAD = 20;
}

void HWforState::_measureSignal() {
  auto&   flags = tools.flags;
  auto& circuit = tools.circuit;
  
  tools.readCheck(); if (phase != Phase::MEASURE) return; // check if signal is lost before attempting to measure

  double oldT_Sensor2 = sensor2.getT();
  double newT_Sensor2 = sensor2.getTfromSamples(SAMPLES_IN_TESTREAD);

  sensor2.setT(newT_Sensor2); 

  flags.s2Delta_offset = circuit.sensor2DeltaFromOffsetDelta(1);
  flags.s2Delta_mid = circuit.sensor2DeltaFromMidDelta(HWParams::MID_STEP, sensor2.read(SAMPLES_IN_TESTREAD));  // 95% settled after read


  phase = Phase::FOLLOW;

}