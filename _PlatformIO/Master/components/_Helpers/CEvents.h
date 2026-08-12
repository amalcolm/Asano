#pragma once

enum EventKind {
    NONE = 0,

    A2D_DATA_READY     = 0x11,
    A2D_READ_START     = 0x12,
    A2D_READ_COMPLETE  = 0x13,
   
    HW_UPDATE_START    = 0x21,
    HW_UPDATE_COMPLETE = 0x22,
   
    SPI_DMA_START      = 0x31,
    SPI_DMA_COMPLETE   = 0x32,
    
    RESERVED = 255
};

struct EventType
{
    EventKind kind = EventKind::NONE;
    double    stateTime = 0.0;

    EventType() = default;
};
