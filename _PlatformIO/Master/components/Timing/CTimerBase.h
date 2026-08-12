#pragma once
#include <cstdint>
#include "Arduino.h"
#include "Helpers.h"
class CTimerBase {
  
protected:
  static inline uint32_t s_instanceCount = 0;
   
  inline static constexpr double s_SecondsPerTick      = 1.0 /  F_CPU;
  inline static constexpr double s_MillisecondsPerTick = 1.0 / (F_CPU / 1'000.0);
  inline static constexpr double s_MicrosecondsPerTick = 1.0 / (F_CPU / 1'000'000.0);

  inline static constexpr double s_TicksPerSecond      = F_CPU;
  inline static constexpr double s_TicksPerMillisecond = F_CPU / 1'000.0;
  inline static constexpr double s_TicksPerMicrosecond = F_CPU / 1'000'000.0;

public:
  CTimerBase();

  inline uint32_t getInstanceCount() const { return s_instanceCount; }
  
  inline static constexpr double        getSecondsPerTick() { return      s_SecondsPerTick; }
  inline static constexpr double   getMillisecondsPerTick() { return s_MillisecondsPerTick; }
  inline static constexpr double   getMicrosecondsPerTick() { return s_MicrosecondsPerTick; }

  inline static constexpr double getTicksPerSecond()      { return s_TicksPerSecond;      }
  inline static constexpr double getTicksPerMillisecond() { return s_TicksPerMillisecond; }
  inline static constexpr double getTicksPerMicrosecond() { return s_TicksPerMicrosecond; }

  inline static constexpr uint32_t microsecondsToTicks(double us) { return static_cast<uint32_t>(std::ceil(us / getMicrosecondsPerTick())); }
  inline static constexpr uint32_t millisecondsToTicks(double ms) { return static_cast<uint32_t>(std::ceil(ms / getMillisecondsPerTick())); }
  inline static constexpr uint32_t      secondsToTicks(double  s) { return static_cast<uint32_t>(std::ceil( s /      getSecondsPerTick())); }

  inline static constexpr double ticksToMicroseconds(uint32_t ticks) { return ticks * getMicrosecondsPerTick(); }
  inline static constexpr double ticksToMilliseconds(uint32_t ticks) { return ticks * getMillisecondsPerTick(); }
  inline static constexpr double ticksToSeconds     (uint32_t ticks) { return ticks *      getSecondsPerTick(); }

  inline static constexpr uint32_t hzToPeriodInTicks(double hz)      { return static_cast<uint32_t>(std::ceil( getTicksPerSecond() / hz )); }
  inline static constexpr double     periodTicksToHz(uint32_t ticks) { return             getTicksPerSecond() / static_cast<double>(ticks); }

  void initGPT1(void(* isrHandler)());  // forward to CTimer.cpp
  
};
