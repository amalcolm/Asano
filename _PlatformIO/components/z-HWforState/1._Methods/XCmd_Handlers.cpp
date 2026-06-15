#include "HWforState.h"
#include "_HWTools.h"
#include "CCircuit.h"
#include "CUSB.h"

void HWforState::setWipers(XCMD_SetWipers& cmd) {
  auto& flags = tools.flags;

  bool holdRequested = cmd.hasFlag(CommandFlags::HoldWipers);
  flags.holdWipers = holdRequested;

  if (!holdRequested && cmd.top == 0 && cmd.bot == 0) { // release hold
    return;
  }

  int midChange = cmd.mid - mid.getLevel();
  if (midChange != 0) {
    double change = tools.circuit.sensor2DeltaFromMidDelta(midChange, sensor2.lastV());
    USB.printf("Mid change: %d, Sensor2 change: %f\n", midChange, change);
    sensor2.offset_lastV(change);
    sensor2.offset_Env(-change);
  }

  int offsetChange = cmd.offset - offset.getLevel();
  if (offsetChange != 0) {
    double change = tools.circuit.sensor2DeltaFromOffsetDelta(offsetChange);
    USB.printf("Offset change: %d, Sensor2 change: %f\n", offsetChange, change);
    sensor2.offset_lastV(change);
    sensor2.offset_Env(-change);
  }

  top   .setUserLevel(cmd.top);
  bot   .setUserLevel(cmd.bot);
  mid   .setUserLevel(cmd.mid);
  offset.setUserLevel(cmd.offset);
  gain  .setUserLevel(cmd.gain);
}
