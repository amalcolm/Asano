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
  static constexpr double MINIMUM_TIME_LEFT = 0.001; // 1 ms, don't start a read if less than this time is left in the state
  static constexpr double MINIMUM_READ_TIME = 0.000'1; // 0.1 ms

  static constexpr double MIN_FINALSAMPLE_TIME = STATE_DURATION - MINIMUM_TIME_LEFT - MINIMUM_READ_TIME;

  static constexpr int MAXIMUM_SHORT_READS = 6;

  static int shortReadCount = 0;
   

  static double read_duration = 16.667 * 0.000'001;
  
  if (Timer.getStateTime() < MIN_FINALSAMPLE_TIME && shortReadCount < MAXIMUM_SHORT_READS) {
    sensor1.read(1); // priming filter with early reads
    sensor2.read(1);
    shortReadCount++;
    return;
  }
  shortReadCount = 0; // reset short read count for next state

  

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
