#include "2. CTeleTimer.h"
#include "CTimer.h"
#include "Setup.h"

CTeleTimer::CTeleTimer(TeleGroup group, uint16_t id) : CTelemetry(group, SUBGROUP, id) {
  if (id == 0xFFFF) 
    ID = instanceCounter++;
    
  _register(this);
}


float CTeleTimer::getValue()  {
uint32_t val = (_maxDuration == 0) ? _oldMaxDuration : _maxDuration;
  _oldMaxDuration = val;
  _maxDuration = 0;

  return static_cast<float>(val * CTimer::getMicrosecondsPerTick());
}

void CTeleTimer::set(double duration) {

    if (duration > _maxDuration)
      _maxDuration = duration;
}

void CTeleTimer::stop() {
    uint32_t duration = ARM_DWT_CYCCNT - _start;

    if (duration > _maxDuration)
      _maxDuration = duration;
}
