#pragma once
#include "Helpers.h"
#include <Arduino.h>
#include <array>
#include <vector>
#include <atomic>


#include "CUSB.h"
#include <CrashReport.h>


class LEDpins {

public:
  static const bool inverted = false;
  const int high = inverted ? LOW : HIGH;
  const int low  = inverted ? HIGH : LOW;

  uint32_t dbgBits = 0;


  void begin() const;

  void write(int pin, bool value);

  void writeState(uint32_t state) const {

    uint16_t output =   state & 0x000000FF; // only use lower 16 bits, as we only have 16 pins
             output |= (state & 0x00FF0000) >> 8; // allow upper bits to set higher pins, but mask out any bits above 31
    write_raw(output);
  }

  void clear() {
    static uint16_t empty = inverted ? 0xFFFF : 0x0000;
    write_raw(empty);
  }


  void set(int pin);
  void clear(int pin);
  void toggle(int pin);

  inline void on (int pin) { set  (pin); }
  inline void off(int pin) { clear(pin); }

private:
  void write_raw(uint16_t data) const;
};

// -- Base ----------------------------------------------------------
struct Pins {
  enum class Kind { Input, Output, LED };

protected:
  static constexpr uint8_t MAX_HEADS = 16;
  static constexpr uint8_t MAX_PINS  = 42;
  inline static int numHeadsUsed = 0;
  inline static std::array<std::array<Pins*, MAX_PINS>, MAX_HEADS> pinMap{};
  inline static std::array<int, 32> pinsPerBit{}; // map bit number to pin number

  inline static int      _currentHead = -1; // chosen head to use
  inline static uint32_t _headEpoch   = 0;  // incremented each time head is changed

  uint8_t _bit = 255; // invalid bit number
  uint8_t _pin = 255; // invalid pin number

  explicit Pins(std::initializer_list<uint8_t> pinPerHead ) {
    if (CrashReport) CSerialWrapper::SendCrashReport(CrashReport);

    int iHead = 0;

    if (pinPerHead.size() == 0) ERROR("At least one pin must be specified for a Pins object");
    if (pinPerHead.size() > MAX_HEADS) ERROR("Too many heads specified (%d), max is %d", pinPerHead.size(), MAX_HEADS);

    uint8_t pinStatic = *pinPerHead.begin(); // only used if single pin provided

    switch (pinPerHead.size()) {
      case 0: ERROR("At least one pin must be specified for a Pins object"); break;

      case 1:
        // USB.printf("Pins: Using static pin %u for all heads", pinStatic); not an error, just a note
        for (iHead = 1; iHead < MAX_HEADS; ++iHead) {
         
          if (pinMap[iHead][pinStatic] != nullptr) 
            ERROR("Pin %u already defined. Head %d", pinStatic, iHead);
          else
            pinMap[iHead][pinStatic] = this;
        }
        _pin = pinStatic;
        break;

      default:
        for (uint8_t pin : pinPerHead) { 
          if (pin >= MAX_PINS) ERROR("Pin %u out of range (head %d, max %d)", pin, iHead, MAX_PINS);

          if (iHead >= numHeadsUsed)
            numHeadsUsed = iHead + 1;

          if (pinMap[iHead][pin] != nullptr) 
            ERROR("Pin %u already defined. Head %d", pin, iHead);
          else
            pinMap[iHead][pin] = this;

          if (iHead == 0)
            _bit = pin;

          ++iHead;
        }
        break;
      }
  }


public:
  static inline int      getCurrentHead() noexcept { return _currentHead; }
  static inline uint32_t getHeadEpoch()   noexcept { return _headEpoch;   }

  Pins(const Pins&) = delete;
  Pins& operator=(const Pins&) = delete;

  virtual Kind kind() const noexcept = 0; 
  inline constexpr operator uint8_t() const noexcept { return _pin; }
  inline uint8_t getNum() const noexcept { return _pin; }
  
  static Pins* get(int pin) {
    if (_currentHead < 0 || pin < 0 || pin >= MAX_PINS) return nullptr;

    return pinMap[_currentHead][pin];
  }
  
  static std::array<Pins*, MAX_PINS>& getPinMap() {
    if (_currentHead < 0) ERROR("No head selected when accessing pin map");
    return pinMap[_currentHead];
  }

  static void setHead(int head) {
    if (head < 1 || head >= numHeadsUsed) ERROR("Head %d out of range, (1 to %d)", head, numHeadsUsed);
    if (head == _currentHead) return;

    pinsPerBit.fill(-1);

    for (int pin = 0; pin < MAX_PINS; ++pin)
      if (auto* p = pinMap[head][pin]) {
        p->_pin = pin;
        pinsPerBit[p->_bit] = pin;
      }

    _currentHead = head;
    _headEpoch++;
  }

  inline static uint8_t pinForBit(uint8_t bit) {
    if (bit >= 32) ERROR("Bit %u out of range (0-31)", bit);
    int pin = pinsPerBit[bit];
    if (pin < 0) ERROR("No pin mapped for bit %u on head %d", bit, _currentHead);
    return pin;
  }

  static void flash(int numFlashes = 3);
  inline static bool flashReset = false;
  
};

// -- Output --------------------------------------------------------
struct OutputPin : Pins {
  explicit OutputPin(std::initializer_list<uint8_t> pinPerHead) : Pins(pinPerHead) { }
  explicit OutputPin(uint8_t pin) : Pins({pin}) { begin(); }  // used for activityLED;
  Kind kind() const noexcept override { return Kind::Output; }

  inline OutputPin& begin(int mode = OUTPUT) { pinMode(_pin, mode); clear(); return *this; }
  inline void write(int level) const  { digitalWrite(_pin, level); }

  inline void toggle()         const  { digitalToggle(_pin); }
  
  inline void set()            const  { digitalWrite(_pin, _high); }
  inline void clear()          const  { digitalWrite(_pin, _low ); }

  inline void on()             const  { set();   }  // inline negates addition call overhead
  inline void off()            const  { clear(); }

  inline OutputPin& invert()          { uint8_t t=_high; _high=_low; _low=t; return *this; }

private:
  uint8_t _high = HIGH, _low = LOW;
};

struct LedPin : OutputPin {
    using OutputPin::OutputPin;          // inherit all OutputPin constructors
    Kind kind() const noexcept override { return Kind::LED; }
};



// -- Input ---------------------------------------------------------
struct InputPin : Pins {
  explicit InputPin(std::initializer_list<uint8_t> pinPerHead) : Pins(pinPerHead) {}
  Kind kind() const noexcept override { return Kind::Input; }

  inline void begin(int mode = INPUT) const { pinMode(_pin, mode); }
  inline int  read()                  const  { return digitalRead(_pin); }
};

// -- Range of predefined LED Pins ------------------------------
struct LedPinRange {
    uint8_t start{}, end{};
    uint32_t cachedEpoch{0};
    std::vector<LedPin*> pins;

    LedPinRange(uint8_t s, uint8_t e) : start(s), end(e) {
      if (start > end) std::swap(start, end);
    }

    void refreshIfStale() {
      if (cachedEpoch == Pins::getHeadEpoch()) return;

      pins.clear();
      const auto& map = Pins::getPinMap();
      pins.reserve(end - start + 1);

      for (uint8_t p = start; p <= end; ++p)
        if (Pins* base = map[p]) 
          if (base->kind() == Pins::Kind::LED) 
            pins.emplace_back(static_cast<LedPin*>(base));
        

      cachedEpoch = Pins::getHeadEpoch();
    }

    // Convenience wrappers that ensure freshness
    void begin()   { refreshIfStale(); for (auto* pin : pins) { pin->begin(); pin->clear(); } }
    void set()     { refreshIfStale(); for (auto* pin : pins) { pin->set();                 } }
    void clear()   { refreshIfStale(); for (auto* pin : pins) { pin->clear();               } }
    void invert()  { refreshIfStale(); for (auto* pin : pins) { pin->invert();              } }
}; 
