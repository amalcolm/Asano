#include "HWforState.h"
#include "_HWTools.h"
#include "CMasterTimer.h"



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
    sensor1.read(HWParams::SAMPLES_IN_SENSOR1_LONGREAD);
    sensor2.read(HWParams::SAMPLES_IN_SENSOR2_LONGREAD);
    Timer.sampleReady = true;
    A2D.storeNewData();
  } else {
    sensor1.read(1); // priming filter with early reads
    sensor2.read(1);
  }
}
