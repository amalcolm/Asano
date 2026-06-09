#include "HWforState.h"
#include "_HWTools.h"
#include "CNoiseSample.h"
#include "Setup.h"
#include "CUSB.h"
#include "CTelemetry.h"

bool HWTools::testGetNoiseSample() {
  static constexpr int readPeriod_uS =   20;  // (uS)  analogRead takes 16.67 uS
  static constexpr int totalTime_uS  = 4000;  // (uS)

  static constexpr int numSamples = totalTime_uS / readPeriod_uS;
  static constexpr double period = readPeriod_uS * 0.000'001; // convert to seconds
  
  DebugType* dbg = USB.getDebugBuffer();  if (dbg == nullptr) return false;

  dbg->count = numSamples;
  FillBufferWithNoise(dbg->data, dbg->count, SP.Sensor1, period); // fill using 20uS period
  USB.buffer(dbg);
  USB.suppressNextDataOutput();
  CTelemetry::suppressNextLog();

  return true;
}
