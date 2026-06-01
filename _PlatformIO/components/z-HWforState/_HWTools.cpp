#include "HWforState.h"
#include "_HWTools.h"
#include "CMasterTimer.h"
#include <tuple>

C32bitTimer HWTools::measureTimer = C32bitTimer::From_S(1.1).setPeriodic(true); 

HWTools::HWTools( HWforState& hw) : hw(hw) {

  static std::tuple<int, int> knownGaps[] = { {2, 107}, {4, 70}, {8, 40}, {12, 28}, {16, 22}, {24, 17} };

  for (const auto& [gap, midStep] : knownGaps)
    if (gap == HWParams::GAP_TOPBOT) HWParams::MID_STEP = midStep;

  if (HWParams::MID_STEP >= CDigiPot::MIDPOINT) ERROR("MID_STEP is too large");

}

