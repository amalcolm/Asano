#include "C3Pot.h"
#include "CTelemetry.h"
#include "C32bitTimer.h"
#include "CUSB.h"
#include "CBuffer.h"
#include <tuple>
#include "CMasterTimer.h"

C3Pot::C3Pot(int csPinTop, int csPinBot, int csPinMid, int sensorPin) 
      : CDigiPot(csPinMid, sensorPin, 1)  // pas CSmid to CAutoPot constructor
      , top(csPinTop), bot(csPinBot)
      , mid(static_cast<CDigiPot&>(*this)) {

  for (int i = 0; i < HISTORY_SIZE; ++i)
    history[i] = state;

  phase = Phase::SEARCH;
}

double C3Pot::midVoltage(int topLevel, int botLevel, int midLevel) {
  const double totalResistance = POWERED_DIGIPOT_SUPPLY_RESISTANCE
    + POWERED_DIGIPOT_RESISTANCE
    + POWERED_DIGIPOT_GROUND_RESISTANCE;
  const double current = POWERED_DIGIPOT_SUPPLY_VOLTAGE / totalResistance;
  const double poweredBottomVoltage = current * POWERED_DIGIPOT_GROUND_RESISTANCE;
  const double poweredTopVoltage = poweredBottomVoltage + current * POWERED_DIGIPOT_RESISTANCE;
  const double poweredVoltageRange = poweredTopVoltage - poweredBottomVoltage;
  const double topVoltage = poweredBottomVoltage
    + (topLevel / POWERED_DIGIPOT_WIPER_MAX) * poweredVoltageRange;
  const double botVoltage = poweredBottomVoltage
    + (botLevel / POWERED_DIGIPOT_WIPER_MAX) * poweredVoltageRange;

  return botVoltage
    + (midLevel / POWERED_DIGIPOT_WIPER_MAX) * (topVoltage - botVoltage);
}

void C3Pot::update() {

  for (int i = HISTORY_SIZE - 1; i > 0; --i) history[i] = history[i - 1];
  history[0] = state;

  readSensor(); _updateZone();

  switch (phase) {
    case Phase::SEARCH: findSignal(); break;
    case Phase::NORMAL: fineTuning(); break;
    default: break;
  }

  state.phase    = phase;
  state.sensor   = lastSensorValue();
  state.topLevel = top.getLevel();
  state.botLevel = bot.getLevel();
  state.midLevel = mid.getLevel();

};

void C3Pot::printDebug(bool signalFound) {
     int zoneValue = (zone == Zone::Low) ? 200 : (zone == Zone::High) ? 254 : 225;
 
    USB.printf("signal:%d\tzone:%d\tsensor:%d\ttop:%d\tbot:%d\tmid:%d\tmin:0\tmax:256\n",
       signalFound ? 199 : 150, zoneValue, lastSensorValue()/4, top.getLevel(), bot.getLevel(), mid.getLevel());

}
