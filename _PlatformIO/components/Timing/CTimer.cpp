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

int64_t CTimer::time() {
  static uint32_t s_lastReading = 0;
  static int64_t  s_offset      = 0;
  static constexpr int64_t s_increment = int64_t{1} << 32;

  uint32_t primask = __get_primask(); // save current interrupt state

  uint32_t current = ARM_DWT_CYCCNT;

  if (current < s_lastReading) s_offset += s_increment;

  s_lastReading = current;

  int64_t result = s_offset + static_cast<int64_t>(current) - s_calibration;

  __set_primask(primask); // set previous interrupt state

  return result;
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

