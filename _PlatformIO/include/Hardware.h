#pragma once
#include "SPI.h"

struct Hardware {
  public:
    inline static SPISettings SPIsettings{4800000, MSBFIRST, SPI_MODE1};

    static void begin();

    static bool canUpdate();
    static void update();

    static bool noiseSampleTest();

  private:
    inline static bool firstCallInCycle = true;
};
