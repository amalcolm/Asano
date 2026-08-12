#pragma once
#include "CTimerBase.h"
class CTimer : public CTimerBase {
  
private:
  inline static int64_t s_calibration = 0;

  int64_t m_startTime;

protected:
  static int64_t time();


public:
  CTimer();

  inline static int64_t timeAbsolute() { return time(); }
  

  inline void     restart()  { m_startTime = time();            }
  inline int64_t  elapsed()  { return time() - m_startTime;     }
  inline double   Seconds()  { return elapsed() * CTimerBase::s_SecondsPerTick;      }
  inline double   mS()       { return elapsed() * CTimerBase::s_MillisecondsPerTick; }
  inline double   uS()       { return elapsed() * CTimerBase::s_MicrosecondsPerTick; }

  
private:
  void callibrate();
};
