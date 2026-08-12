#pragma once
#include <CTelemetry.h>
#include <Arduino.h>
class CTeleValue : public CTelemetry {
private:
    constexpr static uint8_t SUBGROUP = 0x00;
    inline static uint32_t instanceCounter{};


    float _value{};

public:
    CTeleValue(TeleGroup group = TeleGroup::PROGRAM, uint16_t id = 0xFFFF) : CTelemetry(group, SUBGROUP, id) {
        if (id == 0xFFFF)
            ID = instanceCounter++;
        
        _register(this);
    }

    inline void set(float    value) { _value = value; }
    inline void set(double   value) { _value = static_cast<float>(value); }
    inline void set(int      value) { _value = static_cast<float>(value); }
    inline void set(char     value) { _value = static_cast<float>(value); }
    inline void set(uint32_t value) { _value = static_cast<float>(value); }
    inline void set(uint16_t value) { _value = static_cast<float>(value); }
    inline void set(uint8_t  value) { _value = static_cast<float>(value); }
    inline void set(int32_t  value) { _value = static_cast<float>(value); }
    inline void set(int16_t  value) { _value = static_cast<float>(value); }
    inline void set(int8_t   value) { _value = static_cast<float>(value); }
    inline void set(bool     value) { _value = value ? 1.0f : 0.0f; }

    float getValue() override {
        float retVal = _value;
//        _value = 0;  // /normally reset value after reading, but for values we want to keep it
        return retVal;
    }
    
    const char* getName() const override { return "CTeleValue"; }
};