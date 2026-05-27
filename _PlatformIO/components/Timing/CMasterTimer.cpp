#include "CMasterTimer.h"
#include "Setup.h"
#include "CA2D.h"
#include "CHead.h"
#include "CTelemetry.h"
#include <cstdint>


uint32_t HEAD_DELAY_TICKS = CTimerBase::microsecondsToTicks(CFG::HEAD_SETTLE_TIME_uS);
uint32_t A2D_OFFSET_TICKS = CTimerBase::microsecondsToTicks(1);

CMasterTimer::CMasterTimer() : CTimer() { }
 
void CMasterTimer::syncAndChangeState() { 
  if (state.passed()) {} // if we've passed the next state, sync to the following period marker
  uint32_t now = state.wait();

  Head.resetAt(now + HEAD_DELAY_TICKS);
   A2D.resetAt(now + HEAD_DELAY_TICKS + A2D_OFFSET_TICKS); 

  sampleReady = false;
}

bool CMasterTimer::addEvent(const enum EventKind kind, double stateTime) {
  if (stateTime < 0) stateTime = state.getSeconds();
  
  CA2D* pA2D = &::A2D;  // get singleton from global to avoid conflict with member name A2D

  return pA2D->tryAddEvent(kind, stateTime);
  
}
