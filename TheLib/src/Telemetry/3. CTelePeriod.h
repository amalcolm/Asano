#pragma once
#pragma managed(push, off)

#include "CTelemetry.h"
#include "../CTimer.h"
#include <cstdint>

class CTelePeriod : public CTelemetry {
protected:
    constexpr static uint8_t SUBGROUP = 0x03;
    inline static uint32_t instanceCounter{};

public:
  CTelePeriod(TeleGroup group = TeleGroup::TIMER, uint16_t id = 0xFFFF);

protected:
  uint64_t _lastTick{};
  uint64_t _maxTick{};
  uint64_t _oldMaxTick{};
  
public:
  inline void measure() {
    uint64_t now = CTimer::timeAbsolute();
    uint64_t last = _lastTick;
    _lastTick = now;

    if (_maxTick == 0) {     // first call
      _maxTick = 1;        // mark initialized
      return;
    }

    uint64_t duration = now - last;
    if (duration > _maxTick)
      _maxTick = duration;
  }

  float getValue() override;

  const char* getName() const override { return "CTelePeriod"; }
};

#pragma managed(pop)
