#include "HWforState.h"
#include "_HWTools.h"
#include "DataTypes.h"
#include "Hardware.h"
#include "CUSB.h"
#include <algorithm>

void HWforState::_findSignal() {
  auto& flags = tools.flags;

  static constexpr int MAX_ITERATIONS = 400;
  int midLevel = CDigiPot::MIDPOINT;
  top.setLevel(CDigiPot::WIPER_MAX);
  bot.setLevel(CDigiPot::WIPER_MIN);
  mid.setLevel(midLevel);
  offset.reset(152); // 1.65V 
  gain.reset(32);  // avoid low gain instability in sensor1 for values above 512

  delayMicroseconds(10);

  int wiper = mid.getLevel();
  int Wtop = 255, Wbot = 0;

  while (Wtop - Wbot > HWParams::GAP_TOPBOT*2) {
    if (sensor1.read() < HWParams::SENSOR1_TARGET) {
      Wbot = wiper;
      wiper = (wiper + Wtop) / 2;
    } else {
      Wtop = wiper;
      wiper = (wiper + Wbot) / 2;
    }
    mid.setLevel(wiper);
    delayMicroseconds(10);
  }



  bool signalFound = false;

  int initialHILO = sensor1.read() < HWParams::SENSOR1_TARGET ? -1 : +1;
  int HILO = 0;

  for (int i = 0; top.getLevel() - bot.getLevel() > HWParams::GAP_TOPBOT && i < MAX_ITERATIONS; i++) {

    HILO = (sensor1.read() < HWParams::SENSOR1_TARGET) ? -1 : +1;

    switch (signalFound)
    {
      case false:
        if (HILO == initialHILO)
          mid.offsetLevel( -HILO );
        else
          signalFound = true;
        break;


      case true:  // called once signal is found

        switch (HILO) {
          case -1: top.offsetLevel(-1); break;
          case +1: bot.offsetLevel(+1); break;
        }


        if (mid.getLevel() != midLevel) {

          int delta = mid.getLevel() - midLevel;
          int sign = (delta > 0) - (delta < 0);
          delta = sign * std::clamp(abs(delta) * 1/4, 1, 3);

          mid.offsetLevel( -delta  );  // drag mid to centre
        }
        break;
    }

    delayMicroseconds(5); // signalFound ? 500 : 50 );
  }

  tools.centreMid(sensor1); 
  
  sensor1.resetFilter();
  sensor2.resetFilter();
  phase = Phase::ZOOM;

  flags.zoomLevel = -1; // reset zoom level for next phase
}