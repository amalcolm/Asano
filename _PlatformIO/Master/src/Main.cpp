#include "Setup.h"
#include "Hardware.h"
#include "CMasterTimer.h"
#include "CHead.h"
#include "CUSB.h"
#include "CTelemetry.h"

void setup() {
  activityLED.set();

//  CFG::setDeviceRole(CFG::DeviceRole::MASTER); // Set device role for testing with another Tennsy.
  CFG::setDebugMode(CFG::DebugMode::ON);  // Set debug mode for testing, can be OFF, ON, or SINGLE_STATE

  Head.setSequence( {
//  Head.RED8, Head.IR8             // States defined in CHead.h, also includes ALL_ON / ALL_OFF
//  zTest.FullTest,                 // Can use predefined sequences from ZTests.h
//  Head.RED1 | Head.IR1,           // use OR ( | ) to combine LEDs
  
    Head.ALL_OFF,
//    Head.RED1,
//    Head.IR1, 
//    Head.RED1 | Head.IR1,
});

  Hardware::begin();

  activityLED.clear();
}



void loop() {
  Head.setNextState();              // Set the LEDs for the next state

  if (Hardware::noiseSampleTest())  // If ready to send a noise sample, do so and skip the rest
   return;

  USB.update();                     // Send USB data from the previous state

  if (CFG::isMaster())
    A2D.read24bitData();

  Head.waitForReady();              // Wait until Head is ready AND sets A2D to start reading

  while (Hardware::canUpdate())     // Loop until state duration has elapsed
    Hardware::update();             //   Update hardware components

  CTelemetry::logAll();             // Log all counter telemetry

  Timer.honourOffTime();            // Ensure 10mW per second limit is respected

  activityLED.toggle();             // Indicate activity on LED
}
