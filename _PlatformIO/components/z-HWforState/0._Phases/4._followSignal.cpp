#include "HWforState.h"
#include "_HWTools.h"

void HWforState::_followSignal() {
  tools.readCheck(); if (phase != Phase::FOLLOW) return; // check if signal is lost before attempting to follow

  if (mid.getLevel() < HWParams::SAFE_MIN_WIPER_LEVEL || mid.getLevel() > HWParams::SAFE_MAX_WIPER_LEVEL) 
    tools.adjustTopBot(); 

  
}