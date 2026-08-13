#include "_HWTools.h"
#include "HWforState.h"
#include "CCircuit.h"
#include <algorithm>
#include <cmath>


namespace {
  constexpr int MID_STEP = 67;
  constexpr int OFFSET_STEP = 1;

  constexpr int ADJUST_TOP_BOT_SAMPLES = 12;

  uint8_t clampWiper(int value) {
    return static_cast<uint8_t>(std::clamp(value, CDigiPot::WIPER_MIN, CDigiPot::WIPER_MAX));
  }
}


void HWTools::adjustTopBot() {

  int currentMid = hw.mid.getLevel();

  int direction = (currentMid < HWParams::SAFE_MIN_WIPER_LEVEL) ? +1 
                : (currentMid > HWParams::SAFE_MAX_WIPER_LEVEL) ? -1
                 : 0;
  if (direction == 0)
    return;
  

  int currentTop = hw.top   .getLevel();
  int currentBot = hw.bot   .getLevel();
  double oldValue = hw.sensor2.read(ADJUST_TOP_BOT_SAMPLES);

  //int currentOff = hw.offset.getLevel();




  int candidateTop = currentTop + direction; if (candidateTop > CDigiPot::WIPER_MAX) return;
  int candidateBot = currentBot + direction; if (candidateBot < CDigiPot::WIPER_MIN) return;

//  double targetVoltage = circuit.midVoltageVolts(currentTop, currentBot, currentMid);
//  int candidateMid = circuit.bestMidForVoltage(candidateTop, candidateBot, targetVoltage);
  int candidateMid = currentMid + direction * MID_STEP;
//  int candidateOff = currentOff + direction * OFFSET_STEP;



  hw.top   .setLevel(candidateTop);
  hw.bot   .setLevel(candidateBot);
  hw.mid   .setLevel(clampWiper(candidateMid));
//  hw.offset.setLevel(clampWiper(candidateOff));
  delayMicroseconds(10);

  double newValue = hw.sensor2.read(ADJUST_TOP_BOT_SAMPLES);

  double difference = newValue - oldValue;

  hw.compensateSensor2(difference);

  if (CFG::getDebugMode() == CFG::DebugMode::SINGLE_STATE)
    USB.printf("adjustTopBot: sensor2 difference: %.2lf\n", difference);

 // USB.printf("AdjustTopBot: currentMid=%d, targetV=%.2f, candidateTop=%d, candidateBot=%d, candidateMid=%d\n", 
 //   currentMid, targetVoltage, candidateTop, candidateBot, candidateMid);

}
