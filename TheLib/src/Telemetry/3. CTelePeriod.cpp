#include "3. CTelePeriod.h"
#include "../CTimer.h"

#pragma managed(push, off)

CTelePeriod::CTelePeriod(TeleGroup group, uint16_t id) : CTelemetry(group, SUBGROUP, id) {
  
  if (id == 0xFFFF) ID = instanceCounter++;

  _register(this);
}


float CTelePeriod::getValue() {
  
  uint64_t val = (_maxTick == 0) ? _oldMaxTick : _maxTick;
  _oldMaxTick = val;

  _maxTick = 0;
  
  return static_cast<float>(val * CTimer::getMicrosecondsPerTick());
}

#pragma managed(pop)
