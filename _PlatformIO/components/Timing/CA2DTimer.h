#pragma once
#include "C32bitTimer.h"
#include "CTimerBase.h"
class CA2DTimer : public C32bitTimer {
  public:
    CA2DTimer();

//    void reset(uint32_t start, uint32_t period);

    void sync() const override;

    void setDataReady(uint32_t tick);

    inline uint32_t getLastDataReadyTick()   const { return m_dataReadyTick;   }
    inline uint32_t getLastDataReadyPeriod() const { return m_dataReadyPeriod; }



  private:
    uint32_t m_dataReadyTick = 0;
    uint32_t m_dataReadyPeriod = 0;
    uint32_t m_dataReadyNextTick = 0;

};