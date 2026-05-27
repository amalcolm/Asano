#include "C32bitTimer.h"
#include "Helpers.h"

inline void _checkDuration(double seconds) {
  constexpr double maxSeconds = static_cast<double>(INT32_MAX) / F_CPU;
  if (seconds > maxSeconds)
    ERROR("C32bitTimer duration too long: %.2f seconds (max is ~%.2f seconds)", seconds, maxSeconds);
}

C32bitTimer::C32bitTimer() : CTimerBase(), _period(0), _lastMarker(0), _nextMarker(0) { }

C32bitTimer C32bitTimer::From_uS(double uS) { _checkDuration(uS * 0.000'001);
  C32bitTimer marker;
  marker._period = static_cast<uint32_t>(std::ceil(uS * CTimerBase::getTicksPerMicrosecond()));
  marker.reset();
  return marker;
}

C32bitTimer C32bitTimer::From_mS(double mS) { _checkDuration(mS * 0.001);
  C32bitTimer marker;
  marker._period = static_cast<uint32_t>(std::ceil(mS * CTimerBase::getTicksPerMillisecond()));
  marker.reset();
  return marker;
}

C32bitTimer C32bitTimer::From_S (double  S) { _checkDuration(S);
  C32bitTimer marker;
  marker._period = static_cast<uint32_t>(std::ceil( S * CTimerBase::getTicksPerSecond()));
  marker.reset();
  return marker;
}

C32bitTimer C32bitTimer::From_Hz(double Hz) { _checkDuration(1.0 / Hz);
  C32bitTimer marker;
  marker._period = static_cast<uint32_t>(std::ceil( CTimerBase::getTicksPerSecond() / Hz ));
  marker.reset();
  return marker;
}


