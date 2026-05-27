#include "CTimer.h"
#include "../teensy_compat.h"

extern "C" void irq_gpt1(void);
bool isInitialized = false;

CTimer::CTimer() : CTimerBase() {

  if (isInitialized == false) {
    initGPT1(irq_gpt1);  // from CTimerBase, sets up GPT1 and the interrupt handler to check the time regularly.
                         // This avoids missing ARM_DWT_CYCCNT overflows if the counter wraps without being accounted for.

    callibrate();

    isInitialized = true;
  }
  
  restart();
}


void CTimer::callibrate() {
  s_calibration = 0;      // ensure no calibration offset
  restart();
  s_calibration = elapsed(); // ie. time taken to call the time() function, which is subtracted from all future readings
}

// Teensy 4.x hardware timer base (GPT1)
extern "C" void irq_gpt1(void) {
    GPT1_SR = GPT_SR_OF1 | GPT_SR_OC1;  // clear both flags
    (void)CTimer::timeAbsolute();             // Handle ARM_DWT_CYCCNT overflows if timer not read frequently
}

