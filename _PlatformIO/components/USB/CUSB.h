#pragma once
#include "CSerialWrapper.h"
#include "CrashReport.h"
#include "CBuffer.h"
#include "DataTypes.h"
#include "CMasterTimer.h"
#include "CTelemetry.h"
#include <array>

class CUSB : public CSerialWrapper {
  private:
    static constexpr size_t      READ_BUFFER_SIZE = 1024;  // holds raw bytes read from USB    (read)  (1024 bytes)
    static constexpr size_t  DATATYPE_BUFFER_SIZE =   64;  // holds data for buffer(dataType); (write) (64 * sizeof(DataType) = 1.5KB)
    static constexpr size_t TELEMETRY_BUFFER_SIZE =  128;  // holds pointers to CTelemetry items to write

    CBufferType<DataType>  m_dataBuffer = CBufferType<DataType>(DATATYPE_BUFFER_SIZE);
    BlockType* m_pBlock     = nullptr;  // single block is buffered, (see implementation in CA2D - swapps between two blocks)

    CBufferType<CTelemetry*> m_telemetryBuffer = CBufferType<CTelemetry*>(TELEMETRY_BUFFER_SIZE);  // stores pointers, not actual items

    std::array<uint8_t, READ_BUFFER_SIZE> m_readBuffer;  // temporary buffer for reading raw bytes from USB
    int m_numBuffered = 0;  // number of bytes currently buffered in m_readBuffer

    volatile bool m_debugOutputWaiting = false;

  public:
    CUSB() { m_pDebugToFill = &m_DebugA; m_pDebugToSend = &m_DebugB; };

    CUSB& begin()
    { 
      CSerialWrapper::begin(); 
      return *this;
    }
    
    inline void buffer(DataType    data     ) { m_dataBuffer.write(data); }
    inline void buffer(BlockType*  block    ) { m_pBlock = block; }
    inline void buffer(CTelemetry* telemetry) { m_telemetryBuffer.write(telemetry); }
    inline void buffer(DebugType*  debug    ) { if (debug != m_pDebugToFill) *m_pDebugToFill = *debug; m_debugOutputWaiting = true; }

    DebugType*  getDebugBuffer();
    
    CTeleTimer TT_USBWrite{TeleGroup::USB, 0x0001};
    CTeleTimer TT_USBRead {TeleGroup::USB, 0x0002};
    
    void update() { 
      if (m_skipFlag) { m_skipFlag = false; return; }

      CSerialWrapper::update();

      TT_USBRead.start();
      doRead();
      TT_USBRead.stop();
      TT_USBWrite.start();
      doWrite();
      TT_USBWrite.stop();

    };

    void clearBuffers() {
      m_dataBuffer.clear();
      m_telemetryBuffer.clear();

      m_readBuffer.fill(0);
      m_numBuffered = 0;
    }

    inline void waitForHandshake() {
      while (!m_handshakeComplete) {
        update();
        yield();
      }
    }

    void writeDebugState(StateType state);
    void doWriteDebug();

    inline void setSkipFlag() { m_skipFlag = true; }
    inline bool getSkipFlag() const { return m_skipFlag; }
    inline void clearSkipFlag() { m_skipFlag = false; } 

  private:
    void doRead();
   
    void doWrite();
    void doWriteData();
    void doWriteBlock();
    void doWriteText();
    void doWriteTelemetry();

    DebugType           m_DebugA;
    DebugType           m_DebugB;

    DebugType* volatile m_pDebugToFill;
    DebugType* volatile m_pDebugToSend;

    volatile bool m_skipFlag = false; 
    
};

extern CUSB USB;
