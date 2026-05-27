#include "HWforState.h"
#include "CMasterTimer.h"

constexpr int GAIN_WINDOW_SIZE = 300;
constexpr int SAMPLES_IN_SENSOR1_LONGREAD = 20;
constexpr int SAMPLES_IN_SENSOR2_LONGREAD = 50;

const double SENSOR1_FILTER_T = 0.01;
const double SENSOR2_FILTER_T = 0.002;

HWforState::HWforState(StateType state) : state(state) {
  static std::tuple<int, int> knownGaps[] = { {2, 107}, {4, 70}, {8, 40}, {12, 28}, {16, 22}, {24, 17} };

  for (const auto& [gap, midStep] : knownGaps)
    if (gap == GAP_TOPBOT) MID_STEP = midStep;

  if (MID_STEP >= CDigiPot::MIDPOINT) ERROR("MID_STEP is too large");

  phase = Phase::SEARCH;
}


void HWforState::_update() {

  if (flags.holdWipers) { _readSensor2(); return; }

  if (sensor1.inZone == false) phase = Phase::SEARCH;

  if (phase == Phase::SEARCH )    _findSignal();
  if (phase == Phase::ZOOM   )    _zoomSignal();
  if (phase == Phase::MEASURE) _measureSignal();
  if (phase == Phase::FOLLOW )  _followSignal();

  _readSensor2();

}


void HWforState::_readSensor2() {  if (Timer.sampleReady) return;

  if (Timer.getStateTime() > 0.001) {
    sensor1.filter(SAMPLES_IN_SENSOR1_LONGREAD, SENSOR1_FILTER_T);
    sensor2.filter(SAMPLES_IN_SENSOR2_LONGREAD, SENSOR2_FILTER_T);
    Timer.sampleReady = true;
    A2D.storeNewData();
  } else {
    sensor1.filter(1, 0.01); // priming filter with early reads
    sensor2.filter(1, 0.01);
  }
}


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

  flags.begun = true;
}


void HWforState::set() {
  if (!Ready) return; else if (!flags.begun) begin();   // ensure ready and begun

  top   .writeCurrentToPot();
  bot   .writeCurrentToPot();
  mid   .writeCurrentToPot();
  offset.writeCurrentToPot();
  gain  .writeCurrentToPot();
}


void HWforState::setWipers(XCMD_SetWipers& cmd) {
  bool holdRequested = cmd.hasFlag(CommandFlags::HoldWipers);

  if (!holdRequested && cmd.top == 0 && cmd.bot == 0) { // release hold
    flags.holdWipers = false;
    return;
  }

  top   .setLevel(cmd.top);
  bot   .setLevel(cmd.bot);
  mid   .setLevel(cmd.mid);
  offset.setLevel(cmd.offset);
  gain  .setLevel(cmd.gain);
}
