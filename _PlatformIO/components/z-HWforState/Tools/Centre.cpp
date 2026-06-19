#include "_HWTools.h"
#include "HWforState.h"

void HWTools::centre(CSensor& sensor, CDigiPot& pot) {
  constexpr int MAX_ITERATIONS = 100;
  HWforState::Phase currentPhase = hw.getPhase();


  bool useSensor2 = sensor.getPin() == hw.sensor2.getPin(); 
  uint16_t target = useSensor2 ? HWParams::SENSOR2_TARGET : HWParams::SENSOR1_TARGET;
  int16_t v;

  if (useSensor2) {
    v = readCheck(); if (hw.getPhase() != currentPhase) return;  // check if signal is lost 
  } else {
    v = sensor.read();
  }

  int16_t delta = v - target;
  int16_t lastDelta = delta;
  int     direction = delta < 0 ? +1 : -1;

  for (int iterations = 0; iterations < MAX_ITERATIONS; ++iterations) {
    lastDelta = delta;

    pot.changeBy(direction);
    delayMicroseconds(5); 

    if (useSensor2) {
      v = readCheck(); if (hw.getPhase() != currentPhase) return;  // check if signal is lost
    } else {
      v = sensor.read();
    }

    delta = v - target;
    int16_t HILO = (delta < 0) ? +1 : -1;

    if (HILO != direction) break; // if it crossed the target, stop
  }

  if (abs(lastDelta) < abs(delta)) {
    pot.changeBy(-direction); // revert if it made it worse
    delayMicroseconds(5);
    if (useSensor2) {
      readCheck(); // final check if signal is lost after adjustment
    } else {
      sensor.read();
    }
  }
}