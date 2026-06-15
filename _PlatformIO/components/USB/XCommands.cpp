#include "XCommands.h"
#include "HWforState.h"
#include "_HWTools.h"
#include "Config.h"


void XCommand::processFlags() const {
  CFG::commandFlags = header.cmdFlags;

  if (header.id != XCMD_SetWipers::ID) return;

  HWforState* targetHW = ActiveHW ? ActiveHW : HW;
  if (targetHW) targetHW->tools.flags.holdWipers = this->hasFlag(CommandFlags::HoldWipers);
}

void XCommand::honour() const {
 
 
  if (this->hasFlag(CommandFlags::Run__findSignal))
    HW->_findSignal();

  if (this->hasFlag(CommandFlags::Test_NoiseSample))
    HW->tools.testGetNoiseSample();
}


bool XCommand::hasFlag(CommandFlags flag) const { return ::hasFlag(header.cmdFlags, flag); }
