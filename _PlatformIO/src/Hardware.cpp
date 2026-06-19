#include "Setup.h"
#include "Hardware.h"
#include "HWforState.h"
#include "_HWTools.h"
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
    USB .begin().printf("CPU Frequency: %.3lf Mhz\n", F_CPU / 1000000.0);


    // initialize buttons and LEDs
    BUT .begin();
    LED .begin();

    // Initialize hardware components
    Head.begin();
    A2D .begin();

    delay(1); // Allow time for hardware to stabilize (ample)

    // ensure A2D has a valid getLastDataTime();
    for (int i = 0; A2D.poll() == false; i++) {
      if (i > 100)
        ERROR("A2D did not have valid data.\n");  // doesn't return
        
      delayMicroseconds(5);
    }
    
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

bool Hardware::noiseSampleTest() {
  static C32bitTimer sampleTimer = C32bitTimer::From_Hz(5.0).setPeriodic(true);

  HWforState* targetHW = ActiveHW ? ActiveHW : HW;
  if (firstCallInCycle && targetHW == HW && sampleTimer.passed()) {
    targetHW->tools.testGetNoiseSample();
    USB.update();

    return true;
  }
  firstCallInCycle = false;
  return false;
}


void Hardware::update() {
  static CTeleCounter TC_Update{TeleGroup::HARDWARE, 1};
  static CTelePeriod  TP_Update{TeleGroup::HARDWARE, 2};

  TP_Update.measure();
  TC_Update.increment();


  if (A2D.poll() == false) { yield(); return; }

  if (Timer.sampleReady) return;

  if (Timer.getStateTime() + A2D_POLL_DURATION < STATE_DURATION)
    HW->update();  // update digital pots based on current state
}
