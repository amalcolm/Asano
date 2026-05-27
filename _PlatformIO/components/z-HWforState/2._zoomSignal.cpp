#include "HWforState.h"
#include "CNoiseSample.h"
#include "CUSB.h"
#include <algorithm>

void HWforState::_zoomSignal() { 
   readCheck(); if (phase != Phase::ZOOM) return; 

   if (flags.zoomLevel == -1) {
    flags.zoomLevel = 15;
    gain.setLevel(flags.zoomLevel);
    // mid is assumed to be near sensor1Target at this point, from SEARCH
    offset.setLevel(128);
    delayMicroseconds(10);

   
    centreMid(sensor1);    if (phase != Phase::ZOOM) goto exit; 
    centreOffset(sensor2); if (phase != Phase::ZOOM) goto exit;
    // starting point with stability, 
  }

  flags.zoomLevel = -1; phase = Phase::MEASURE;  return;  while (phase == Phase::ZOOM) {
  USB.printf("Zooming... Gain: %d, mid: %d, offset: %d, Sensor1: %f, Sensor2: %f\n",
      gain.getLevel(), mid.getLevel(), offset.getLevel(), sensor1.lastV(), sensor2.lastV()
    );
    flags.zoomLevel += 8;
    gain.setLevel(flags.zoomLevel);
    delayMicroseconds(10);
    
    if (quickNoiseTest(40, sensor1.getPin()) > 20) {
      gain.setLevel(flags.zoomLevel-16);
      delayMicroseconds(10);
      phase = Phase::MEASURE;
      USB.printf("Noise failed found... reverting to gain: %d\n", gain.getLevel());
    }

    if (abs(sensor1.lastV() - SENSOR1_TARGET) > 20) {
      USB.printf("Sensor1 out of range... centering...\n");
      centreMid(sensor1);  
      
      USB.printf("After mid-centering Sensor1: %d/%f\n", mid.getLevel(), sensor1.lastV());
      if (phase != Phase::ZOOM) goto exit;
    }

    USB.printf("Centering Sensor2...\n");
    centreOffset(sensor2);
    USB.printf("After offset centering Sensor2: %d/%f\n", offset.getLevel(), sensor2.lastV());
    if (phase != Phase::ZOOM) goto exit;

    if (gain.getLevel() == CDigiPot::WIPER_MAX) phase = Phase::MEASURE;
  }

exit:
  USB.printf("Exited Zoom phase with gain: %d\n", gain.getLevel());
  flags.zoomLevel = -1; // reset zoom level if we are leaving zoom phase

}