#pragma once
#include "Setup.h"
#include "CDigiPot.h"
#include "CFilteredSensor.h"
#include "XCommands.h"
#include "_HWParams.h"
#include <memory>

class HWTools;

struct HWforState {
   
  public:
    enum class Phase { SEARCH = 0, ZOOM = 1, MEASURE = 2, FOLLOW = 3, placeholder = 255};

    StateType state;
    HWforState(StateType state);
    ~HWforState();
    
    CDigiPot        top{CS.Top};
    CDigiPot        bot{CS.Bot};
    CDigiPot        mid{CS.Mid};

    CDigiPot        offset{CS.offset2};
    CDigiPot        gain{CS.gain};

    CFilteredSensor sensor1{SP.Sensor1, HWParams::SENSOR1_FILTER_T};
    CFilteredSensor sensor2{SP.Sensor2, HWParams::SENSOR2_FILTER_T};
    
    private:
      // this must be before tools in order to be instantiated in the constructor
      std::unique_ptr<HWTools> ownedTools; // Pimpl to avoid including HWTools in this header

    public:
      HWTools& tools; // the reference to use


    void begin(); // ensure hardware is configured

    // update hardware instances based on current sensor readings, and write to hardware if needed
    void update();

    // write current state of hardware instances to hardware devices
    void set();

    void setWipers(XCMD_SetWipers& cmd);
    inline void setPhase(Phase newPhase) { phase = newPhase; }
    inline Phase getPhase() const { return phase; }
        
    void _findSignal();
    void _zoomSignal();
    void _measureSignal();
    void _followSignal();



  private:
    Phase phase = Phase::placeholder;

    void _update(); 
    void _readSensor2();

    void _compensateSensor2(double change);
 

  using Zone = CSensor::Zone;
};

extern HWforState* HW;
extern HWforState* ActiveHW;
