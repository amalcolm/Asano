#include "HWforState.h"


void HWforState::adjustTopBot() {
 
  int WIPER_LOW  = CDigiPot::MIDPOINT - MID_STEP;
  int WIPER_HIGH = CDigiPot::MIDPOINT + MID_STEP;


  int direction = 0;
  int wiperLevel = mid.getLevel();

  if (wiperLevel < WIPER_LOW ) direction = +1;
  else
  if (wiperLevel > WIPER_HIGH) direction = -1;

  if (direction != 0) {
    top.offsetLevel(direction);
    bot.offsetLevel(direction);
    mid.offsetLevel(direction * MID_STEP);
    delayMicroseconds(10);
  }

}


int16_t HWforState::readCheck() {

  uint16_t s2 = sensor2.read();
  if (sensor2.inZone == false) {
    phase = Phase::SEARCH;
  }
  return static_cast<int16_t>(s2);
}

void HWforState::centre(CSensor& sensor, CDigiPot& pot) {
  constexpr int MAX_ITERATIONS = 100;
  Phase currentPhase = phase;


  bool useSensor2 = sensor.getPin() == sensor2.getPin(); 
  uint16_t target = useSensor2 ? SENSOR2_TARGET : SENSOR1_TARGET;
  int16_t v;

  if (useSensor2) {
    v = readCheck(); if (phase != currentPhase) return;  // check if signal is lost 
  } else {
    v = sensor.read();
  }

  int16_t delta = v - target;
  int16_t lastDelta = delta;
  int     direction = delta < 0 ? +1 : -1;

  for (int iterations = 0; iterations < MAX_ITERATIONS; ++iterations) {
    lastDelta = delta;

    pot.offsetLevel(direction);
    delayMicroseconds(5); 

    if (useSensor2) {
      v = readCheck(); if (phase != currentPhase) return;  // check if signal is lost
    } else {
      v = sensor.read();
    }

    delta = v - target;
    int16_t HILO = (delta < 0) ? +1 : -1;

    if (HILO != direction) break; // if it crossed the target, stop
  }

  if (abs(lastDelta) < abs(delta)) {
    pot.offsetLevel(-direction); // revert if it made it worse
    delayMicroseconds(5);
    if (useSensor2) {
      readCheck(); // final check if signal is lost after adjustment
    } else {
      sensor.read();
    }
  }
}