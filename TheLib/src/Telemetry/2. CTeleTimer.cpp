#include "2. CTeleTimer.h"
#include "../CTimer.h"

#pragma managed(push, off)

CTeleTimer::CTeleTimer(TeleGroup group, uint16_t id) : CTelemetry(group, SUBGROUP, id) {
  if (id == 0xFFFF) 
    ID = instanceCounter++;
    
  _register(this);
}


float CTeleTimer::getValue()  {
  uint64_t val = (_maxDuration == 0) ? _oldMaxDuration : _maxDuration;
  _oldMaxDuration = val;
  _maxDuration = 0;

  return static_cast<float>(val * CTimer::getMicrosecondsPerTick());
}

void CTeleTimer::set(double duration) {
    if (duration <= 0.0)
      return;

    uint64_t ticks = static_cast<uint64_t>(duration);
    if (ticks > _maxDuration)
      _maxDuration = ticks;
}

void CTeleTimer::stop() {
    uint64_t duration = CTimer::timeAbsolute() - _start;

    if (duration > _maxDuration)
      _maxDuration = duration;
}

#pragma managed(pop)
