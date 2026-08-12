#pragma once
#include <DataTypes.h>
#include <CTelemetry.h>

#define IGNORE(x) (void)(x)

// Returns the hardware struct for a given state
struct HWforState* getHWforState(StateType state);
struct HWforState* getHWforState(DataType& data);  // must also include Hardware.h
struct HWforState* getHWforState(BlockType* block = nullptr);


// Telemetry logging helper functions
inline void Tele(TeleGroup group, int ID, float value) {
    CTelemetry::log(group, ID, value);
}

inline void Tele(TeleGroup group, uint8_t subGroup, int ID, float value) {
    CTelemetry::log(group, subGroup, ID, value);
}


// 24-bit sign-extend (two’s-complement)
inline int32_t be24_to_s32(const uint8_t b2, const uint8_t b1, const uint8_t b0) {
  int32_t v = (int32_t(b2) << 16) | (int32_t(b1) << 8) | int32_t(b0);
  if (v & 0x00800000) v |= 0xFF000000; // sign-extend bit 23
  return v;
}


// Error handling macro, printf style
#define ERROR(fmt, ...) error_impl(__FILE__, __LINE__, __func__, fmt, ##__VA_ARGS__)


[[noreturn]] void error_impl(const char* file, int line, const char* func,
                             const char* fmt, ...);


