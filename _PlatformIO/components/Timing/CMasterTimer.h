#pragma once
#include "C32bitTimer.h"
#include "CA2DTimer.h"
#include "CTimer.h"

class CMasterTimer : public CTimer {
  
private:
  inline static uint64_t s_connectTime = 0;

public:
  const C32bitTimer state = C32bitTimer::From_uS(CFG::STATE_DURATION_uS     ).setPeriodic(true);
  
  const C32bitTimer Head  = C32bitTimer::From_uS(CFG::HEAD_SETTLE_TIME_uS   ).setPeriodic(false);
//const C32bitTimer HW    = C32bitTimer::From_uS(CFG::POT_UPDATE_OFFSET_uS  ).setPeriodic(false);

        CA2DTimer   A2D   = CA2DTimer{};

  CMasterTimer();
  
         void     setConnectTime();
  inline uint64_t getConnectTicks() { return  CTimer::time() - s_connectTime;                                 }
  inline double   getConnectTime()  { return (CTimer::time() - s_connectTime) * CTimerBase::s_SecondsPerTick; }

  inline static double upTime() { return CTimer::time() * CTimerBase::s_SecondsPerTick; }
  inline double getStateTime()  { return state.getSeconds(); }
  inline double getStateTime(uint32_t now)  { return state.getSeconds(now); }

  void syncAndChangeState(); // Sets m_stateChange and aligns A2D read timing

  bool addEvent(const enum EventKind kind, double time = -1.0);

  bool sampleReady = false;
  

  void updateOffTime(int unsetPins, uint64_t unsetTime, int setPins, uint64_t setTime);
  
  void honourOffTime();
  

  private:
    void resetOffTiming();
    void accountInterval(int pinsOn, uint64_t startTime, uint64_t endTime);
    void accountDuration(int pinsOn, uint64_t duration);
    void finishAccountingSecond(uint64_t nextSecondStart);
    uint64_t getHonourDueTicks(uint64_t now) const;
    void updateOffTelemetry(uint64_t now);

    uint64_t _offTimeTicks;

    uint64_t _accountingSecondStart;
    uint64_t _lastSetTime;
    bool     _validSetTime;
    uint64_t _currentIncurredTicks;
    uint64_t _currentHonouredTicks;
    uint64_t _debtTicks;
    uint64_t _honourTargetTicks;
    uint64_t _honourPaidTicks;
    uint64_t _honourWindowStart;

};

extern CMasterTimer Timer;
