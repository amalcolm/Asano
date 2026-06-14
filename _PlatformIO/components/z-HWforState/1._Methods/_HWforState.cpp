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
  static constexpr double STATE_DURATION = CFG::STATE_DURATION_uS * 0.000'001; // convert to seconds
  static constexpr double MINIMUM_READ_TIME = 0.000'1; // 0.1 ms
  static double read_duration = 16.667 * 0.000'001;
  
  if (Timer.getStateTime() < 0.001) {
    sensor1.read(1); // priming filter with early reads
    sensor2.read(1);
    return;
  }

  

  double timeLeftInState = STATE_DURATION - Timer.getStateTime();
  if (timeLeftInState < MINIMUM_READ_TIME) return;


  double availableTime = timeLeftInState * 0.9;
  int readsPossible = static_cast<int>(std::floor(availableTime / read_duration));

  int sensor1Reads = readsPossible / 4;
  int sensor2Reads = readsPossible - sensor1Reads;

  double now = Timer.getStateTime();
  sensor1.read(sensor1Reads);
  sensor2.read(sensor2Reads);
  double timeTaken = Timer.getStateTime() - now;

  double actualReadDuration = timeTaken / readsPossible;

  const double t = 0.01;

  read_duration = (1 - t) * read_duration + t * actualReadDuration;


  Timer.sampleReady = true;
  A2D.storeNewData();
}
