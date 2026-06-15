#pragma once

class CSensor {
public:
  static constexpr int MIDPOINT = 512;
  static constexpr int MAX_VALUE = 1023;

  enum class Zone { Low = -1, inZone = 0, High = +1, Placeholder = 255} ;
  Zone zone = Zone::Placeholder;
  bool inZone = false;


  CSensor(int pin);

  void begin();
  void invert();

  int  read();

  inline bool isInverted()   const { return _inverted;     }
  inline int  lastValue()    const { return _lastValue;    }
  inline int  getPin()       const { return _pin;          }

protected:

  Zone _updateZone();


  int _pin; 
  int _lastValue = 0;
  bool _inverted = false;
};
