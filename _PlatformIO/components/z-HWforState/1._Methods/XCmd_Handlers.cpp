#include "HWforState.h"
#include "_HWTools.h"
#include "CCircuit.h"
#include "CUSB.h"
#include <algorithm>
#include <cmath>

namespace {
  constexpr double MIN_OFFSET_STEP = 1e-9;

  uint8_t clampWiper(int value) {
    return static_cast<uint8_t>(std::clamp(value, CDigiPot::WIPER_MIN, CDigiPot::WIPER_MAX));
  }
}

void HWforState::setWipers(XCMD_SetWipers& cmd) {
  auto& flags = tools.flags;

  bool holdRequested = cmd.hasFlag(CommandFlags::HoldWipers);
  bool holdSensor2Requested = cmd.hasFlag(CommandFlags::HoldSensor2);
  flags.holdWipers = holdRequested;
  flags.holdSensor2 = holdSensor2Requested;

  const int currentTop = top.getLevel();
  const int currentBot = bot.getLevel();
  const int currentMid = mid.getLevel();
  const int currentOffset = offset.getLevel();

  const bool topBotChanged = cmd.top != currentTop || cmd.bot != currentBot;
  const bool compensateTopBot = holdSensor2Requested && topBotChanged;

  double currentMidVoltage = 0.0;
  if (compensateTopBot) {
    currentMidVoltage = tools.circuit.midVoltageVolts(currentTop, currentBot, currentMid);
    int suggestedMid = clampWiper(tools.circuit.bestMidForVoltage(cmd.top, cmd.bot, currentMidVoltage));


    int direction = cmd.top > currentTop ? +1 : -1;
    int delta = direction * 67;

    cmd.mid = clampWiper(currentMid + delta);
    cmd.offset = clampWiper(currentOffset + direction);

    USB.printf("topBot: suggested delta: %d, actual delta: %d\n", suggestedMid - currentMid, cmd.mid - currentMid);
  }

  top   .setUserLevel(cmd.top);
  bot   .setUserLevel(cmd.bot);
  mid   .setUserLevel(cmd.mid);
  offset.setUserLevel(cmd.offset);
  gain  .setUserLevel(cmd.gain);
}
