#include "CCircuit.h"
#include "CDiffAmp.h"
#include "C3Pot.h"
#include "Helpers.h"
#include "HWforState.h"

namespace {
  constexpr double MID_STEP_PIVOT_MID_VOLTAGE = 0.230970864519694;
  constexpr double MID_STEP_PIVOT_SENSOR1_EST = 0.502983620865305;
  constexpr double MIN_MID_STEP_DENOMINATOR = 1e-12;

  uint8_t clampWiper(int value) {
    if (value < 0) return 0;
    if (value > 255) return 255;
    return static_cast<uint8_t>(value);
  }
}

CCircuit::CCircuit() :
  ptr_DiffAmp(new CDiffAmp()),
  _DA(*ptr_DiffAmp),

  ptr_3Pot(new C3Pot()),
  _3Pot(*ptr_3Pot)

{};

CCircuit::~CCircuit() {
  delete ptr_DiffAmp; ptr_DiffAmp = nullptr;
  delete ptr_3Pot; ptr_3Pot = nullptr;
}

double CCircuit::midVoltageFromMid() const {
  return midVoltage(HW->top.getLevel(), HW->bot.getLevel(), HW->mid.getLevel());
}

double CCircuit::midVoltage(int top, int bot, int mid) const {
  return midVoltageVolts(top, bot, mid) * CDiffAmp::SENSOR_SCALAR;
}

double CCircuit::midVoltageVolts(int top, int bot, int mid) const {
  return _3Pot.getMidVoltage(clampWiper(mid), clampWiper(top), clampWiper(bot));
}

double CCircuit::sensor2DeltaFromOffsetDelta(int offsetDelta) const {
  return _DA.sensor2DeltaFromOffsetDelta(offsetDelta, clampWiper(HW->gain.getLevel()));
}

double CCircuit::sensor2DeltaFromMidDelta(int midDelta, double sensor2) const {
  if (sensor2 < 0.0)
    return 0.0;

  const int top = HW->top.getLevel();
  const int bot = HW->bot.getLevel();
  const int mid = HW->mid.getLevel();
  const uint8_t gain = clampWiper(HW->gain.getLevel());
  const uint8_t offset = clampWiper(HW->offset.getLevel());

  const double midVoltageNow = midVoltageVolts(top, bot, mid);
  const double nextMidVoltage = midVoltageVolts(top, bot, mid + midDelta);
  const double deltaMidVoltage = nextMidVoltage - midVoltageNow;
 
  const double diffAmpMultiplier = _DA.multiplier(gain);
  const double sensor1EstNow = _DA.sensor1VoltageFromSensor2(sensor2, gain, offset);

  const double denominator = MID_STEP_PIVOT_MID_VOLTAGE - midVoltageNow;

  if (denominator > -MIN_MID_STEP_DENOMINATOR && denominator < MIN_MID_STEP_DENOMINATOR)
    ERROR("Denominator for gain calculation is too small, cannot compute deltaSensor2FromDeltaMid");

  const double lightGain = (sensor1EstNow - MID_STEP_PIVOT_SENSOR1_EST) / denominator;
  const double deltaSensor2Voltage = diffAmpMultiplier * lightGain * deltaMidVoltage;

  return deltaSensor2Voltage * CDiffAmp::SENSOR_SCALAR;
}
