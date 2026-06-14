#include "CMasterTimer.h"
#include "Setup.h"
#include "Config.h"
#include "CA2D.h"
#include "CHead.h"
#include "CTelemetry.h"
#include <cstdint>
#include <string.h>
static uint64_t ONE_SECOND_TICKS = CTimerBase::secondsToTicks(1.0);

static uint64_t scaleOverOneSecond(uint64_t ticks, uint64_t elapsed) {
  if (elapsed == 0) return 0;

  uint64_t whole = ticks / ONE_SECOND_TICKS;
  uint64_t remainder = ticks % ONE_SECOND_TICKS;
  uint64_t maxValue = static_cast<uint64_t>(-1);
  uint64_t scaledWhole = (whole > maxValue / elapsed) ? maxValue : whole * elapsed;
  if (scaledWhole == maxValue) return maxValue;

  uint64_t scaledRemainder = (remainder * elapsed) / ONE_SECOND_TICKS;
  return (maxValue - scaledWhole < scaledRemainder) ? maxValue : scaledWhole + scaledRemainder;
}

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

  if (CFG::isSingleStateMode()) return; 

  uint64_t recordEndTime = unsetTime;
  uint64_t nextStartTime = setTime;

  if (unsetPins > 0 || setPins > 0) { // assign the MCP write interval to the higher pin count
    uint64_t time = (setPins < unsetPins) ? setTime : unsetTime;

    recordEndTime = time;
    nextStartTime = time;
  }

  if (_validSetTime)
    accountInterval(unsetPins, _lastSetTime, recordEndTime);

  _lastSetTime = nextStartTime;
  _validSetTime = true;
  updateOffTelemetry(setTime);
}


void CMasterTimer::resetOffTiming() {
  _accountingSecondStart = 0;
  _lastSetTime = 0;
  _validSetTime = false;
  _currentIncurredTicks = 0;
  _currentHonouredTicks = 0;
  _debtTicks = 0;
  _honourTargetTicks = 0;
  _honourPaidTicks = 0;
  _honourWindowStart = 0;
  updateOffTelemetry(0);
}


void CMasterTimer::accountInterval(int pinsOn, uint64_t startTime, uint64_t endTime) {
  while (startTime < endTime) {
    uint64_t secondEnd = _accountingSecondStart + ONE_SECOND_TICKS;

    if (startTime >= secondEnd) {
      finishAccountingSecond(secondEnd);
      continue;
    }

    uint64_t segmentEnd = (endTime < secondEnd) ? endTime : secondEnd;
    accountDuration(pinsOn, segmentEnd - startTime);

    startTime = segmentEnd;

    if (startTime == secondEnd)
      finishAccountingSecond(secondEnd);
  }
}


void CMasterTimer::accountDuration(int pinsOn, uint64_t duration) {
  if (pinsOn == 0) {
    _currentHonouredTicks += duration;

    if (_honourPaidTicks < _honourTargetTicks) {
      uint64_t remaining = _honourTargetTicks - _honourPaidTicks;
      _honourPaidTicks += (duration < remaining) ? duration : remaining;
    }
  }
  else if (pinsOn > 1) {
    _currentIncurredTicks += static_cast<uint64_t>(pinsOn - 1) * duration;
  }
}


void CMasterTimer::finishAccountingSecond(uint64_t nextSecondStart) {
  if (_currentIncurredTicks > _currentHonouredTicks) {
    uint64_t incurredNet = _currentIncurredTicks - _currentHonouredTicks;
    uint64_t maxValue = static_cast<uint64_t>(-1);
    _debtTicks = (maxValue - _debtTicks < incurredNet) ? maxValue : _debtTicks + incurredNet;
  }
  else {
    uint64_t honouredSurplus = _currentHonouredTicks - _currentIncurredTicks;
    _debtTicks = (_debtTicks > honouredSurplus) ? (_debtTicks - honouredSurplus) : 0;
  }

  _honourTargetTicks = _debtTicks;
  _honourPaidTicks = 0;
  _honourWindowStart = nextSecondStart;

  _currentIncurredTicks = 0;
  _currentHonouredTicks = 0;
  _accountingSecondStart = nextSecondStart;
  updateOffTelemetry(nextSecondStart);
}


uint64_t CMasterTimer::getHonourDueTicks(uint64_t now) const {
  if (_honourTargetTicks <= _honourPaidTicks) return 0;

  uint64_t elapsed = (now > _honourWindowStart) ? (now - _honourWindowStart) : 0;
  uint64_t due = (elapsed >= ONE_SECOND_TICKS)
               ? _honourTargetTicks
               : scaleOverOneSecond(_honourTargetTicks, elapsed);

  if (due <= _honourPaidTicks) return 0;

  uint64_t remaining = _honourTargetTicks - _honourPaidTicks;
  uint64_t chunk = due - _honourPaidTicks;

  return (chunk < remaining) ? chunk : remaining;
}


void CMasterTimer::updateOffTelemetry(uint64_t now) {
  static CTeleValue TV_OffDebt_uS    {TeleGroup::TIMER, 0x0102};

  TV_OffDebt_uS    .set(ticksToMicroseconds(_debtTicks));
}


void CMasterTimer::honourOffTime() {
  if (CFG::isSingleStateMode()) return; // off time is only active when not in debug mode

  if (getHonourDueTicks(getConnectTicks()) == 0) return; // no off time due yet

  LED.ensureOff(); // ensure all LEDs are off

  _offTimeTicks = getHonourDueTicks(getConnectTicks());

  uint64_t end = CTimer::time() + _offTimeTicks;

  while (CTimer::time() < end) {
    yield();
  }

  updateOffTelemetry(getConnectTicks());
}
