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
    delayMicroseconds(10);

    tools.seekTargets();
  }

  bool reverting = false;

  int itteration = 0;

  while (phase == Phase::ZOOM) {
    if (++itteration > 1000) ERROR("zoomSignal: too many iterations");

    flags.zoomLevel += 16;
    gain.setLevel(flags.zoomLevel);
    delayMicroseconds(10);
    
    if (quickNoiseTest(40, sensor1.getPin()) > 20) {
      reverting = true;
      gain.setLevel(flags.zoomLevel - 16);
      delayMicroseconds(10);
    }

    tools.readCheck(); if (phase != Phase::ZOOM) goto exit;

    tools.seekTargets();

    if (reverting) {
      phase = Phase::MEASURE;
      USB.printf("Noise found... reverting to gain: %d\n", gain.getLevel());
    }

    if (flags.zoomLevel == CDigiPot::WIPER_MAX) {
      phase = Phase::MEASURE;
    }
  }

 exit:
  if (phase != Phase::ZOOM)
  {
     flags.zoomLevel = -1;

     tools.cache.set();
  }
}