#include "HWforState.h"
#include "_HWTools.h"
#include "Config.h"
#include <tuple>

  static constexpr std::tuple<int, int, int, int, int> knownConfigs[] = {
  //  {71, 47, 175, 181, 12},    {71, 47, 175, 181,164},
      {74, 50, 170, 152, 12},    {74, 50, 170, 152,164},

  };


struct DBGflags { StateType state; bool started = false; double startTime = -1.0; double markTime = -1.0;
  bool toggle = false;
};
DBGflags& getDBGflags(StateType state);
bool setKnownConfig(int cfg);


int count = 0;
int offsets[3] = {-1, 0, +1};
uint8_t _staticBaseValue = 128;

void HWTools::dbg() {

  auto& [_, started, startTime, markTime, toggle] = getDBGflags(HW->state);

  if (startTime < 0.0) { if (HW->sensor2.inZone)  startTime = Timer.getConnectTime(); else return; }

  uint8_t baseValue = CFG::hasCommandByte() ? CFG::getCommandByte() : _staticBaseValue;

  double now = Timer.getConnectTime() - startTime;

  if (now < 1.0) return; // only start toggling after a second to allow settling

  if (!started) { started = true; markTime = now;
    
    flags.wipersChanged = true;
    flags.holdWipers = true;
    
    baseValue = HW->mid.getLevel();
  }

  if (now - markTime >= 2.0) { // toggle every 2 seconds
    markTime = now;
    toggle = !toggle;

    HW->mid.setLevel(baseValue + offsets[count % 3]);
    count++;
  }
}

  


// DBGflags management
#include <deque>

std::deque<DBGflags> s_dbgFlags;

DBGflags& getDBGflags(StateType state) {
  for (auto& flags : s_dbgFlags) if (flags.state == state) return flags;

  s_dbgFlags.push_back({state});
  return s_dbgFlags.back();
}

bool setKnownConfig(int cfg) {
  static constexpr int numKnownConfigs = sizeof(knownConfigs) / sizeof(knownConfigs[0]);

  if (cfg < 0 || cfg >= numKnownConfigs) return false;

  auto [top, bot, mid, offset, gain] = knownConfigs[cfg];

    HW->top   .setLevel(top   );
    HW->bot   .setLevel(bot   );
    HW->mid   .setLevel(mid   );
    HW->offset.setLevel(offset);
    HW->gain  .setLevel(gain  );
    delayMicroseconds(10);
    return true;
}

// TOP/BOT -> MID_STEP
//    {61, 59, 190, 128, 5},    {60, 58,  83, 128, 5},    // GAP_TOPBOT = 2   MID_STEP = 107
//    {60, 56, 170, 128, 5},    {59, 55, 100, 128, 5},    // GAP_TOPBOT = 4   MID_STEP = 70
//    {63, 55, 205, 128, 5},    {62, 54, 165, 128, 5},    // GAP_TOPBOT = 8   MID_STEP = 40
//    {66, 54, 165, 128, 5},    {65, 53, 137, 128, 5},    // GAP_TOPBOT = 12  MID_STEP = 28
//    {69, 53, 128, 128, 5},    {68, 52, 106, 128, 5},    // GAP_TOPBOT = 16  MID_STEP = 22
//    {72, 48, 128, 128, 5},    {71, 47, 111, 128, 5},    // GAP_TOPBOT = 20  MID_STEP = 17

