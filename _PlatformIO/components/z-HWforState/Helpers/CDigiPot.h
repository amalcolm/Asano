#pragma once
#include "CRunningAverage.h"
#include <utility>
#include <deque>

class CDigiPot {
public:
  static constexpr int WIPER_MIN = 0;
  static constexpr int WIPER_MAX = 255;
  static constexpr int MIDPOINT = (WIPER_MAX + WIPER_MIN) / 2;

  CDigiPot(int csPin);
  virtual ~CDigiPot(); // Needed to call destructor of subclass

  void begin(int initialLevel = 128);
  void reset(int level);

  void setLevel(int newLevel);
  void offsetLevel(int offset);

  inline int  getLevel() const { return _currentLevel;    }
  inline void invert()         { _inverted = !_inverted;  }

  inline virtual void writeCurrentToPot() { _writeToPot(_currentLevel); }
  

protected:
  int _csPin; 
  int _currentLevel = -1;
  
  bool _inverted = false;
  
private:
  void _writeToPot(int value);
};
