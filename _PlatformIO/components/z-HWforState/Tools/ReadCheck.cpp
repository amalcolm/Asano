#include "_HWTools.h"
#include "HWforState.h"

int16_t HWTools::readCheck() {

  int s2 = hw.sensor2.read(1);  // uses filtered sensor 
  if (hw.sensor2.inZone == false) {
    hw.setPhase(HWforState::Phase::SEARCH);
  }
  return static_cast<int16_t>(s2);
}
