#include "Setup.h"
#include "Hardware.h"
#include "HWforState.h"
#include "CMasterTimer.h"
#include "CHead.h"
#include "CUSB.h"
#include "Config.h"
#include "Helpers.h"

void _setup() {
  activityLED.set();

  Hardware::begin();

  Ready = true;

  HW = getHWforState(Head.RED1);

  activityLED.clear();
}


void _loop() {
  while (!Serial) yield(); // wait for Serial to be ready before outputting debug info

  HW->update();
  delay(1000);
  activityLED.toggle();             // Indicate activity on LED
}
