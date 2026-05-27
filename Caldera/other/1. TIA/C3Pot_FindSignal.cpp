#include "C3Pot.h"
#include "DataTypes.h"
#include "Hardware.h"
#include "CUSB.h"

void C3Pot::findSignal()
{
  static constexpr int MAX_ITERATIONS = 100;
  top.setLevel(DIGIPOT_MAX_FOR_PHOTODIODE);
  bot.setLevel(CAutoPot::POT_MIN);
  mid.setLevel(CAutoPot::POT_MIDPOINT);

  delayMicroseconds(10);

  bool signalFound = false;

  int initialHILO = readSensor() < CAutoPot::SENSOR_MIDPOINT ? -1 : +1;
  int HILO = 0;

  for (int i = 0; top.getLevel() - bot.getLevel() > GAP_NORMAL && i < MAX_ITERATIONS; i++) {

    HILO = (readSensor() < CAutoPot::SENSOR_MIDPOINT) ? -1 : +1;

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

        if (mid.getLevel() != CAutoPot::POT_MIDPOINT) {

          int delta = mid.getLevel() - CAutoPot::POT_MIDPOINT;
          int sign = (delta > 0) - (delta < 0);
          delta = sign * std::clamp(abs(delta) * 1/4, 1, 3);

          mid.offsetLevel( -delta  );  // drag mid to centre
        }
        break;
    }

    delayMicroseconds(5); // signalFound ? 500 : 50 );
  }

  initialHILO = readSensor() < CAutoPot::SENSOR_MIDPOINT ? -1 : +1;
  double lastDelta = 0, delta = 0;
  
  for (int i = 0; i < MAX_ITERATIONS; i++) { 
    lastDelta = delta;
    readSensor();
    
    delta = abs(lastSensorValue() - CAutoPot::SENSOR_MIDPOINT);
    HILO = (lastSensorValue() < CAutoPot::SENSOR_MIDPOINT) ? -1 : +1;

    if (HILO != initialHILO)
      break;

    mid.offsetLevel( -HILO );
    delayMicroseconds(5);
  }

  if (delta < lastDelta)  // if we just crossed over the optimal point, step back
  { 
    mid.offsetLevel( +HILO );
    delayMicroseconds(5);
    readSensor();
  }

  phase = Phase::NORMAL;
}