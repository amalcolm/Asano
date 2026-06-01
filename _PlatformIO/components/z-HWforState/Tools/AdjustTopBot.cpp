#include "_HWTools.h"
#include "HWforState.h"

void HWTools::adjustTopBot() {
 
  int WIPER_LOW  = CDigiPot::MIDPOINT - HWParams::MID_STEP;
  int WIPER_HIGH = CDigiPot::MIDPOINT + HWParams::MID_STEP;


  int direction = 0;
  int wiperLevel = hw.mid.getLevel();

  if (wiperLevel < WIPER_LOW ) direction = +1;
  else
  if (wiperLevel > WIPER_HIGH) direction = -1;

  if (direction != 0) {
    hw.top.offsetLevel(direction);
    hw.bot.offsetLevel(direction);
    hw.mid.offsetLevel(direction * HWParams::MID_STEP);
    delayMicroseconds(10);
  }

}
