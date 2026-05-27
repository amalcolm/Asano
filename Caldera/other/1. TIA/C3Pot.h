#pragma once
#include "CAutoPot.h"

class C3Pot : public CDigiPot {

  public:
    enum class Phase { SEARCH = 0, NORMAL = 1, placeholder = 255} phase = Phase::placeholder;

    static constexpr int DIGIPOT_MAX_FOR_PHOTODIODE = 48; // Photodiode has max of 0.6v whereas pots have max of 3.3v, hence max for top is (CAutoPot::POT_MAX * 0.6 / 3.3); around 48;

    static constexpr int HISTORY_SIZE = 4;
    static constexpr int GAP_NORMAL   = 4;

    C3Pot(int csPinTop, int csPinBot, int csPinMid, int sensorPin);

    CDigiPot  top;
    CDigiPot  bot;
    CDigiPot& mid; // also the CAutoPot instance

    bool inZone = false;

    struct State {
      Phase       phase = Phase::placeholder;
      uint16_t   sensor = 0;
      int      topLevel = 0;
      int      botLevel = 0;
      int      midLevel = 0;
    } state{};

    State history[HISTORY_SIZE]{}; // history[0] = newest
    
    void begin(int initialLevel = 128) {
      top.invert();
      bot.invert();
      mid.invertSensor();

      top.begin(DIGIPOT_MAX_FOR_PHOTODIODE);
      bot.begin(CAutoPot::POT_MIN);
      mid.begin(initialLevel);
    }

    void update();

    void findSignal(); 
    void fineTuning();

    inline void set() {
      top.writeCurrentToPot();
      bot.writeCurrentToPot();
      CDigiPot::writeCurrentToPot();
    }

    void printDebug(bool signalFound);
};
