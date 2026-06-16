#include "CMasterTimer.h"
#include "Setup.h"
#include "CA2D.h"
#include "CHead.h"
#include "CTelemetry.h"
#include <cstdint>

static int64_t ONE_SECOND_TICKS = CTimerBase::secondsToTicks(1.0);
static int64_t STATES_PER_SECOND = static_cast<int64_t>(1'000'000.0 / CFG::STATE_DURATION_uS);

uint32_t HEAD_DELAY_TICKS = CTimerBase::microsecondsToTicks(CFG::HEAD_SETTLE_TIME_uS);
uint32_t A2D_OFFSET_TICKS = CTimerBase::microsecondsToTicks(1);  // 1uS offset helps with interference

CMasterTimer::CMasterTimer() : CTimer() {
  resetOffTiming();
 }
 
void CMasterTimer::syncChangeState() { 
  if (state.passed()) {} // ignore, or wait for next changtime, if needed
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


void CMasterTimer::addLEDChange(int fromPinCount, int toPinCount, int64_t unsetTime, int64_t setTime) {
  TimingRecord* record = nullptr;

  int64_t recordEndTime = unsetTime;
  int64_t nextStartTime = setTime;

  if (fromPinCount > 0 || toPinCount > 0) { // set times to whichever Time has the lesser pinCount
    int64_t time = (toPinCount < fromPinCount) ? setTime : unsetTime;

    recordEndTime = time;
    nextStartTime = time;
  }

  if (_validSetTime) {

    if (setTime > ONE_SECOND_TICKS) {
      int64_t endTime = setTime - ONE_SECOND_TICKS;

      while (_timingQueue.isEmpty() == false) {
        record = _timingQueue.peek();
        if (record->startTime > endTime) break;
        
        _totalWeight -= record->weight;
        _timingQueue.returnFirst();
      }
    }

    int64_t duration = recordEndTime - _lastSetTime;
    int64_t weightPerTick = static_cast<int64_t>(fromPinCount) - 1;
    int64_t weight = weightPerTick * duration;

    if (recordEndTime > _lastSetTime) {
      record = _timingQueue.getNext();  if (record == nullptr) ERROR("Timing queue overflow");
      record->pinsOn = fromPinCount;
      record->startTime = _lastSetTime;
      record->endTime = recordEndTime;
      record->duration = duration;


      record->weight = weight;

      _totalWeight += record->weight;
    }
  }


  _lastSetTime = nextStartTime;
  _validSetTime = true;
}

void CMasterTimer::honourOffTime() const {

  int64_t offTimeTicks = calculateOffTimeTicks();
  if (offTimeTicks <= 0) return; // no need to wait

  LED.allOff(); // ensure all LEDs are off, (records time)

  int64_t end = CTimer::time() + offTimeTicks;

  while (CTimer::time() < end) {
    yield();
  }
}



void CMasterTimer::resetOffTiming() {
  _offTimeTicks = 0;
  _lastSetTime = 0;
  _validSetTime = false;
  _totalWeight = 0;
  _timingQueue.clear();
}

int64_t CMasterTimer::calculateOffTimeTicks() const {
  int64_t offTimeTicks = 0;

  if (_validSetTime) {
    offTimeTicks = _totalWeight / STATES_PER_SECOND; // convert weight to time

    if (offTimeTicks > ONE_SECOND_TICKS) offTimeTicks = ONE_SECOND_TICKS; // cap off time to 1 second to avoid excessive waits
  }

  return offTimeTicks;
}