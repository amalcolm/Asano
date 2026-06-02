#include "HWforState.h"
#include "_HWTools.h"
#include "CDiffAmp.h"
#include "CUSB.h"

void HWforState::setWipers(XCMD_SetWipers& cmd) {
  auto& flags = tools.flags;

  bool holdRequested = cmd.hasFlag(CommandFlags::HoldWipers);

  if (!holdRequested && cmd.top == 0 && cmd.bot == 0) { // release hold
    flags.holdWipers = false;
    return;
  }

  int offsetChange = cmd.offset - offset.getLevel();
  if (offsetChange != 0) {
    double change = tools.diffAmp.sensor2DeltaFromOffsetDelta(offsetChange, gain.getLevel());
    USB.printf("Offset change: %d, Sensor2 change: %f\n", offsetChange, change);
    sensor2.offset_lastV(change);
  }

  top   .setLevel(cmd.top);
  bot   .setLevel(cmd.bot);
  mid   .setLevel(cmd.mid);
  offset.setLevel(cmd.offset);
  gain  .setLevel(cmd.gain);
}
