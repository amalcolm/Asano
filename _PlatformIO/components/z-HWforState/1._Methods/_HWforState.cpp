#include "HWforState.h"
#include "_HWTools.h"
#include "CMasterTimer.h"

constexpr int GAIN_WINDOW_SIZE = 300;
constexpr int SAMPLES_IN_SENSOR1_LONGREAD = 20;
constexpr int SAMPLES_IN_SENSOR2_LONGREAD = 50;

const double SENSOR1_FILTER_T = 0.01;
const double SENSOR2_FILTER_T = 0.002;

HWforState::HWforState(StateType state)
  : state(state),
    ownedTools(std::make_unique<HWTools>(*this)),
    tools(*ownedTools)
{
   phase = Phase::SEARCH;
}

HWforState::~HWforState() = default; 

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
