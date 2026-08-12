#include "HWforState.h"
#include "_HWTools.h"
#include "CNoiseSample.h"
#include "CUSB.h"
#include <algorithm>

namespace {
  constexpr int ZOOM_STEP = 16;
  constexpr int NOISE_SAMPLES = 40;
  constexpr int NOISE_THRESHOLD = 20;
}

void HWforState::_zoomSignal() {
  auto& flags = tools.flags;
  auto& balance = tools.balance;

  tools.readCheck(); if (phase != Phase::ZOOM) return;

  if (flags.zoomLevel == -1) {
    flags.zoomLevel = ZOOM_STEP - 1;
    gain.setLevel(flags.zoomLevel);
    // mid is assumed to be near sensor1Target at this point, from SEARCH
    offset.setLevel(128);
    balance.reset();
    delayMicroseconds(10);
    return;
  }

  if (tools.balanceForZoom() == false) goto exit;

  if (balance.finish == false) {
    flags.zoomLevel = std::min(flags.zoomLevel + ZOOM_STEP, CDigiPot::WIPER_MAX);
    gain.setLevel(flags.zoomLevel);
    balance.reset();
    delayMicroseconds(10);
  }

  if (quickNoiseTest(NOISE_SAMPLES, sensor1.getPin()) > NOISE_THRESHOLD) {
    int nextZoomLevel = std::max(flags.zoomLevel - ZOOM_STEP, CDigiPot::WIPER_MIN);
    if (nextZoomLevel == flags.zoomLevel) {
      phase = Phase::MEASURE;
      goto exit;
    }

    flags.zoomLevel = nextZoomLevel;
    gain.setLevel(flags.zoomLevel);
    balance.reset();
    balance.finish = true;
    delayMicroseconds(10);

    if (CFG::debugMode == CFG::DebugMode::SINGLE_STATE)
      USB.printf("Noise found... reducing gain to: %d\n", gain.getLevel());
    return;
  }

  if (balance.finish || flags.zoomLevel == CDigiPot::WIPER_MAX) {
    phase = Phase::MEASURE;
  }

exit:
  if (phase != Phase::ZOOM) {
    flags.zoomLevel = -1;
    balance.reset();
  }
}
