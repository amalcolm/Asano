#pragma once

#include "CA2D.h"
#include "CTelemetry.h"
#include "CBuffer.h"
#include <array>

class CSerialWrapper {
  public:
    static const unsigned long USB_BAUDRATE = 57600 * 16;
  
    enum ModeType { UNSET = 0, INITIALISING = 1, TEXT = 2, RAWDATA = 3, BLOCKDATA = 4, placeholder = 5 };
    static const uint32_t NUM_MODETYPES = ModeType::placeholder;
    
    static const uint32_t FRAMING_MASK = ModeType::RAWDATA | ModeType::BLOCKDATA;
    static const uint32_t PRINTF_BUFFER_SIZE = 256;
    static const uint32_t FRAMING_SIZE = 4;

    CSerialWrapper();
    virtual ~CSerialWrapper() = default;

    virtual CSerialWrapper& begin();
    virtual void update();

    inline ModeType getMode() { return m_Mode; }
           ModeType setMode(ModeType mode);

    inline bool isHandshakeComplete() const { return m_handshakeComplete; }
    
    void doHandshake();
    void writeHandshakeResponse();

    void printf(const char *pFMT, ...);
    
    void write(int32_t  number);
    void write(uint8_t  byte  );
    void write(uint16_t data  );
    void write(uint32_t data  );
    void write(uint64_t data  );
    void write(float    data  );
    void write(double   number);
    void write(uint8_t* pData, uint32_t dataLen);

    
    static void SendCrashReport(CrashReportClass& pReport);
    
  private:
    ModeType m_Mode = ModeType::UNSET;
   
  protected:
    bool m_handshakeComplete = false;

    void put(uint8_t* pData, uint32_t dataLen);
      
};
