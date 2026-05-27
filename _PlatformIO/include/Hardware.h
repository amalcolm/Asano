#pragma once
#include "SPI.h"

struct Hardware {
  public:
    inline static SPISettings SPIsettings{4800000, MSBFIRST, SPI_MODE1};

    static void begin();

    static bool canUpdate();
    static void update();
    static void offPeriod();


  private:
    static bool debugLayerOverride();
    inline static bool firstCallInCycle = true;
};
