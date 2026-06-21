#include "_HWTools.h"
#include "HWforState.h"
#include "CUSB.h"
#include <algorithm>
#include <cmath>

namespace {
  constexpr int SAMPLES = 12;
  constexpr int MID_STEP = 1;
  constexpr int OFFSET_STEP = 2;
  constexpr int REQUIRED_STABLE_READS = 2;
  constexpr int MAX_BALANCE_STEPS = 160;
  constexpr double S1_TOLERANCE = 4.0;
  constexpr double S2_TOLERANCE = 40.0;

  struct Reading {
    double s1 = -1.0;
    double s2 = -1.0;
    double e1 = 0.0;
    double e2 = 0.0;
    bool s2InZone = false;
  };

  int getChange(const CDigiPot& pot, double error, int step);
  void read(HWforState& hw, Reading& reading);

}

bool HWTools::balanceForZoom() {
  auto& balance = hw.tools.balance;

  readCheck();
  if (hw.getPhase() != HWforState::Phase::ZOOM) {
    balance.reset();
    return false;
  }

  if (balance.gain != hw.gain.getLevel()) {
    balance.gain = hw.gain.getLevel();
    balance.stableReads = 0;
    balance.steps = 0;
  }

  double quickT = CFilteredSensor::getTfromSamples(SAMPLES);
  hw.sensor1.pushT(quickT);
  hw.sensor2.pushT(quickT);

  bool result = false;  // default to not finished
  int delta = 0;
  Reading before; //, after;

  read(hw, before);

  if (before.s2InZone == false) {
    hw.setPhase(HWforState::Phase::SEARCH);
    goto exit;
  }

  if (abs(before.e1) <= S1_TOLERANCE && abs(before.e2) <= S2_TOLERANCE) {
    balance.stableReads++;
//    USB.printf("bz,ok,g=%d,m=%d,o=%d,e1=%.1f,e2=%.1f,n=%d\n",
  //    hw.gain.getLevel(), hw.mid.getLevel(), hw.offset.getLevel(), before.e1, before.e2, balance.stableReads);

    result = balance.stableReads >= REQUIRED_STABLE_READS;
    goto exit;
  }

  balance.stableReads = 0;
  if (++balance.steps > MAX_BALANCE_STEPS) {
 //   USB.printf("bz,limit,g=%d,m=%d,o=%d,e1=%.1f,e2=%.1f\n",
 //     hw.gain.getLevel(), hw.mid.getLevel(), hw.offset.getLevel(), before.e1, before.e2);
    balance.finish = false;
    hw.setPhase(HWforState::Phase::SEARCH);
    goto exit;
  }


  if (std::abs(before.e1) > S1_TOLERANCE) {
//    axis = 'm';
    delta = getChange(hw.mid, before.e1, MID_STEP);
    if (delta != 0) // ie. not it a limit (0 or 255)
      hw.mid.changeBy(delta);

  } else {
//    axis = 'o';
    delta = getChange(hw.offset, before.e2, OFFSET_STEP);
    if (delta != 0)
      hw.offset.changeBy(delta);
  }

  hw.sensor2.read();
  if (hw.sensor2.inZone == false) {
    hw.setPhase(HWforState::Phase::SEARCH);
    goto exit;
  }
 // read(hw, after);

//  USB.printf("bz,s,g=%d,ax=%c,m=%d,o=%d,e1=%.1f,e2=%.1f,c=%d,a1=%.1f,a2=%.1f\n",
//    hw.gain.getLevel(), axis, hw.mid.getLevel(), hw.offset.getLevel(), before.e1, before.e2, delta, after.e1, after.e2);


//  if (after.s2InZone == false) {
//    USB.printf("bz,rail,g=%d,m=%d,o=%d,a2=%.1f\n",
//      hw.gain.getLevel(), hw.mid.getLevel(), hw.offset.getLevel(), after.e2);
//    hw.setPhase(HWforState::Phase::SEARCH);
//    goto exit;
//  }
  if (delta == 0) {
//    USB.printf("bz,stalled,g=%d,ax=%c,m=%d,o=%d,e1=%.1f,e2=%.1f\n",
//      hw.gain.getLevel(), axis, hw.mid.getLevel(), hw.offset.getLevel(), before.e1, before.e2);
    balance.finish = false;
    hw.setPhase(HWforState::Phase::SEARCH);
  }


exit:
  hw.sensor1.popT();
  hw.sensor2.popT();
  return result;
}


namespace {

  int getChange(const CDigiPot& pot, double error, int step) {
    int level = pot.getLevel();

    // error = sensor - target, so positive error requests a lower wiper level.
    int requested = error > 0.0 ? level - step : level + step;
    return std::clamp(requested, CDigiPot::WIPER_MIN, CDigiPot::WIPER_MAX) - level;
  }


  void read(HWforState& hw, Reading& reading) {
    hw.sensor1.read(SAMPLES);
    hw.sensor2.read(SAMPLES);
    reading.s1 = hw.sensor1.lastValue();
    reading.s2 = hw.sensor2.lastValue();
    reading.e1 = reading.s1 - HWParams::SENSOR1_TARGET;
    reading.e2 = reading.s2 - HWParams::SENSOR2_TARGET;
    reading.s2InZone = hw.sensor2.inZone;
  }


}