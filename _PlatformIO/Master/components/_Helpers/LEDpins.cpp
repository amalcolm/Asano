#include "PinHelpers.h"
#include "Config.h"
#include "CMasterTimer.h"
#include "Setup.h"
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MCP23X17.h>
#include <bit>


Adafruit_MCP23X17 mcp;  

void LEDpins::begin()  {
  return;
  initMCP();
  for (int i = 24; i < 42; i++) 
    pinMode(i, OUTPUT);
  
  _debugBits = 0;
  write_raw(0x0000);
} 

void LEDpins::write_raw(uint16_t data) {
  return;
  _current = data | _debugBits;
  int unsetPins = _numPinsOn;
  int64_t unsetTime = Timer.getConnectTicks();
  mcp.writeGPIOAB(inverted  ? ~_current : _current);
  int64_t setTime = Timer.getConnectTicks();

  if (Ready == false) return; 
  _numPinsOn = std::popcount(_current);

  Timer.addLEDChange(unsetPins, _numPinsOn, unsetTime, setTime);
}



void LEDpins::set   (int pin) {  _debugBits |=  (1u << pin);  write_raw(_current); }

void LEDpins::clear (int pin) {  _debugBits &= ~(1u << pin);  write_raw(_current); }

void LEDpins::toggle(int pin) {  _debugBits ^=  (1u << pin);  write_raw(_current); }


void Pins::flash(int numFlashes) { 
  return;
  
  if (CFG::isDebugMode() == false) return; // don't flash if debug mode is off

  LEDpins::initMCP();

  for (int i = 0; i < numFlashes; ++i) {

    mcp.writeGPIOAB(0xFFFF);
    delay(300);
    mcp.writeGPIOAB(0x0000);
    delay(300);

  }

  delay(1000);

  flashReset = true;
}


void LEDpins::initMCP(){
  return;

  if (_mcpInitialized) return;

  _mcpInitialized = true;   // avoid infinit recursion if MCP init fails and calls ERROR

  if (mcp.begin_I2C() == false) ERROR("MCP23017 not found.\n");

  Wire.setClock(400000);

  for(int i=0; i < 16; i++){
    mcp.pinMode(i, OUTPUT);
    mcp.digitalWrite(i, _low);
  }

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

    LEDpins::initMCP();
    
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
        if (CFG::isDebugMode()) mcp.writeGPIOAB(bits);
        delay(20);
      }

      delay(1500); 

      while (bits != 0) {
        bits >>= 1;
        if (CFG::isDebugMode()) mcp.writeGPIOAB(bits);
        delay(20);
      }

      delay(500);
    }
}
