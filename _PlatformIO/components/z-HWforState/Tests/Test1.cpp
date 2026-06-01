#include "HWforState.h"
#include "_HWTools.h"

void HWTools::testMidOffset() {
  
  double _t = hw.sensor2.getT();
  hw.sensor2.setT(0.01);
  double s2_preSkew = hw.sensor2.read(10) - HWParams::SENSOR2_TARGET;
     
  int s2_HILO = s2_preSkew > 0 ? +1 : -1;
  
  hw.offset.offsetLevel(s2_HILO * 4);

  double s2_postOffset = hw.sensor2.read(10) - HWParams::SENSOR2_TARGET;

  hw.mid.offsetLevel(-s2_HILO * 4);

  double s2_postSkew = hw.sensor2.read(10) - HWParams::SENSOR2_TARGET;

  double deltaOffset = s2_postOffset - s2_preSkew;
  double deltaSkew   = s2_preSkew   - s2_postSkew;  // opposite direction

  USB.printf("deltaOffset: %f, deltaSkew: %f\n", deltaOffset, deltaSkew);

  hw.offset.offsetLevel(-s2_HILO * 4);
  hw.mid.offsetLevel(s2_HILO * 4);

  hw.sensor2.setT(_t);
}
