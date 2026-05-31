#include "HWforState.h"
#include "C32bitTimer.h"
#include "CA2D.h"
static constexpr int    primeSamples = 20;
static constexpr int    fineSamples  = 800;
static const     double primeT = 1.0 - pow(0.05, 1.0 / primeSamples); // 95% settled
static const     double fineT  = 1.0 - pow(0.05, 1.0 / fineSamples); 

void HWforState::_measureSignal() {
  readCheck(); if (phase != Phase::MEASURE) return; // check if signal is lost before attempting to measure
/*
//  if (measureTimer.waiting()) return;

  uint16_t v = sensor2.read();
//  float vMid = sensor2.filter(SAMEPLE_SIZE, FILTER_T);

  int direction = (v < SENSOR2_TARGET) ? +5 : -5;

  mid.offsetLevel(direction);
  delayMicroseconds(50);

  sensor2.resetFilter();

  for (int i = 1; i < primeSamples; i++) {
    delayMicroseconds(CFG::A2D_READING_PERIOD_uS);
    sensor2.filter(1);
  }

  float vFinal = sensor2.filter(fineSamples);

  mid.offsetLevel(-direction);
  delayMicroseconds(50);

  USB.printf("Measured difference: %.2f\n", vFinal);
*/

  phase = Phase::FOLLOW;

}