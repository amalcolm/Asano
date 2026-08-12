#include "Setup.h"
#include "Hardware.h"
#include "HWforState.h"
#include "CMasterTimer.h"
#include "CHead.h"
#include "CUSB.h"
#include "Config.h"
#include "Helpers.h"


void setup() {
  activityLED.set();

  Hardware::begin();

  Ready = true;

  HW = getHWforState(Head.RED1);

  activityLED.clear();
}


void loop() {
  while (!Serial) yield(); // wait for Serial to be ready before outputting debug info

  USB.update();

  HWforState* targetHW = ActiveHW ? ActiveHW : HW;
  targetHW->set();
  targetHW->update();

  Timer.state.wait();
  activityLED.toggle();             // Indicate activity on LED
}
