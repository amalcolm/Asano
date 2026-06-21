#include "HWforState.h"
#include "_HWTools.h"
#include "CNoiseSample.h"
#include "CUSB.h"
#include <algorithm>

void HWforState::_zoomSignal() {
  auto& flags = tools.flags;
  auto& balance = tools.balance;

  tools.readCheck(); if (phase != Phase::ZOOM) return;

  if (flags.zoomLevel == -1) {
    flags.zoomLevel = 15;
    gain.setLevel(flags.zoomLevel);
    // mid is assumed to be near sensor1Target at this point, from SEARCH
    offset.setLevel(128);
    balance.reset();
    delayMicroseconds(10);
    return;
  }

  int previousZoomLevel = flags.zoomLevel;

  if (tools.balanceForZoom() == false) goto exit;

  if (balance.finish) { phase = Phase::MEASURE; goto exit; }

  flags.zoomLevel = std::min(flags.zoomLevel + 16, CDigiPot::WIPER_MAX);
  gain.setLevel(flags.zoomLevel);
  balance.reset();
  delayMicroseconds(10);

  if (quickNoiseTest(40, sensor1.getPin()) > 20) {
    flags.zoomLevel = previousZoomLevel;
    gain.setLevel(flags.zoomLevel);
    balance.reset();
    balance.finish = true;
    delayMicroseconds(10);
    USB.printf("Noise found... reverting to gain: %d\n", gain.getLevel());
    return;
  }

  if (flags.zoomLevel == CDigiPot::WIPER_MAX) {
    phase = Phase::MEASURE;
  }

exit:
  if (phase != Phase::ZOOM) {
    flags.zoomLevel = -1;
    balance.reset();
  }
}
