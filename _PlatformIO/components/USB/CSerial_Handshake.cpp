#include "CSerialWrapper.h"
#include "Config.h"
#include "Setup.h"
#include "CUSB.h"
#include "CMasterTimer.h"
#include <string>

void CSerialWrapper::doHandshake() {
  static const unsigned long timeout = 1000;  // timeout (mS)
  setMode(ModeType::INITIALISING);

  unsigned long endTime = millis() + timeout;
  m_handshakeComplete = false;
  const char* target = ">HOST_ACK\n";
  const uint8_t targetLength = strlen(target);
  uint8_t targetIndex = 0;
  
  while (!m_handshakeComplete && (millis() < endTime)) {
    if (Serial.available() > 0) {
      byte c = Serial.read();
      
      // Match character against current position in target
      if (c == target[targetIndex]) {
        targetIndex++;
        
        if (targetIndex >= targetLength) {

          Serial.clear(); // clear output buffer
          while (Serial.available()) Serial.read(); // flush input buffer
          
          Serial.write("<DEVICE_ACK\n");
          endTime += timeout;
          Serial.send_now();
          memset(CFG::HOST_VERSION, 0, sizeof(CFG::HOST_VERSION));
          int index = 0;
          while (!m_handshakeComplete && (millis() < endTime)) {

            if (Serial.available())
            {
              c = Serial.read();

              if (c != '\n') {
                if (c != '>') CFG::HOST_VERSION[index++] = c;
              }
              else {
                writeHandshakeResponse();

                Serial.send_now();
                m_handshakeComplete = true;
              }
            }

          }
          break;
        }
      } else {
        // Reset match but check if current char matches first char of target
        targetIndex = (c == target[0]) ? 1 : 0;
      }
    }
  }


  if (m_handshakeComplete)
    setMode(ModeType::BLOCKDATA);
  else
    setMode(ModeType::TEXT);

  std::string outcome{};
  if (m_handshakeComplete)
    outcome = std::string("Handshake complete. ")
            +   "Host: "   + std::string(CFG::HOST_VERSION) 
            + ", Device: " + std::string(CFG::DEVICE_NAME) + " v" + std::string(CFG::DEVICE_VERSION)
            + " Binary BLOCKMODE active\n";
  else
    outcome = "Handshake failed. Defaulting to TEXT mode.\n";
  

  USB.printf(outcome.c_str());  

  Serial.flush(); // ensure all output sent
  Serial.clear(); // clear output buffer
  while (Serial.available() > 0) Serial.read(); // flush input buffer
  Timer.setConnectTime();

}



void CSerialWrapper::writeHandshakeResponse() {
  static char buffer[320];

  snprintf(buffer, sizeof(buffer)-1,
     "<STATE_DURATION_uS=%lf::HEAD_SETTLE_TIME_uS=%lf::POT_UPDATE_OFFSET_uS=%lf::A2D_SAMPLING_SPEED_Hz=%lf::A2D_READING_PERIOD_uS=%lf::MAX_BLOCKSIZE=%lu::MAX_EVENTS_PER_BLOCK=%lu::DEVICE_VERSION=%s::DEBUG_MODE=%s\n",
  CFG::STATE_DURATION_uS,CFG::HEAD_SETTLE_TIME_uS,CFG::POT_UPDATE_OFFSET_uS,CFG::A2D_SAMPLING_SPEED_Hz,CFG::A2D_READING_PERIOD_uS,CFG::MAX_BLOCKSIZE,CFG::MAX_EVENTS_PER_BLOCK,CFG::DEVICE_VERSION,CFG::DEBUG_MODE);

  Serial.write((uint8_t*)buffer, strlen(buffer));
}
