#pragma once
#include <CTelemetry.h>
class CTeleCounter : public CTelemetry {
private:
    constexpr static uint8_t SUBGROUP = 0x01;
    inline static uint32_t instanceCounter{};


    uint32_t _count{};

public:
    CTeleCounter(TeleGroup group = TeleGroup::PROGRAM, uint16_t id = 0xFFFF) : CTelemetry(group, SUBGROUP, id) {
        if (id == 0xFFFF) 
            ID = instanceCounter++;
        
        _register(this);
    }


    inline void increment() {
        _count++;
    }

    float getValue() override {
        uint32_t retVal = _count;
        _count = 0;
        return retVal;
    }
    
    const char* getName() const override { return "CTeleCounter"; }
};