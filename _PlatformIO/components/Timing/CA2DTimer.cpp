#include "CA2DTimer.h"
#include "Config.h"
#include "Setup.h"
#include "CA2D.h"

CA2DTimer::CA2DTimer() : C32bitTimer() {
  _lastMarker = ARM_DWT_CYCCNT;
  _period = microsecondsToTicks(CFG::A2D_READING_PERIOD_uS);
  _nextMarker = _lastMarker + _period;

  if (CFG::A2D_USE_CONTINUOUS_MODE == false)
    setPeriodic(true);
}
/*
void CA2DTimer::reset(uint32_t start, uint32_t period) {
  _lastMarker = start;
  _nextMarker = start + period;
  _period = period;
}
*/
void CA2DTimer::sync() const {

//  if (CFG::A2D_USE_CONTINUOUS_MODE) 
    A2D.waitForNextDataReady();
//  else wait();
  
}

void CA2DTimer::setDataReady(uint32_t tick) 
{
  m_dataReadyPeriod = tick - m_dataReadyTick;  // uint32_t arithmetic handles wraparound correctly

  m_dataReadyTick = tick;
  m_dataReadyNextTick = tick + _period;

  double stateTime = Timer.getStateTime(tick);
  Timer.addEvent(EventKind::A2D_DATA_READY   , stateTime);

}
