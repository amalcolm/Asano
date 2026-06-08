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

   
    tools.centreMid(sensor1);    if (phase != Phase::ZOOM) goto exit; 
    tools.centreOffset(sensor2); if (phase != Phase::ZOOM) goto exit;
    // starting point with stability, 
  }


  
  while (phase == Phase::ZOOM) {
    flags.zoomLevel += 8;
    gain.setLevel(flags.zoomLevel);
    delayMicroseconds(10);
    
    if (quickNoiseTest(40, sensor1.getPin()) > 20) {
      gain.setLevel(flags.zoomLevel-16);
      delayMicroseconds(10);
      phase = Phase::MEASURE;
      USB.printf("Noise failed found... reverting to gain: %d\n", gain.getLevel());
    }

    tools.centreMid(sensor1);       if (phase != Phase::ZOOM) goto exit;

    tools.centreOffset(sensor2);    if (phase != Phase::ZOOM) goto exit;

    if (gain.getLevel() == CDigiPot::WIPER_MAX) phase = Phase::MEASURE;
  }

exit:
  flags.zoomLevel = -1; // reset zoom level if we are leaving zoom phase

}