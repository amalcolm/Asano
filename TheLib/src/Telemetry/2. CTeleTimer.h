#pragma once
#pragma managed(push, off)

#include "CTelemetry.h"
#include "../CTimer.h"
#include <cstdint>

class CTeleTimer : public CTelemetry {
private:
  constexpr static uint8_t SUBGROUP = 0x02;
  inline static uint32_t instanceCounter{};


  uint64_t _start{};
  uint64_t _maxDuration{};
  uint64_t _oldMaxDuration{};
  
public:
  CTeleTimer(TeleGroup group = TeleGroup::PROGRAM, uint16_t id = 0xFFFF);

  inline void start() {
    _start = CTimer::timeAbsolute();
  }

  void stop();
  void set(double duration);


  float getValue() override;

  const char* getName() const override { return "CTeleTimer"; }
};

#pragma managed(pop)
