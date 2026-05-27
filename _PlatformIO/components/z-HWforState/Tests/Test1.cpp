#include "HWforState.h"

void HWforState::testMidOffset() {
  
  int s2_preSkew = sensor2.filter(10) - SENSOR2_TARGET;
     
  int s2_HILO = s2_preSkew > 0 ? +1 : -1;
  
  offset.offsetLevel(s2_HILO * 4);

  int s2_postOffset = sensor2.filter(10) - SENSOR2_TARGET;

  mid.offsetLevel(-s2_HILO * 4);

  int s2_postSkew = sensor2.filter(10) - SENSOR2_TARGET;

  int deltaOffset = s2_postOffset - s2_preSkew;
  int deltaSkew   = s2_preSkew   - s2_postSkew;  // opposite direction

  USB.printf("deltaOffset: %d, deltaSkew: %d\n", deltaOffset, deltaSkew);

  offset.offsetLevel(-s2_HILO * 4);
  mid.offsetLevel(s2_HILO * 4);

}
