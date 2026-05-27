#include "Setup.h"
#include "Hardware.h"
#include "CMasterTimer.h"
#include "CHead.h"
#include "CUSB.h"
#include "Config.h"
#include "CTelemetry.h"

void setup() {
  activityLED.set();

  Head.setSequence( {
//  Head.RED8, Head.IR8             // States defined in CHead.h, also includes ALL_ON / ALL_OFF
//  zTest.FullTest,                 // Can use predefined sequences from ZTests.h
//  Head.RED1 | Head.IR1,           // use OR ( | ) to combine LEDs
    
    Head.ALL_OFF,
});

  Hardware::begin();

  activityLED.clear();
}



void loop() {
  static constexpr bool doOffPeriod = CFG::LED_OFF_PEERIOD_uS > 0;

  if (doOffPeriod) 
    Hardware::offPeriod();          // turn off LEDs for a period to reduce power during which we do USB.update and Ctelemetry::logAll 

  Head.setNextState();              // Set the LEDs for the next state

  Head.waitForReady();              // Wait until Head is ready AND sets A2D to start reading

  while (Hardware::canUpdate())     // Loop until state duration has elapsed
    Hardware::update();             //   Update hardware components


  if (doOffPeriod == false) {
    if (USB.getSkipFlag() == false) {
      USB.update();                   // send USB data during whilst eaiting   
      CTelemetry::logAll();           // Log all counter telemetry
    }
    else
      USB.clearSkipFlag();
  } 

  activityLED.toggle();             // Indicate activity on LED
}
