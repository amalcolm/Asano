#include "Setup.h"
#include "Hardware.h"
#include "HWforState.h"
#include "Helpers.h"
#include "CUSB.h"
#include "CA2D.h"
#include "CHead.h"
#include "CTimer.h"
#include "CTelemetry.h"
#include "HWforState.h"

void Hardware::begin() {
    SPI .begin();  // initialise SPI

    // Initialize USB
    USB .begin().printf("CPU Frequency: %.0f Mhz\r\n", F_CPU / 1000000.0f);


    // initialize buttons and LEDs
    BUT .begin();
    LED .begin();

    // Initialize hardware components
    Head.begin();
    A2D .begin();

    delay(1); // Allow time for hardware to stabilize (ample)

    // ensure A2D has a valid getLastDataTime();
    while (A2D.poll() == false)
      delayMicroseconds(5);

    Timer.restart();
}


static double    STATE_DURATION = 1.0 * CFG::STATE_DURATION_uS     * 0.000'001; // convert to seconds
static double A2D_POLL_DURATION = 1.5 * CFG::A2D_READING_PERIOD_uS * 0.000'001; // convert to seconds


bool Hardware::canUpdate() {
  bool doUpdate = true;
  doUpdate &= (Timer.sampleReady == false); 
  doUpdate &= (Timer.getStateTime() + A2D_POLL_DURATION < STATE_DURATION);

  if (doUpdate == false) // we are droppng out of the outer while loop,
    firstCallInCycle = true;  //  so set first for next cycle
  
  return doUpdate;
}

bool Hardware::debugLayerOverride() {
  static CTeleCounter TC_Update{TeleGroup::HARDWARE, 1};
  static CTelePeriod  TP_Update{TeleGroup::HARDWARE, 2};

  static C32bitTimer sampleTimer = C32bitTimer::From_S(3.1).setPeriodic(true); 

  TP_Update.measure();
  TC_Update.increment();

   if (firstCallInCycle && sampleTimer.passed()) {
    HW->testGetNoiseSample();
    Timer.sampleReady = true;
    USB.doWriteDebug();
    USB.setSkipFlag(); // avoid sending empty block 
    return true;
  }
  firstCallInCycle = false;
 return false;
}

void Hardware::update() {

  if ((debugLayerOverride())) return;

  if (A2D.poll() == false) { yield(); return; }

  if (Timer.sampleReady) return;

  if (Timer.getStateTime() + A2D_POLL_DURATION < STATE_DURATION)
    HW->update();  // update digital pots based on current state
}


void Hardware::offPeriod() {
  static C32bitTimer offTimer = C32bitTimer::From_uS(CFG::LED_OFF_PEERIOD_uS).setPeriodic(false);

  offTimer.forceNow();
  LED.clear();

  A2D.setReadState(CA2D::ReadState::PREPARE); 
  USB.update();
  CTelemetry::logAll();             // Log all counter telemetry

  offTimer.wait();
  A2D.setReadState(CA2D::ReadState::READ);
}
