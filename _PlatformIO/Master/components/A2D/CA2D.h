#pragma once
#include <SPI.h>
#include "DataTypes.h"
#include "C32bitTimer.h"
#include "CRunningAverage.h"
class CA2D {
  public:
    enum ModeType { UNSET, CONTINUOUS, TRIGGERED };

    enum TeleKind { COUNT = 0, TIME = 1, VOLTAGE = 2, RAW = 3 };
    
    enum ReadState { IDLE, PREPARE, READ };

    SPISettings spiSettings{4'800'000, MSBFIRST, SPI_MODE1};

    static inline C32bitTimer spiTimer = C32bitTimer::From_uS(2).setPeriodic(true);


    int m_pinDataReady{9};
    volatile bool outputDebugBlock = false;

  public:
    CA2D();
  
    void      begin();

    bool      poll();

    bool      storeNewData();


    void      waitForNextDataReady();

    void      swapBlocks(StateType state);


    inline void      setReadState(ReadState state) { m_ReadState = state; }
    inline ReadState getReadState()          const { return m_ReadState;  }  
    inline ModeType  getMode()               const { return m_mode;       }    
    
    inline bool tryAddEvent(const enum EventKind kind, double time = -1.0) { return m_pBlockToFill->tryAddEvent(kind, time); }
    inline double getPollDuration() const { return m_raPollDuration.getAverage(); }
    void   read24bitData();

  private:
    void      configure_ADS1299();
    DataType  readADS1299(DataType &data);
    void      init_DMA();

    ModeType            m_mode       = ModeType::UNSET;
    ReadState           m_ReadState  = ReadState::PREPARE;

    static void ISR_Data();
    
    // DMA SPI handling
    static inline EventResponder s_spiEvent{};
    static void onSpiDmaComplete(EventResponderRef);
    static inline volatile bool s_dmaActive = false;        // true while DMA SPI in progress
    
    uint8_t getConfig1() const;

    volatile bool       m_dataReady = false;
    volatile uint32_t   m_lastDataTime = 0;
    double              m_dataStateTime = 0.0;
    BlockType           m_BlockA;
    BlockType           m_BlockB;

    BlockType* volatile m_pBlockToFill;
    BlockType* volatile m_pBlockToSend;

    void SPIwrite(std::initializer_list<uint8_t> data);
    CRunningAverage<double> m_raPollDuration;
}; 

    // buffers for DMA SPI transfers - must be 32-byte aligned for cache management on Teensy 4.x
extern uint8_t m_rxBuffer[32];
extern uint8_t m_txBuffer[32];
extern uint8_t m_frBuffer[32];