#pragma once
#include <cstdint>
#include <vector>
#include <deque>

enum class TeleGroup : uint8_t {
    NONE     = 0x00,
    PROGRAM  = 0x01,
    HARDWARE = 0x02,

    A2D      = 0x11,
    DIGIPOTS = 0x12,
    USB      = 0x13,
    HEAD     = 0x14,
    TIMER    = 0x15,

    UNSET    = 0xFF
};

class CTelemetry {
public:
    static constexpr size_t maxCapacity     = 256;
    static constexpr size_t initialCapacity =  16;

    static constexpr uint32_t FRAME_START = 0xED71FAB4;  // 71/72 = Telemetry Packet
    static constexpr uint32_t FRAME_END   = 0xED72FAB4;

    static std::vector<CTelemetry*> s_pool;
    static size_t                   s_capacity;

    static CTelemetry* Rent();
    static void Return(CTelemetry* item);

public:

    double    timestamp;

    TeleGroup group;
    uint8_t   subGroup;
    uint16_t  ID;

    float    value;


protected:  
    CTelemetry(TeleGroup group = TeleGroup::NONE, uint8_t subGroup = 0, uint16_t ID = 0 )
        : timestamp(0.0), group(group), subGroup(subGroup), ID(ID) {};

    virtual ~CTelemetry() = default;

    virtual float getValue() { return value; }

public:

    void reset();
    virtual void  abort() {}

    void writeSerial(bool includeFrameMarkers = true);

    
    virtual const char* getName() const { return "CTelemetry"; }


    static void init();

    static void log(TeleGroup group,                   uint16_t ID, float value);
    static void log(TeleGroup group, uint8_t subGroup, uint16_t ID, float value);


    static void _register(CTelemetry* tele);
    static void logAll();

private:
    static std::deque<CTelemetry*>& getAllTelemetries();
};

#include "0. CTeleValue.h"
#include "1. CTeleCounter.h"
#include "2. CTeleTimer.h"
#include "3. CTelePeriod.h"
