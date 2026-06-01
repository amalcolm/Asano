#include "CDigiPot.h"
#include "Arduino.h"
#include "SPI.h"
#include "HWforState.h"
#include "_HWTools.h"
#include "Setup.h"
#include <algorithm>
#include <array>

static std::array<int, 48> _potValueCache = {-2};

CDigiPot::CDigiPot(int csPin) : _csPin(csPin) {
  if (_potValueCache[0] == -2)
    _potValueCache.fill(-1); // fill cache with invalid values
}

// The virtual destructor definition is required.
CDigiPot::~CDigiPot() {}

void CDigiPot::begin(int initialLevel) {
  pinMode(_csPin, OUTPUT);
  digitalWrite(_csPin, HIGH);
  reset(initialLevel);
}

void  CDigiPot::reset(int level) {
  setLevel(level);
  delayMicroseconds(10);
}


void CDigiPot::setLevel(int newLevel) { 
  newLevel = std::clamp(newLevel, WIPER_MIN, WIPER_MAX);
  if (newLevel == _currentLevel) return; 

  if (HW) {
    auto& flags = HW->tools.flags;
    flags.wipersChanged = true;
  }
  _currentLevel = newLevel;
  _writeToPot(_currentLevel);
};

void CDigiPot::offsetLevel(int offset) {
  int newLevel = std::clamp(_currentLevel + offset, WIPER_MIN, WIPER_MAX);
  if (newLevel == _currentLevel) return;

  if (HW) HW->tools.flags.wipersChanged = true;
  
  _currentLevel = newLevel;
  _writeToPot(_currentLevel);
};


void CDigiPot::_writeToPot(int value) { if (_csPin < 0) return;
  static const SPISettings settings{8'000'000, MSBFIRST, SPI_MODE0};


  if (value < 0 || value > 255) return;
  
  if (_potValueCache[_csPin] == value) return; // No change — avoid redundant SPI write
  _potValueCache[_csPin] = value; // Update cache with new value


  uint8_t potValue = _inverted ? static_cast<uint8_t>(255-value) 
                               : static_cast<uint8_t>(    value);

  SPI.beginTransaction(settings);
  {
      digitalWrite(_csPin, LOW);
      delayMicroseconds(2);

      SPI.transfer(0x00);  // Address for wiper
      SPI.transfer(potValue);

      digitalWrite(_csPin, HIGH);
      delayMicroseconds(2);
  }
  SPI.endTransaction();
} 
