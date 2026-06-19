#include "CUSB.h"
#include "CA2D.h"
#include "Setup.h"
#include "CHead.h"
#include "CTelemetry.h"


void CUSB::doWrite() {
  // Write data based on current mode
  switch (getMode())
  {
    case CSerialWrapper::ModeType::RAWDATA:   doWriteData();  break;
    case CSerialWrapper::ModeType::BLOCKDATA: doWriteBlock(); break;
    case CSerialWrapper::ModeType::TEXT:      doWriteText();  break;
    default: break;
  }

  // Always write (and clear) any buffered telemetry
  doWriteTelemetry();

  doWriteDebug();

}

// Sends all buffered DataType items over USB
void CUSB::doWriteData() {
  while (m_dataBuffer.isEmpty() == false) {//  if (firstOut == 0) firstOut = m_buffer[readIndex].timestamp;

    DataType* pData = m_dataBuffer.read();

    if (pData == nullptr) break;
    
    if (m_handshakeComplete)
      pData->writeSerial();
    else
      pData->debugSerial();
  }
}



// Sends the buffered BlockType over USB
void CUSB::doWriteBlock() {
  if (m_pBlock == NULL) return;
  
  if (m_handshakeComplete)
    m_pBlock->writeSerial();
  else
    if (A2D.outputDebugBlock)
      m_pBlock->debugSerial();

  m_pBlock = NULL;
}


// if in TEXT mode, output the debugSerial of block
void CUSB::doWriteText() {
  if (m_pBlock == NULL) return;
    m_pBlock->debugSerial();

  m_pBlock = NULL;
}


// Sends all buffered Telemetry items over USB
void CUSB::doWriteTelemetry() {

  while (m_telemetryBuffer.isEmpty() == false) {
      CTelemetry** telemetry = m_telemetryBuffer.read();
      if (telemetry == nullptr) break;

      if (m_handshakeComplete)
          (*telemetry)->writeSerial();
        
      CTelemetry::Return(*telemetry);
  }
}


DebugType* CUSB::getDebugBuffer() { if (m_debugOutputWaiting) return nullptr;
  m_pDebugToFill->state = Head.getState();
  m_pDebugToFill->timestamp = Timer.getConnectTime();
  return m_pDebugToFill;
}

void CUSB::doWriteDebug() {
  if (m_debugOutputWaiting == false) return;

  noInterrupts();
  {
    std::swap(m_pDebugToSend, m_pDebugToFill);
  }
  interrupts();

  m_pDebugToFill->clear();
  m_debugOutputWaiting = false;

  if (m_handshakeComplete)
    m_pDebugToSend->writeSerial();

}


// debug calls

void CUSB::writeDebugState(StateType state) {
  if (m_handshakeComplete == false) return; // only write debug state if handshake not complete

  m_pDebugToFill->timestamp = Timer.getConnectTime();
  m_pDebugToFill->state = state;
  m_pDebugToFill->count = 0; // ensure no sample data is sent
  m_debugOutputWaiting = true;
}

