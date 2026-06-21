#include "HWforState.h"
#include "_HWTools.h"
#include "CNoiseSample.h"
#include "Setup.h"
#include "CUSB.h"
#include "CTelemetry.h"

bool HWTools::testGetNoiseSample() {
  static constexpr int    idealReadPeriod_uS =   20;  // (uS)  analogRead takes 16.67 uS
  static constexpr double idealReadPeriod    = idealReadPeriod_uS * 0.000'001; // convert to seconds
  static constexpr uint32_t maxSamples = RawSignalType::MAX_SAMPLES;

  static constexpr double desiredDuration = CFG::STATE_DURATION_uS * 0.000'001; // seconds

  double timeLeft = desiredDuration - Timer.getStateTime() - 0.000'050; // subtract 50 uS for overhead
  if (timeLeft <= 0) return false;
  
  double readPeriod = idealReadPeriod;
  uint32_t numSamples = static_cast<uint32_t>(timeLeft / readPeriod);
  if (numSamples > maxSamples) {
    numSamples = maxSamples;
    readPeriod = timeLeft / maxSamples;
  }

  if (numSamples <= 0) return false;

  RawSignalType* signal = USB.getRawSignalBuffer();  if (signal == nullptr) return false;

  signal->count = numSamples;
  FillBufferWithNoise(signal->data, signal->count, SP.Sensor2, readPeriod, Timer.getStateTime());
  USB.buffer(signal);

  return true;
}
