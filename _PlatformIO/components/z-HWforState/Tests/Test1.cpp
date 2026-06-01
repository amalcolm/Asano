#include "HWforState.h"
#include "_HWTools.h"

void HWTools::testMidOffset() {
  
  int s2_preSkew = HW->sensor2.filter(10) - HWParams::SENSOR2_TARGET;
     
  int s2_HILO = s2_preSkew > 0 ? +1 : -1;
  
  HW->offset.offsetLevel(s2_HILO * 4);

  int s2_postOffset = HW->sensor2.filter(10) - HWParams::SENSOR2_TARGET;

  HW->mid.offsetLevel(-s2_HILO * 4);

  int s2_postSkew = HW->sensor2.filter(10) - HWParams::SENSOR2_TARGET;

  int deltaOffset = s2_postOffset - s2_preSkew;
  int deltaSkew   = s2_preSkew   - s2_postSkew;  // opposite direction

  USB.printf("deltaOffset: %d, deltaSkew: %d\n", deltaOffset, deltaSkew);

  HW->offset.offsetLevel(-s2_HILO * 4);
  HW->mid.offsetLevel(s2_HILO * 4);

}
