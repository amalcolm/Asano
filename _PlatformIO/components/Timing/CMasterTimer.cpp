#include "CMasterTimer.h"
#include "Setup.h"
#include "CA2D.h"
#include "CHead.h"
#include "CTelemetry.h"
#include <cstdint>

static uint64_t ONE_SECOND_TICKS = CTimerBase::secondsToTicks(1.0);
static uint64_t STATES_PER_SECOND = static_cast<uint64_t>(1'000'000.0 / CFG::STATE_DURATION_uS);

uint32_t HEAD_DELAY_TICKS = CTimerBase::microsecondsToTicks(CFG::HEAD_SETTLE_TIME_uS);
uint32_t A2D_OFFSET_TICKS = CTimerBase::microsecondsToTicks(1);  // 1uS offset helps with interference

CMasterTimer::CMasterTimer() : CTimer() {
  resetOffTiming();
 }
 
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

  resetOffTiming();
}


void CMasterTimer::updateOffTime(int unsetPins, uint64_t unsetTime, int setPins, uint64_t setTime) {
  TimingRecord* record = nullptr;

  uint64_t recordEndTime = unsetTime;
  uint64_t nextStartTime = setTime;

  if (unsetPins > 0 || setPins > 0) { // set times to whichever has the lesser pins on
    uint64_t time = (setPins < unsetPins) ? setTime : unsetTime;

    recordEndTime = time;
    nextStartTime = time;
  }

  if (_validSetTime) {

    if (setTime > ONE_SECOND_TICKS) {
      uint64_t endTime = setTime - ONE_SECOND_TICKS;

      while (_timingQueue.isEmpty() == false) {
        record = _timingQueue.peek();
        if (record->endTime > endTime) break;
        
        _totalWeight -= record->weight;
        _timingQueue.returnFirst();
      }
    }

    if (recordEndTime > _lastSetTime) {
      record = _timingQueue.getNext();  if (record == nullptr) ERROR("Timing queue overflow");
      record->pinsOn = unsetPins;
      record->startTime = _lastSetTime;
      record->endTime = recordEndTime;
      record->duration = recordEndTime - _lastSetTime;

      record->weight = static_cast<uint64_t>(record->pinsOn-1) * record->duration;

      _totalWeight += record->weight;
    }
  }

  _offTimeTicks = (_totalWeight / STATES_PER_SECOND);

  _lastSetTime = nextStartTime;
  _validSetTime = true;
}


void CMasterTimer::resetOffTiming() {
  _offTimeTicks = 0;
  _lastSetTime = 0;
  _validSetTime = false;
  _totalWeight = 0;
  _timingQueue.clear();
}

void CMasterTimer::honourOffTime() const {
  if (_offTimeTicks == 0) return; // no off time to honour

  LED.ensureOff(); // ensure all LEDs are off

  uint64_t end = CTimer::time() + _offTimeTicks;

  while (CTimer::time() < end) {
    yield();
  }
}
