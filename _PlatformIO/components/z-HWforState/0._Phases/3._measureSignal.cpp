#include "HWforState.h"
#include "_HWTools.h"
#include "CCircuit.h"
#include "HWforState.h"
#include "C32bitTimer.h"
#include "CA2D.h"

void HWforState::_measureSignal() {
//  auto&   flags = tools.flags;
//  auto& circuit = tools.circuit;
  
  tools.readCheck(); if (phase != Phase::MEASURE) return; // check if signal is lost before attempting to measure

  tools.cache.set();

  phase = Phase::FOLLOW;

}