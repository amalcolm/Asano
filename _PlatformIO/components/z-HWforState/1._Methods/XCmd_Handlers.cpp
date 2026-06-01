#include "HWforState.h"
#include "_HWTools.h"

void HWforState::setWipers(XCMD_SetWipers& cmd) {
  auto& flags = tools.flags;

  bool holdRequested = cmd.hasFlag(CommandFlags::HoldWipers);

  if (!holdRequested && cmd.top == 0 && cmd.bot == 0) { // release hold
    flags.holdWipers = false;
    return;
  }

  top   .setLevel(cmd.top);
  bot   .setLevel(cmd.bot);
  mid   .setLevel(cmd.mid);
  offset.setLevel(cmd.offset);
  gain  .setLevel(cmd.gain);
}
