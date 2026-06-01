#include "C64bitTimer.h"


C64bitTimer::C64bitTimer() : CTimerBase(), _period(0), _isPeriodic(true), _lastMarker(0), _nextMarker(0) { }

C64bitTimer C64bitTimer::From_uS(double uS) { _checkDuration(uS * 0.000'001);
  C64bitTimer marker;
  marker._period = static_cast<uint64_t>(std::ceil(uS * CTimerBase::getTicksPerMicrosecond()));
  marker.reset();
  return marker;
}

C64bitTimer C64bitTimer::From_mS(double mS) { _checkDuration(mS * 0.001);
  C64bitTimer marker;
  marker._period = static_cast<uint64_t>(std::ceil(mS * CTimerBase::getTicksPerMillisecond()));
  marker.reset();
  return marker;
}

C64bitTimer C64bitTimer::From_S (double  S) { _checkDuration(S);
  C64bitTimer marker;
  marker._period = static_cast<uint64_t>(std::ceil( S * CTimerBase::getTicksPerSecond()));
  marker.reset();
  return marker;
}

C64bitTimer C64bitTimer::From_Hz(double Hz) { _checkDuration(1.0 / Hz);
  C64bitTimer marker;
  marker._period = static_cast<uint64_t>(std::ceil( CTimerBase::getTicksPerSecond() / Hz ));
  marker.reset();
  return marker;
}


