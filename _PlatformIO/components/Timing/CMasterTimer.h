#pragma once
#include "C32bitTimer.h"
#include "CA2DTimer.h"
#include "CTimer.h"
#include "MyQueue.h"

class CMasterTimer : public CTimer {
  
private:
  inline static int64_t s_connectTime = 0;

public:
  const C32bitTimer state = C32bitTimer::From_uS(CFG::STATE_DURATION_uS     ).setPeriodic(true);
  
  const C32bitTimer Head  = C32bitTimer::From_uS(CFG::HEAD_SETTLE_TIME_uS   ).setPeriodic(false);
//const C32bitTimer HW    = C32bitTimer::From_uS(CFG::POT_UPDATE_OFFSET_uS  ).setPeriodic(false);

        CA2DTimer   A2D   = CA2DTimer{};

  CMasterTimer();
  
         void     setConnectTime();
  inline int64_t getConnectTicks() { return  CTimer::time() - s_connectTime;                                 }
  inline double   getConnectTime()  { return (CTimer::time() - s_connectTime) * CTimerBase::s_SecondsPerTick; }

  inline static double upTime() { return CTimer::time() * CTimerBase::s_SecondsPerTick; }
  inline double getStateTime()  { return state.getSeconds(); }
  inline double getStateTime(uint32_t now)  { return state.getSeconds(now); }

  void syncChangeState(); // aligns A2D read timing

  bool addEvent(const enum EventKind kind, double time = -1.0);

  bool sampleReady = false;
  

  void addLEDChange(int fromPinCount, int toPinCount, int64_t unsetTime, int64_t setTime);
  int64_t calculateOffTimeTicks() const;
  void honourOffTime() const;
  

  private:
    struct TimingRecord {
      int pinsOn;
      int64_t startTime;
      int64_t endTime;
      int64_t duration;

      int64_t  weight;
    };

    MyQueue<TimingRecord, 1024> _timingQueue;
    void resetOffTiming();

    int64_t _offTimeTicks;
    int64_t _lastSetTime;
    bool     _validSetTime;
    int64_t _totalWeight;

};

extern CMasterTimer Timer;