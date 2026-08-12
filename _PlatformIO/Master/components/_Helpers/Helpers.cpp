#include <deque>
#include "WString.h"
#include <ranges>

#include "CA2D.h" 
#include "CHead.h"
#include "CTimer.h"
#include "CMasterTimer.h"
#include "CUSB.h"
#include "Setup.h"
#include "HWforState.h"
#include "Helpers.h"
#include "PinHelpers.h"

HWforState* HW = nullptr;
HWforState* ActiveHW = nullptr;


// =====================================================================================================
//  Global instances of hardware components and helpers
// =====================================================================================================


ChipSelectPins CS;
SensorPins     SP;
ButtonPins     BUT;
LEDpins        LED;  // implementation in LEDpins.cpp,
CMasterTimer   Timer;
CA2D           A2D;
CHead          Head;
CUSB           USB;

OutputPin activityLED(4);
bool Ready = false;

// =====================================================================================================
//  LEDpins implementation
// =====================================================================================================

// =====================================================================================================
// Gets a object containing hardware instances corresponding to the given state, creating it if needed.
// =====================================================================================================

HWforState* getHWforState(StateType state) {
  static std::deque<HWforState> stateHWs;

  if (state == DIRTY) state = Head.getState();
  
  for (auto& hw : stateHWs)
    if (hw.state == state)
      return &hw;
  
  stateHWs.emplace_back(state);
  if (Ready)
    stateHWs.back().begin();

  return &stateHWs.back();
}

HWforState* getHWforState(BlockType* block) {
  return getHWforState(block ? block->state : DIRTY);
}

HWforState* getHWforState(DataType& data) {
  return getHWforState(data.state);
}

