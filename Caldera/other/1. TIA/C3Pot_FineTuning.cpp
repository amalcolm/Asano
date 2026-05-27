#include "C3Pot.h"
#include "CUSB.h"

void C3Pot::fineTuning() {
  static constexpr int SENSOR_DEADBAND = 100;
  static constexpr int SENSOR_LOW      = CAutoPot::SENSOR_MIDPOINT - SENSOR_DEADBAND/2;
  static constexpr int SENSOR_HIGH     = CAutoPot::SENSOR_MIDPOINT + SENSOR_DEADBAND/2;

  static constexpr int MID_STEP = 150;

  static constexpr int WIPER_LOW  = (CAutoPot::POT_MIDPOINT - MID_STEP/2) / 2;
  static constexpr int WIPER_HIGH = 255 - WIPER_LOW;


  if (zone != Zone::inZone) { inZone = false; phase = Phase::SEARCH; return; }

  int direction = 0;
  int wiperLevel = mid.getLevel();

  if (wiperLevel < WIPER_LOW ) direction = +1;
  else
  if (wiperLevel > WIPER_HIGH) direction = -1;

  if (direction != 0) {
    top.offsetLevel(direction);
    bot.offsetLevel(direction);
    mid.offsetLevel(direction * MID_STEP);
    return;
  }

  
  int sensorValue = lastSensorValue();

  if (sensorValue < SENSOR_LOW ) mid.offsetLevel(+1);
  else  
  if (sensorValue > SENSOR_HIGH) mid.offsetLevel(-1);
  else
    inZone = true;
  
}