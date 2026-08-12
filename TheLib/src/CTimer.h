#pragma once
#include "CTimerBase.h"

#pragma managed(push, off)

class CTimer : public CTimerBase {
private:
  uint64_t m_startTime = 0;

protected:
  inline static uint64_t time() { return getCurrentTick(); }

public:
  CTimer();

  inline static uint64_t timeAbsolute() { return time(); }

  inline void restart() { m_startTime = time(); }
  inline uint64_t elapsed() const { return time() - m_startTime; }
  inline double Seconds() const { return CTimerBase::ticksToSeconds(elapsed()); }
  inline double mS() const { return CTimerBase::ticksToMilliseconds(elapsed()); }
  inline double uS() const { return CTimerBase::ticksToMicroseconds(elapsed()); }
};

#pragma managed(pop)
