#pragma once
#include "Setup.h"
#include "Helpers/CDigiPot.h"
#include "Helpers/CSensor.h"
#include "XCommands.h"

inline static C32bitTimer measureTimer = C32bitTimer::From_S(1.1).setPeriodic(true); 

struct HWforState {
  private:
    static constexpr int GAP_TOPBOT   = 3;
    static inline    int MID_STEP     = 17;  // depends on GAP_TOPBOT - set in contructor

    static constexpr uint8_t SAFE_MIN_WIPER_LEVEL = 16;
    static constexpr uint8_t SAFE_MAX_WIPER_LEVEL = CDigiPot::WIPER_MAX - SAFE_MIN_WIPER_LEVEL;
    
    static constexpr int16_t SENSOR1_TARGET = 490;
    static constexpr int16_t SENSOR2_TARGET = CSensor::MAX_VALUE - SENSOR1_TARGET;  // as sensor2 is inverted, stable state is at sensor2 = 1023 - sensor1, when perceived gain is zero

  public:
    enum class Phase { SEARCH = 0, ZOOM = 1, MEASURE = 2, FOLLOW = 3, placeholder = 255};

    StateType state;
    HWforState(StateType state);

    struct HWflags {
      bool begun = false;
      bool holdWipers = false;
      bool wipersChanged = true;
      int  zoomLevel = -1;

      bool inZone = false;
      
      void dbg();
    } flags;


    CDigiPot       top{CS.Top};
    CDigiPot       bot{CS.Bot};
    CDigiPot       mid{CS.Mid};

    CDigiPot       offset{CS.offset2};
    CDigiPot       gain{CS.gain};

    CSensor        sensor1{SP.Sensor1};
    CSensor        sensor2{SP.Sensor2};
    
    void begin(); // ensure hardware is configured

    // update hardware instances based on current sensor readings, and write to hardware if needed
    void update() { if (!Ready) return; else if (!flags.begun) begin();

      Timer.addEvent(EventKind::HW_UPDATE_START);

      _update();

      if (CFG::hasCommandFlag(CommandFlags::RunDebugUpdate)) 
        flags.dbg();  // defined in _DBG.cpp
      
      Timer.addEvent(EventKind::HW_UPDATE_COMPLETE);
    }

    // write current state of hardware instances to hardware devices
    void set();

    void setWipers(XCMD_SetWipers& cmd);
    inline void setPhase(Phase newPhase) { phase = newPhase; }

    // tests
    void testMidOffset();
    void testGetNoiseSample();

    void _findSignal();
    void _zoomSignal();
    void _measureSignal();
    void _followSignal();


  private:
    Phase phase = Phase::placeholder;

    void _update(); 
    void _readSensor2();


    int16_t readCheck(); // reads sensor2 and updates phase if signal lost
    void adjustTopBot(); // adjust top and bot if mid is at risk of saturating
    void centre(CSensor& sensor, CDigiPot& pot); // set pot to centre sensor

    inline void centreMid   (CSensor& sensor) { centre(sensor, mid); }
    inline void centreOffset(CSensor& sensor) { centre(sensor, offset); }

    using Zone = CSensor::Zone;
};

extern HWforState* HW;
