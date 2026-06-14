#include "CMasterTimer.h"
#include "Setup.h"
#include "CA2D.h"
#include "CHead.h"
#include "CTelemetry.h"
#include <cstdint>

static uint64_t ONE_SECOND_TICKS = CTimerBase::secondsToTicks(1.0);

uint32_t HEAD_DELAY_TICKS = CTimerBase::microsecondsToTicks(CFG::HEAD_SETTLE_TIME_uS);
uint32_t A2D_OFFSET_TICKS = CTimerBase::microsecondsToTicks(1);  // 1uS offset helps with interference

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


void  CMasterTimer::setConnectTime() {
  s_connectTime = CTimer::time(); 

  _timingQueue.clear();
  _validSetTime = false;
  _lastSetTime = 0;
  _offTimeTicks = 0;
}


void CMasterTimer::updateOffTime(int unsetPins, uint64_t unsetTime, int setPins, uint64_t setTime) {
  TimingRecord* record = nullptr;

  if (_validSetTime) {

    if (unsetTime > ONE_SECOND_TICKS) {
      uint64_t endTime = unsetTime - ONE_SECOND_TICKS;

      while (_timingQueue.isEmpty() == false) {
        if (_timingQueue.peek()->endTime > endTime) break;
        _timingQueue.returnFirst();
      }
    }

    record = _timingQueue.getNext();  if (record == nullptr) ERROR("Timing queue overflow");
    record->pinsOn = unsetPins;
    record->startTime = _lastSetTime;
    record->endTime = (unsetPins == 0) ? unsetTime : setTime;
    record->duration = record->endTime - record->startTime;
  }



  _lastSetTime = (setPins == 0) ? setTime : unsetTime;
  _validSetTime = true;
}


void CMasterTimer::honourOffTime() const {
  if (_offTimeTicks == 0) return; // no off time to honour

  LED.ensureOff(); // ensure all LEDs are off

  uint64_t end = CTimer::time() + _offTimeTicks;

  while (CTimer::time() < end) {
    yield();
  }
}