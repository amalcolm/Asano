#include "_HWTools.h"
#include "HWforState.h"
#include "CCircuit.h"
#include <algorithm>
#include <cmath>


void HWTools::adjustTopBot() {

  int currentMid = hw.mid.getLevel();

  int direction = (currentMid < HWParams::SAFE_MIN_WIPER_LEVEL) ? -1 
                : (currentMid > HWParams::SAFE_MAX_WIPER_LEVEL) ? +1
                 : 0;
  if (direction == 0)
    return;
  

  int currentTop = hw.top.getLevel();
  int currentBot = hw.bot.getLevel();

  double targetVoltage = circuit.midVoltageVolts(currentTop, currentBot, currentMid);

  int candidateTop = currentTop + direction; if (candidateTop > CDigiPot::WIPER_MAX) return;
  int candidateBot = currentBot + direction; if (candidateBot < CDigiPot::WIPER_MIN) return;

  int candidateMid = circuit.bestMidForVoltage(candidateTop, candidateBot, targetVoltage);

  hw.top.setLevel(candidateTop);
  hw.bot.setLevel(candidateBot);
  hw.mid.setLevel(candidateMid);
  delayMicroseconds(10);
}
