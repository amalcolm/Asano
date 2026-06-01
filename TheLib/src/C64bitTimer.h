#pragma once
#include "CTimerBase.h"
#include <stdexcept>

class C64bitTimer : public CTimerBase {
protected:
  uint64_t _period = 0;
  bool _isPeriodic = true;

  // allow const methods to update these markers
  mutable uint64_t _lastMarker = 0;  
  mutable uint64_t _nextMarker = 0;
  mutable uint64_t _resetMarker = 0;

  C64bitTimer();

public:
  static C64bitTimer From_uS(double uS);
  static C64bitTimer From_mS(double mS);
  static C64bitTimer From_S (double  S);
  static C64bitTimer From_Hz(double Hz);

  inline C64bitTimer& setPeriodic(bool isPeriodic) { _isPeriodic = isPeriodic; return *this; }
  inline bool         getPeriodic() const { return _isPeriodic; }

  inline uint64_t getLastMarker() const { return _lastMarker; }
  inline uint64_t getNextMarker() const { return _nextMarker; }
  inline  int64_t getTicks() const { return static_cast<int64_t>(getCurrentTick() - _lastMarker); }
  inline  int64_t getTicksSinceReset() const { return static_cast<int64_t>(getCurrentTick() - _resetMarker); }

  inline double      getSeconds() const { return getTicks() * CTimerBase::getSecondsPerTick();      }
  inline double getMilliseconds() const { return getTicks() * CTimerBase::getMillisecondsPerTick(); }
  inline double getMicroseconds() const { return getTicks() * CTimerBase::getMicrosecondsPerTick(); }

  inline double      getSeconds(uint64_t mark) const { return static_cast<int64_t>(mark - _lastMarker) * CTimerBase::getSecondsPerTick();      }
  inline double getMilliseconds(uint64_t mark) const { return static_cast<int64_t>(mark - _lastMarker) * CTimerBase::getMillisecondsPerTick(); }
  inline double getMicroseconds(uint64_t mark) const { return static_cast<int64_t>(mark - _lastMarker) * CTimerBase::getMicrosecondsPerTick(); }



  inline void updateMarkers(uint64_t now) const {
    if (_period == 0 || _isPeriodic == false) {
      _lastMarker = _nextMarker;
      return;
    }

  do {
    _nextMarker += _period;
  }
  while (static_cast<int64_t>(now - _nextMarker) >= 0);
  
    _lastMarker = _nextMarker - _period;
  }

  inline bool passed() const {
    uint64_t now = getCurrentTick();  if (_period == 0) return true;
    int64_t diff = static_cast<int64_t>(now - _nextMarker);
    if (diff < 0) return false;

    updateMarkers(now);
    return true;
  }

  inline bool waiting() const {
    uint64_t now = getCurrentTick();  if (_period == 0) return false;
    int64_t diff = static_cast<int64_t>(now - _nextMarker);
    if (diff < 0) return true;

    updateMarkers(now);
    return false;
  }

   inline uint64_t wait() const { if (_period == 0) return getCurrentTick();

    uint64_t now;
    do {
      now = getCurrentTick();
    }
    while (static_cast<int64_t>(now - _nextMarker) < 0);
    
    updateMarkers(now);
    return now;
  }

  inline void forceNow() const {
    _lastMarker = getCurrentTick();
    _nextMarker = _lastMarker;
  }

  inline void forceAfter(uint64_t next) const {
    _lastMarker = getCurrentTick();
    _nextMarker = _lastMarker + next;
  }

   inline void forceAt(uint64_t time) const {
    _lastMarker = getCurrentTick();
    _nextMarker = time;
  }

  inline uint64_t reset() const {
    _lastMarker = getCurrentTick();
    _nextMarker = _lastMarker + _period;
    _resetMarker = _lastMarker;
    return _lastMarker;
  }

  inline void resetAfter(uint64_t delta) const {
    _lastMarker = getCurrentTick();
    _nextMarker = _lastMarker + delta;
  }

  inline void resetAt(uint64_t time) const {
    _lastMarker = getCurrentTick();
    _nextMarker = time;
  }

  inline virtual void sync() const { sync(getCurrentTick()); }

  inline void sync(uint64_t now) const { if (_period == 0) return;
    _lastMarker = now - ((now - _lastMarker) % _period);
    _nextMarker = _lastMarker + _period;  }

  inline void syncTo(const C64bitTimer& other) const {
    _lastMarker = other.getLastMarker();
    _nextMarker = other.getNextMarker();
  }

  inline uint64_t getPeriodTicks()  const { return _period; }
  inline double   getPeriod_uS()    const { return _period * CTimerBase::getMicrosecondsPerTick(); }
  inline double   getPeriod_mS()    const { return _period * CTimerBase::getMillisecondsPerTick(); }
  inline double   getPeriod_S ()    const { return _period * CTimerBase::getSecondsPerTick();      }

  inline  int64_t getRemainingTicks() const { return _period == 0 ? 0 : static_cast<int64_t>(_nextMarker - getCurrentTick()); }
  inline double   getRemaining_uS()   const { return getRemainingTicks() * CTimerBase::getMicrosecondsPerTick(); }
  inline double   getRemaining_mS()   const { return getRemainingTicks() * CTimerBase::getMillisecondsPerTick(); }
  inline double   getRemaining_S()    const { return getRemainingTicks() * CTimerBase::getSecondsPerTick();      }
};
