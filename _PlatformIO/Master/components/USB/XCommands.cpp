#include "XCommands.h"
#include "HWforState.h"
#include "_HWTools.h"
#include "Config.h"
#include "Helpers.h"
#include "CHead.h"
#include "CUSB.h"
#include <cstring>

void XCommand::processFlags() const {
  CFG::commandFlags = header.cmdFlags;

  HWforState* targetHW = ActiveHW ? ActiveHW : HW;

  if (targetHW) {
    targetHW->tools.flags.holdWipers  = this->hasFlag(CommandFlags::HoldWipers);
    targetHW->tools.flags.holdSensor2 = this->hasFlag(CommandFlags::HoldSensor2);
  }
}

void XCommand::honour() const {
 
 
  if (this->hasFlag(CommandFlags::Run__findSignal))
    HW->_findSignal();

  if (this->hasFlag(CommandFlags::Test_NoiseSample))
    HW->tools.testGetNoiseSample();
}


bool XCommand::hasFlag(CommandFlags flag) const { return ::hasFlag(header.cmdFlags, flag); }


void XCommand::process(uint8_t* pRead, size_t packetSize) {
  XCommand* cmd = reinterpret_cast<XCommand*>(pRead);
  uint8_t id = cmd->header.id;
  bool handledCommand = true;

  // process active state first, as it may change ActiveHW for cmd->processFlags()
  if (id == XCMD_SetActiveState::ID) { XCMD_SetActiveState activeState; std::memcpy(&activeState, pRead, packetSize);

    if (activeState.state != UNSET && activeState.state != DIRTY)
      ActiveHW = getHWforState(activeState.state);
  }

  // process command flags
  cmd->processFlags();

  // process command based on ID
  switch (id) {
    case XCMD_SetWipers::ID: { XCMD_SetWipers setWipers; std::memcpy(&setWipers, pRead, packetSize);

      HWforState* targetHW = ActiveHW ? ActiveHW : HW;
      if (targetHW) targetHW->setWipers(setWipers);
      break;
    }

    case XCMD_SetState::ID: { XCMD_SetState setState; std::memcpy(&setState, pRead, packetSize);

      Head.setStateForDebug(setState.state);

      USB.writeDebugState(setState.state);
      break;
    }

    case XCMD_SetDebugFlags::ID: { XCMD_SetDebugFlags debugFlags; std::memcpy(&debugFlags, pRead, packetSize);
      // not used currently, but must be present to handle command flags in headers
      break;
    }

    case XCMD_SetSequence::ID: { XCMD_SetSequence setSequence; std::memcpy(&setSequence, pRead, packetSize);
      bool valid = setSequence.count > 0 && setSequence.count <= XCMD_SetSequence::MAX_STATES;

      for (uint8_t i = 0; valid && i < setSequence.count; ++i)
        valid = (setSequence.states[i] & ~CHead::VALIDBITS) == 0;

      if (valid) {
        std::span<const StateType> sequence{setSequence.states, setSequence.count};
        Head.setSequence({sequence});
      } else {
        handledCommand = false;
      }

      break;
    }
    
    case XCMD_SetActiveState::ID: 
      // handled above, but must be present here to avoid unhandled command
      break;
    

    default:
      handledCommand = false;
      break;
  }

  // finally, if command has been handled, honour any command flags in the header
  if (handledCommand) {
    cmd->honour();
  }

}
