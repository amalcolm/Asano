#pragma once
#include <CTelemetry.h>
#include <Arduino.h>
#include <cstdint>

class CTelePeriod : public CTelemetry {
protected:
    constexpr static uint8_t SUBGROUP = 0x03;
    inline static uint32_t instanceCounter{};

public:
  CTelePeriod(TeleGroup group = TeleGroup::TIMER, uint16_t id = 0xFFFF);

protected:
  uint32_t _lastTick{};
  uint32_t _maxTick{};
  uint32_t _oldMaxTick{};
  
public:
  inline void measure() {
    uint32_t now = ARM_DWT_CYCCNT;
    uint32_t last = _lastTick;
    _lastTick = now;

    if (_maxTick == 0) {     // first call
      _maxTick = 1;        // mark initialized
      return;
    }

    uint32_t duration = now - last;
    if (duration > _maxTick)
      _maxTick = duration;
  }

  float getValue() override;

  const char* getName() const override { return "CTelePeriod"; }
};