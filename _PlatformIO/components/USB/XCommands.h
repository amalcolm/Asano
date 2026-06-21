#pragma once
#include <stddef.h>
#include <stdint.h>
#include "Config.h" 
static const uint8_t XCMD_MAGIC[4] = {0x58, 0x43, 0x00, 0xFF};

enum class CommandFlags : uint32_t {
  None = 0,
  HoldWipers     = 0x02,
  HoldSensor2    = 0x04,
  RunDebug       = 0x80,

  Run__findSignal  = 0x100,
  Test_NoiseSample = 0x200,
};

struct XCMD_Header
{
  uint8_t magic0;
  uint8_t magic1;
  uint8_t id;
  uint8_t magic3;
  CommandFlags cmdFlags;
};
static_assert(sizeof(XCMD_Header) == 8);

struct XCommand {
    XCMD_Header header;

    bool hasFlag(CommandFlags flag) const;
    void processFlags() const;
    void honour() const;

    static void process(uint8_t* pRead, size_t packetSize);
};


struct XCMD_SetWipers : public XCommand {
  static constexpr uint8_t ID = 0x01;
  
  uint8_t top;
  uint8_t bot;
  uint8_t mid;

  uint8_t offset;
  uint8_t gain;

  uint8_t _reserved1;
  uint8_t _reserved2;
  uint8_t _reserved3;
};

static_assert(sizeof(XCMD_SetWipers) == 16);

struct XCMD_SetState : public XCommand {
  static constexpr uint8_t ID = 0x02;

  uint32_t state; // bitfield for LEDs


};

static_assert(sizeof(XCMD_SetState) == 12);

struct XCMD_SetDebugFlags : public XCommand {
  static constexpr uint8_t ID = 0x03;

};

static_assert(sizeof(XCMD_SetDebugFlags) == 8);

struct XCMD_SetActiveState : public XCommand {
  static constexpr uint8_t ID = 0x04;

  uint32_t state; // bitfield for LEDs
};

static_assert(sizeof(XCMD_SetActiveState) == 12);

struct XCMD_SetSequence : public XCommand {
  static constexpr uint8_t ID = 0x05;
  static constexpr uint8_t MAX_STATES = 64;

  uint8_t count;
  uint8_t _reserved1;
  uint8_t _reserved2;
  uint8_t _reserved3;

  uint32_t states[MAX_STATES]; // bitfields for LEDs
};

static_assert(sizeof(XCMD_SetSequence) == 268);


// helpers for CommandFlags bitfield management,
constexpr uint32_t      toU32     (CommandFlags  flags            ) { return static_cast<uint32_t>(flags);                   }
constexpr CommandFlags  operator| (CommandFlags  a, CommandFlags b) { return static_cast<CommandFlags>(toU32(a) | toU32(b)); }
constexpr CommandFlags  operator& (CommandFlags  a, CommandFlags b) { return static_cast<CommandFlags>(toU32(a) & toU32(b)); }
constexpr CommandFlags& operator|=(CommandFlags& a, CommandFlags b) { a = a | b; return a;                                   }
constexpr bool          hasFlag   (CommandFlags  s, CommandFlags f) { return (s & f) != CommandFlags::None;                  }

