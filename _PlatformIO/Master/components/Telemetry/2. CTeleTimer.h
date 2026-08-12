#pragma once
#include <CTelemetry.h>
#include <Arduino.h>
#include <cstdint>

class CTeleTimer : public CTelemetry {
private:
  constexpr static uint8_t SUBGROUP = 0x02;
  inline static uint32_t instanceCounter{};


  uint32_t _start{};
  uint32_t _maxDuration{};
  uint32_t _oldMaxDuration{};
  
public:
  CTeleTimer(TeleGroup group = TeleGroup::PROGRAM, uint16_t id = 0xFFFF);

  inline void start() {
    _start = ARM_DWT_CYCCNT;
  }

  void stop();
  void set(double duration);


  float getValue() override;

  const char* getName() const override { return "CTeleTimer"; }
};