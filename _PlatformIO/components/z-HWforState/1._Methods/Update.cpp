#include "HWforState.h"
#include "_HWTools.h"


// update hardware instances based on current sensor readings, and write to hardware if needed
void HWforState::update() { if (!Ready) return; else if (tools.flags.begun == false) begin();

  Timer.addEvent(EventKind::HW_UPDATE_START);

  _update();

  if (CFG::hasCommandFlag(CommandFlags::RunDebugUpdate)) 
    tools.dbg();  // defined in _DBG.cpp
  
  Timer.addEvent(EventKind::HW_UPDATE_COMPLETE);
}


void HWforState::_update() {
  auto& flags = tools.flags;

  if (flags.holdWipers) { _readSensor2(); return; }

  if (sensor1.inZone == false) phase = Phase::SEARCH;

  if (phase == Phase::SEARCH )    _findSignal();
  if (phase == Phase::ZOOM   )    _zoomSignal();
  if (phase == Phase::MEASURE) _measureSignal();
  if (phase == Phase::FOLLOW )  _followSignal();

  _readSensor2();

}
