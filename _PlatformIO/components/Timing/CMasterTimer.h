#pragma once
#include "C32bitTimer.h"
#include "CA2DTimer.h"
#include "CTimer.h"
#include "MyQueue.h"

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
  
  void honourOffTime() const;
  

  private:
    struct TimingRecord {
      int pinsOn;
      uint64_t startTime;
      uint64_t endTime;
      uint64_t duration;

      uint64_t weight;
    };

    MyQueue<TimingRecord, 1024> _timingQueue;
    void resetOffTiming();

    uint64_t _offTimeTicks;
    uint64_t _lastSetTime;
    bool     _validSetTime;
    uint64_t _totalWeight;

};

extern CMasterTimer Timer;