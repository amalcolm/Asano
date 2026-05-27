#include "HWforState.h"

void HWforState::_followSignal() {
  readCheck(); if (phase != Phase::FOLLOW) return; // check if signal is lost before attempting to follow

  if (mid.getLevel() < SAFE_MIN_WIPER_LEVEL || mid.getLevel() > SAFE_MAX_WIPER_LEVEL) 
    adjustTopBot(); 

  
}