#include "C32bitTimer.h"

C32bitTimer::C32bitTimer() : CTimerBase(), _period(0), _lastMarker(0), _nextMarker(0) { }

C32bitTimer C32bitTimer::From_uS(double uS) {
  C32bitTimer marker;
  marker._period = static_cast<uint32_t>(std::ceil(uS * CTimerBase::getTicksPerMicrosecond()));
  marker.reset();
  return marker;
}

C32bitTimer C32bitTimer::From_mS(double mS) {
  C32bitTimer marker;
  marker._period = static_cast<uint32_t>(std::ceil(mS * CTimerBase::getTicksPerMillisecond()));
  marker.reset();
  return marker;
}

C32bitTimer C32bitTimer::From_S (double  S) {
  C32bitTimer marker;
  marker._period = static_cast<uint32_t>(std::ceil( S * CTimerBase::getTicksPerSecond()));
  marker.reset();
  return marker;
}

C32bitTimer C32bitTimer::From_Hz(double Hz) {
  C32bitTimer marker;
  marker._period = static_cast<uint32_t>(std::ceil( CTimerBase::getTicksPerSecond() / Hz ));
  marker.reset();
  return marker;
}


