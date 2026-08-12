#include "CTimerBase.h"

#pragma managed(push, off)

#include <cmath>
#include <limits>

CTimerBase::CTimerBase() {
  ensureInitialized();
  ++s_instanceCount;
}

void CTimerBase::initialize() {
  LARGE_INTEGER temp; QueryPerformanceFrequency(&temp);
  s_frequency = temp.QuadPart > 0 ? temp.QuadPart : 1;

  s_SecondsPerTick      = 1.0 /  s_frequency;
  s_MillisecondsPerTick = 1.0 / (s_frequency * 0.001);
  s_MicrosecondsPerTick = 1.0 / (s_frequency * 0.000'001);

  s_TicksPerSecond      = static_cast<double>(s_frequency);
  s_TicksPerMillisecond = s_frequency * 0.001;
  s_TicksPerMicrosecond = s_frequency * 0.000'001;

  s_maxDuration = (std::numeric_limits<LONGLONG>::max)() * s_SecondsPerTick;
}

#pragma managed(pop)
