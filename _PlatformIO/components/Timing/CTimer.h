#pragma once
#include "CTimerBase.h"
class CTimer : public CTimerBase {
  
private:
  inline static uint64_t s_calibration = 0;

  uint64_t m_startTime;

protected:
  inline static uint64_t time() 
  {
    static volatile  uint32_t s_lastReading = 0;
    static           uint64_t s_offset      = 0;
    static constexpr uint64_t s_increment   = 0x1ULL << 32;

    uint32_t current = ARM_DWT_CYCCNT;
    if (current >= s_lastReading) {
      s_lastReading = current;
      return s_offset + current - s_calibration;
    }
    // Potential overflow detected - enter critical section
__disable_irq();
    current = ARM_DWT_CYCCNT;  // Re-read to handle any timing edge cases
    if (current < s_lastReading) s_offset += s_increment;
    
    s_lastReading = current;
    uint64_t result = s_offset + current - s_calibration;
__enable_irq();

    return result;
  }



public:
  CTimer();

  inline static uint64_t timeAbsolute() { return time(); }
  

  inline void     restart()  { m_startTime = time();            }
  inline uint64_t elapsed()  { return time() - m_startTime;     }
  inline double   Seconds()  { return elapsed() * CTimerBase::s_SecondsPerTick;      }
  inline double   mS()       { return elapsed() * CTimerBase::s_MillisecondsPerTick; }
  inline double   uS()       { return elapsed() * CTimerBase::s_MicrosecondsPerTick; }

  
private:
  void callibrate();
};
