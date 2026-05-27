#include "XCommands.h"
#include "HWforState.h"
#include "Config.h"


void XCommand::processFlags() const {
   CFG::commandFlags = header.cmdFlags;
 
    HW->flags.holdWipers = this->hasFlag(CommandFlags::HoldWipers);
}

void XCommand::honour() const {
 
 
  if (this->hasFlag(CommandFlags::Run__findSignal))
    HW->_findSignal();

  if (this->hasFlag(CommandFlags::Test_NoiseSample))
    HW->testGetNoiseSample();
}


bool XCommand::hasFlag(CommandFlags flag) const { return ::hasFlag(header.cmdFlags, flag); }
