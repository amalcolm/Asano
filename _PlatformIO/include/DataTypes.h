#pragma once
#include <cstdint>
#include <array>
#include "Config.h"
#include "CEvents.h"

using StateType = uint32_t;

static constexpr uint32_t NUM_CHANNELS = 8;

static constexpr StateType DIRTY = 0xFFFFFFFF;
static constexpr StateType UNSET = 0x80000000;

struct DataType {
  static constexpr uint32_t FRAME_START = 0xEDD1FAB4;
  static constexpr uint32_t FRAME_END   = 0xEDD2FAB4;


  StateType  state;          // state of the head during this reading
  double     timestamp;      // timestamp in seconds since connection
  double     stateTime;      // time in seconds since last state change
  uint64_t   hardwareState;  //   offset1pot << 56 | offset1_hi << 48 | offset1_lo << 40 | count&0xFF << 32 ...
                             // | offset2pot << 24 | gain       << 16 | reserved   << 8  | reserved    << 0
  uint32_t   sensorState;    //  preGain << 16 | postGain 
  float      sensor1;
  float      sensor2;
  uint32_t   channels[NUM_CHANNELS];

  DataType();
  DataType(StateType state);

  void writeSerial(bool includeFrameMarkers = true);
  void debugSerial();
  inline void clear() { *this = DataType(); }

  void fillFromHardware(struct HWforState& HW, bool setTimestamp = true);
};

struct BlockType {
  static constexpr uint32_t DEBUG_BLOCKSIZE = 16;
  static constexpr uint32_t FRAME_START = 0xEDB1FAB4;
  static constexpr uint32_t FRAME_END   = 0xEDB2FAB4;
  

  double   timestamp;
  uint32_t state;
  uint32_t count;
  DataType data[CFG::MAX_BLOCKSIZE];

  uint32_t numEvents;
  EventType events[CFG::MAX_EVENTS_PER_BLOCK];


  BlockType();

  void clear();
  
  inline bool tryAdd(const DataType& item) { if (count >= CFG::MAX_BLOCKSIZE) return false;
                                             if (item.state == DIRTY)         return false; // don't add dirty data to block
    data[count++] = item;
    return true;
  }

  bool tryAddEvent(const EventKind kind, double time = -1.0);

  void writeSerial(bool includeFrameMarkers = true);
  void debugSerial();
};


struct TimedSample {
  int32_t startTick;
  int32_t sample;
  int32_t endTick;
};

struct DebugType {
  static constexpr uint32_t DEBUG_BLOCKSIZE = 4096;
  static constexpr uint32_t FRAME_START = 0xED01FAB4;
  static constexpr uint32_t FRAME_END   = 0xED02FAB4;
  double timestamp;
  StateType state;

  uint32_t count;
  TimedSample data[DEBUG_BLOCKSIZE];

  DebugType() : timestamp(0.0), state(UNSET), count(0) {}
  DebugType(StateType s) : timestamp(0.0), state(s), count(0) {}

  void clear() { timestamp = 0.0; state = UNSET; count = 0; }

  void writeSerial(bool includeFrameMarkers = true);
};

