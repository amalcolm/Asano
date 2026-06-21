#pragma once
#include "HWforState.h"
#include "_HWParams.h"

struct HWTools
{
public:
  HWTools(HWforState& hw);
 ~HWTools();
  HWforState& hw;

  struct HWflags {
    bool begun = false;
    bool holdWipers = false;
    bool wipersChanged = true;
    int  zoomLevel = -1;

    bool inZone = false;

  } flags;


  struct BalanceFlags {
    StateType state;
    int  gain = -1;
    int  stableReads = 0;
    int  steps = 0;
    bool finish = false;

    void reset() { gain = -1; stableReads = 0; steps = 0; finish = false; }

  } balance;


  struct HWCache {
    double S1_target = -1.0;
    double S2_target = -1.0;


    double dS1_mid = -1.0;
    double dS2_mid = -1.0;

    double dS2_offset = -1.0;

    void set(double s2 = -1.0);
  } cache;

  void dbg();

  class CCircuit* _ptr_Circuit; // Pimpl to avoid including CCircuit in the header
  class CCircuit& circuit;

  // tests
  void testMidOffset();
  bool testGetNoiseSample();

  static class C32bitTimer measureTimer;

  int16_t readCheck(); // reads sensor2 and updates phase if signal lost
  void adjustTopBot(); // adjust top and bot if mid is at risk of saturating
  void centre(CSensor& sensor, CDigiPot& pot); // set pot to centre sensor

  inline void centreMid   (CSensor& sensor) { centre(sensor, hw.mid); }
  inline void centreOffset(CSensor& sensor) { centre(sensor, hw.offset); }

  void seekTargets();
  bool balanceForZoom();
  void seekTarget(CFilteredSensor& sensor, CDigiPot& pot);

};
