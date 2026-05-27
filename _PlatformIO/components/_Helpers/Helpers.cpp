#include <deque>
#include "WString.h"
#include <ranges>

#include "CA2D.h" 
#include "CHead.h"
#include "CTimer.h"
#include "CMasterTimer.h"
#include "CUSB.h"
#include "Setup.h"
#include "HWforState.h"
#include "Helpers.h"
#include "PinHelpers.h"

#include <Wire.h>
#include <Adafruit_MCP23X17.h>

HWforState* HW = nullptr;

Adafruit_MCP23X17 mcp;  // must be declared first due to LEDpins dependency
bool mcpInitialized = false;

// =====================================================================================================
//  Global instances of hardware components and helpers
// =====================================================================================================


ChipSelectPins CS;
SensorPins     SP;
ButtonPins     BUT;
LEDpins        LED;
CMasterTimer   Timer;
CA2D           A2D;
CHead          Head;
CUSB           USB;

OutputPin activityLED(4);
bool Ready = false;

// =====================================================================================================
//  LEDpins implementation
// =====================================================================================================


void mcp_initialize() {
  if (mcpInitialized) return;

  if (mcp.begin_I2C() == false) ERROR("MCP23017 not found.\n");

  for(int i=0; i < 16; i++){
    mcp.pinMode(i, OUTPUT);
    mcp.digitalWrite(i, LOW);
  }
  Wire.setClock(400000);

  mcpInitialized = true;  
}

void LEDpins::begin() const {
  mcp_initialize();
  for (int i = 24; i < 42; i++) {
    pinMode(i, OUTPUT);
    digitalWrite(i, high);
  }
} 

void LEDpins::write_raw(uint16_t data) const {
  data |= dbgBits;
  mcp.writeGPIOAB(inverted  ? ~data : data);
}

 void LEDpins::write(int pin, bool value) {
  if (value) 
    set(pin);
  else 
    clear(pin);
}


void LEDpins::set(int pin) {
  dbgBits |= (1u << pin);
  mcp.digitalWrite(pin, high);
}

void LEDpins::clear(int pin) {
  dbgBits &= ~(1u << pin);
  mcp.digitalWrite(pin, low);
}

void LEDpins::toggle(int pin) {
  dbgBits ^= (1u << pin);
  mcp.digitalWrite(pin, (dbgBits & (1u << pin)) ? high : low);
}


void Pins::flash(int numFlashes) {

  if (mcpInitialized == false)
    mcp_initialize();

  for (int i = 0; i < numFlashes; ++i) {

    mcp.writeGPIOAB(0xFFFF);
    delay(300);
    mcp.writeGPIOAB(0x0000);
    delay(300);

  }

  delay(1000);

  flashReset = true;
}


// =====================================================================================================
// Gets a object containing hardware instances corresponding to the given state, creating it if needed.
// =====================================================================================================

HWforState* getHWforState(StateType state) {
  static std::deque<HWforState> stateHWs;

  if (state == DIRTY) state = Head.getState();
  
  for (auto& hw : stateHWs)
      if (hw.state == state)
       return &hw;
  
  stateHWs.emplace_back(state);
  if (Ready)
    stateHWs.back().begin();

  return &stateHWs.back();
}

HWforState* getHWforState(BlockType* block) {
  return getHWforState(block ? block->state : DIRTY);
}

HWforState* getHWforState(DataType& data) {
  return getHWforState(data.state);
}

// =====================================================================================================
// Error handling implementation as called via ERROR macro
// =====================================================================================================
[[noreturn]] void error_impl(const char* file, int line, const char* func,
                             const char* fmt, ...)
{
    char msg[4096];
    va_list args; va_start(args, fmt);
    vsnprintf(msg, sizeof(msg), fmt, args);
    va_end(args);

    // Compose the file/line line in RAM too
    char hdr[4200];
    snprintf(hdr, sizeof(hdr), "%s:%d in %s(): %s", file, line, func, msg);

    // Try to make USB serial usable even during static init
    if (!Serial) {
        Serial.begin(115200); 
        for (int i = 0; i < 50 && !Serial; ++i) delay(10); // ~500ms max
    }

    mcp_initialize();
    
    for (;;) {
      Serial.println("Error: system halted.");
      Serial.println(hdr);
      Serial.println();

      Serial.print("Calling function: ");
      void* ra = __builtin_return_address(0);
      Serial.println((uintptr_t)ra, HEX);

      Serial.flush();

      uint16_t bits = 0;
      uint16_t one  = 1;

      for (int i = 0; i < 16; i++) {
        bits |= one << i;
        mcp.writeGPIOAB(bits);
        delay(20);
      }

      delay(1500); 

      while (bits != 0) {
        bits >>= 1;
        mcp.writeGPIOAB(bits);
        delay(20);
      }

      delay(500);
    }
}

