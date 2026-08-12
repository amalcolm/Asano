#include "HWforState.h"
#include "_HWTools.h"

void HWforState::begin() {
  top    .invert();
  bot    .invert();
  sensor1.invert();
  gain   .invert();
  offset .invert();

  top    .begin(255);
  bot    .begin(  0);
  mid    .begin(128);

  offset .begin(128);
  gain   .begin(  0);

  sensor1.begin();
  sensor2.begin();

  tools.flags.begun = true;
}



void HWforState::set() {
  if (!Ready) return; else if (tools.flags.begun == false) begin();   // ensure ready and begun

  top   .writeCurrentToPot();
  bot   .writeCurrentToPot();
  mid   .writeCurrentToPot();
  offset.writeCurrentToPot();
  gain  .writeCurrentToPot();
}
