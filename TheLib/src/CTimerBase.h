#pragma once
#pragma managed(push, off)

#include <cstdint>
#include <cmath>
#define WIN32_LEAN_AND_MEAN
#include <windows.h>


class CTimerBase {

private:
  static inline LONGLONG s_frequency = 0;
  static inline double s_maxDuration = 0.0;

protected:
  static inline uint64_t s_instanceCount = 0;
 
  inline static double s_SecondsPerTick      = 0.0;
  inline static double s_MillisecondsPerTick = 0.0;
  inline static double s_MicrosecondsPerTick = 0.0;

  inline static double s_TicksPerSecond      = 0.0;
  inline static double s_TicksPerMillisecond = 0.0;
  inline static double s_TicksPerMicrosecond = 0.0;

  inline static bool _checkDuration(double duration) { return duration > 0.0 && duration < s_maxDuration; }

public:
  CTimerBase();
  inline static uint64_t getCurrentTick() { LARGE_INTEGER temp; QueryPerformanceCounter(&temp); return temp.QuadPart; }

  inline uint64_t getInstanceCount() const { return s_instanceCount; }
  
  inline static double        getSecondsPerTick() { return      s_SecondsPerTick; }
  inline static double   getMillisecondsPerTick() { return s_MillisecondsPerTick; }
  inline static double   getMicrosecondsPerTick() { return s_MicrosecondsPerTick; }

  inline static double getTicksPerSecond()      { return s_TicksPerSecond;      }
  inline static double getTicksPerMillisecond() { return s_TicksPerMillisecond; }
  inline static double getTicksPerMicrosecond() { return s_TicksPerMicrosecond; }

  inline static uint64_t microsecondsToTicks(double us) { return static_cast<uint64_t>(std::ceil(us / getMicrosecondsPerTick())); }
  inline static uint64_t millisecondsToTicks(double ms) { return static_cast<uint64_t>(std::ceil(ms / getMillisecondsPerTick())); }
  inline static uint64_t      secondsToTicks(double  s) { return static_cast<uint64_t>(std::ceil( s /      getSecondsPerTick())); }

  inline static double ticksToMicroseconds(uint64_t ticks) { return ticks * getMicrosecondsPerTick(); }
  inline static double ticksToMilliseconds(uint64_t ticks) { return ticks * getMillisecondsPerTick(); }
  inline static double ticksToSeconds     (uint64_t ticks) { return ticks *      getSecondsPerTick(); }

  inline static uint64_t hzToPeriodInTicks(double hz)      { return static_cast<uint64_t>(std::ceil( getTicksPerSecond() / hz )); }
  inline static double     periodTicksToHz(uint64_t ticks) { return             getTicksPerSecond() / static_cast<double>(ticks); }

  
};
#pragma managed(pop)