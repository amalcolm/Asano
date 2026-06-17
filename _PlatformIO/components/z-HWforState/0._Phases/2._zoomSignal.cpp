#include "HWforState.h"
#include "_HWTools.h"
#include "CNoiseSample.h"
#include "CUSB.h"
#include <algorithm>

void HWforState::_zoomSignal() {
  auto& flags = tools.flags;

  tools.readCheck(); if (phase != Phase::ZOOM) return;

  if (flags.zoomLevel == -1) {
    flags.zoomLevel = 15;
    gain.setLevel(flags.zoomLevel);
    // mid is assumed to be near sensor1Target at this point, from SEARCH
    offset.setLevel(128);
    flags.zoomBalanceGain = -1;
    flags.zoomBalanceStableReads = 0;
    flags.zoomBalanceSteps = 0;
    flags.zoomFinishAfterBalance = false;
    delayMicroseconds(10);
    return;
  }

  if (!tools.balanceForZoom()) {
    if (phase != Phase::ZOOM) {
      flags.zoomLevel = -1;
      flags.zoomBalanceGain = -1;
      flags.zoomBalanceStableReads = 0;
      flags.zoomBalanceSteps = 0;
      flags.zoomFinishAfterBalance = false;
    }
    return;
  }

  if (flags.zoomFinishAfterBalance) {
    phase = Phase::MEASURE;
  }

  if (phase != Phase::ZOOM) {
    flags.zoomLevel = -1;
    flags.zoomBalanceGain = -1;
    flags.zoomBalanceStableReads = 0;
    flags.zoomBalanceSteps = 0;
    flags.zoomFinishAfterBalance = false;
    return;
  }

  int previousZoomLevel = flags.zoomLevel;
  flags.zoomLevel = std::min(flags.zoomLevel + 16, CDigiPot::WIPER_MAX);
  gain.setLevel(flags.zoomLevel);
  flags.zoomBalanceGain = -1;
  flags.zoomBalanceStableReads = 0;
  flags.zoomBalanceSteps = 0;
  delayMicroseconds(10);

  if (quickNoiseTest(40, sensor1.getPin()) > 20) {
    flags.zoomLevel = previousZoomLevel;
    gain.setLevel(flags.zoomLevel);
    flags.zoomBalanceGain = -1;
    flags.zoomBalanceStableReads = 0;
    flags.zoomBalanceSteps = 0;
    flags.zoomFinishAfterBalance = true;
    delayMicroseconds(10);
    USB.printf("Noise found... reverting to gain: %d\n", gain.getLevel());
    return;
  }

  if (flags.zoomLevel == CDigiPot::WIPER_MAX) {
    phase = Phase::MEASURE;
  }

  if (phase != Phase::ZOOM) {
    flags.zoomLevel = -1;
    flags.zoomBalanceGain = -1;
    flags.zoomBalanceStableReads = 0;
    flags.zoomBalanceSteps = 0;
    flags.zoomFinishAfterBalance = false;
  }
}
