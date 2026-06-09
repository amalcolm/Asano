#include "HWforState.h"
#include "_HWTools.h"
#include "CCircuit.h"
#include "CMasterTimer.h"
#include <tuple>

C32bitTimer HWTools::measureTimer = C32bitTimer::From_S(1.1).setPeriodic(true); 

HWTools::HWTools(HWforState& hw) : hw(hw), _ptr_Circuit(new CCircuit()), circuit(*_ptr_Circuit) {

  static std::tuple<int, int> knownGaps[] = { {2, 107}, {4, 70}, {8, 40}, {12, 28}, {16, 22}, {24, 17} };

  for (const auto& [gap, midStep] : knownGaps)
    if (gap == HWParams::GAP_TOPBOT) HWParams::MID_STEP = midStep;

  if (HWParams::MID_STEP >= CDigiPot::MIDPOINT) ERROR("MID_STEP is too large");

}

HWTools::~HWTools() {
  delete _ptr_Circuit; _ptr_Circuit = nullptr;
}


void HWTools::HWCache::set(double s2) {
  HWforState& hw = *HW;
  HWTools& tools = hw.tools;

  double s1 = hw.sensor1.lastV();
  if (s2 < 0) s2 = hw.sensor2.lastV();

  S1_target = hw.sensor1.isInverted() ? 1023 - HWParams::SENSOR1_TARGET : HWParams::SENSOR1_TARGET;
  S2_target = hw.sensor2.isInverted() ? 1023 - HWParams::SENSOR2_TARGET : HWParams::SENSOR2_TARGET;



  dS2_mid = tools.circuit.sensor2DeltaFromMidDelta(1, s2);
  dS1_mid = tools.circuit.sensor1FromSensor2(s2 + dS2_mid) - s1;

  dS2_offset = tools.circuit.sensor2DeltaFromOffsetDelta(1);
}