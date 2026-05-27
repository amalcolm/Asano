#pragma once
#include "CTimerBase.h"

class C32bitTimer : public CTimerBase {
protected:
  uint32_t _period = 0;
  bool _isPeriodic = false;

  // allow const methods to update these markers
  mutable uint32_t _lastMarker = 0;  
  mutable uint32_t _nextMarker = 0;
  mutable uint32_t _resetMarker = 0;

  C32bitTimer();

public:
  static C32bitTimer From_uS(double uS);
  static C32bitTimer From_mS(double mS);
  static C32bitTimer From_S (double  S);
  static C32bitTimer From_Hz(double Hz);

  inline C32bitTimer& setPeriodic(bool isPeriodic) { _isPeriodic = isPeriodic; return *this; }
  inline bool         getPeriodic() const { return _isPeriodic; }

  inline uint32_t getLastMarker() const { return _lastMarker; }
  inline uint32_t getNextMarker() const { return _nextMarker; }
  inline  int32_t getTicks() const { return static_cast<int32_t>(ARM_DWT_CYCCNT - _lastMarker); }
  inline  int32_t getTicksSinceReset() const { return static_cast<int32_t>(ARM_DWT_CYCCNT - _resetMarker); }

  inline double      getSeconds() const { return getTicks() * CTimerBase::getSecondsPerTick();      }
  inline double getMilliseconds() const { return getTicks() * CTimerBase::getMillisecondsPerTick(); }
  inline double getMicroseconds() const { return getTicks() * CTimerBase::getMicrosecondsPerTick(); }

  inline double      getSeconds(uint32_t mark) const { return static_cast<int32_t>(mark - _lastMarker) * CTimerBase::getSecondsPerTick();      }
  inline double getMilliseconds(uint32_t mark) const { return static_cast<int32_t>(mark - _lastMarker) * CTimerBase::getMillisecondsPerTick(); }
  inline double getMicroseconds(uint32_t mark) const { return static_cast<int32_t>(mark - _lastMarker) * CTimerBase::getMicrosecondsPerTick(); }

  inline void updateMarkers(uint32_t now) const {
    if (_period == 0 || _isPeriodic == false) {
      _lastMarker = _nextMarker;
      return;
    }

  do {
    _nextMarker += _period;
  }
  while (static_cast<int32_t>(now - _nextMarker) >= 0);
  
    _lastMarker = _nextMarker - _period;
  }

  inline bool passed() const {
    uint32_t now = ARM_DWT_CYCCNT;  if (_period == 0) return true;
    int32_t diff = static_cast<int32_t>(now - _nextMarker);
    if (diff < 0) return false;

    updateMarkers(now);
    return true;
  }

  inline bool waiting() const {
    uint32_t now = ARM_DWT_CYCCNT;  if (_period == 0) return false;
    int32_t diff = static_cast<int32_t>(now - _nextMarker);
    if (diff < 0) return true;

    updateMarkers(now);
    return false;
  }

   inline uint32_t wait() const { if (_period == 0) return ARM_DWT_CYCCNT;

    uint32_t now;
    do {
      now = ARM_DWT_CYCCNT;
    }
    while (static_cast<int32_t>(now - _nextMarker) < 0);
    
    updateMarkers(now);
    return now;
  }

  inline void forceNow() const {
    _lastMarker = ARM_DWT_CYCCNT;
    _nextMarker = _lastMarker;
  }

  inline void forceAfter(uint32_t next) const {
    _lastMarker = ARM_DWT_CYCCNT;
    _nextMarker = _lastMarker + next;
  }

   inline void forceAt(uint32_t time) const {
    _lastMarker = ARM_DWT_CYCCNT;
    _nextMarker = time;
  }

  inline uint32_t reset() const {
    _lastMarker = ARM_DWT_CYCCNT;
    _nextMarker = _lastMarker + _period;
    _resetMarker = _lastMarker;
    return _lastMarker;
  }

  inline void resetAfter(uint32_t delta) const {
    _lastMarker = ARM_DWT_CYCCNT;
    _nextMarker = _lastMarker + delta;
  }

  inline void resetAt(uint32_t time) const {
    _lastMarker = ARM_DWT_CYCCNT;
    _nextMarker = time;
  }

  inline virtual void sync() const { sync(ARM_DWT_CYCCNT); }

  inline void sync(uint32_t now) const { if (_period == 0) return;
    _lastMarker = now - ((now - _lastMarker) % _period);
    _nextMarker = _lastMarker + _period;  }

  inline void syncTo(const C32bitTimer& other) const {
    _lastMarker = other.getLastMarker();
    _nextMarker = other.getNextMarker();
  }

  inline uint32_t getPeriodTicks()  const { return _period; }
  inline double   getPeriod_uS()    const { return _period * CTimerBase::getMicrosecondsPerTick(); }
  inline double   getPeriod_mS()    const { return _period * CTimerBase::getMillisecondsPerTick(); }
  inline double   getPeriod_S ()    const { return _period * CTimerBase::getSecondsPerTick();      }

  inline  int32_t getRemainingTicks() const { return _period == 0 ? 0 : static_cast<int32_t>(_nextMarker - ARM_DWT_CYCCNT); }
  inline double   getRemaining_uS()   const { return getRemainingTicks() * CTimerBase::getMicrosecondsPerTick(); }
  inline double   getRemaining_mS()   const { return getRemainingTicks() * CTimerBase::getMillisecondsPerTick(); }
  inline double   getRemaining_S()    const { return getRemainingTicks() * CTimerBase::getSecondsPerTick();      }
};
