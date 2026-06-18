#include "HWforState.h"
#include "_HWTools.h"
#include "CNoiseSample.h"
#include "Setup.h"
#include "CUSB.h"
#include "CTelemetry.h"

bool HWTools::testGetNoiseSample() {
  static constexpr int    readPeriod_uS =   20;  // (uS)  analogRead takes 16.67 uS
  static constexpr double readPeriod    = readPeriod_uS * 0.000'001; // convert to seconds
  static constexpr double stateDuration = CFG::STATE_DURATION_uS * 0.000'001; // convert to seconds

  double timeLeft = stateDuration - Timer.getStateTime();

  int numSamples = timeLeft / readPeriod;
  if (numSamples <= 0) return false;


  DebugType* dbg = USB.getDebugBuffer();  if (dbg == nullptr) return false;

  dbg->count = numSamples;
  FillBufferWithNoise(dbg->data, dbg->count, SP.Sensor2, readPeriod, Timer.getStateTime());
  USB.buffer(dbg);
  USB.suppressNextDataOutput();
  CTelemetry::suppressNextLog();

  return true;
}
