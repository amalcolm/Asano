#include "CSerialWrapper.h"
#include "Config.h"
#include "Setup.h"
#include "CUSB.h"
#include "CMasterTimer.h"
#include "XCommands.h"
#include "ZTestSet1.h"
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <string>

namespace {
  void writeHandshakeRaw(const char* text) {
    Serial.write(reinterpret_cast<const uint8_t*>(text), strlen(text));
  }

  void writeHandshakeLine(const char* format, ...) {
    static char buffer[256];

    int offset = snprintf(buffer, sizeof(buffer), "<");
    if (offset < 0 || offset >= static_cast<int>(sizeof(buffer))) return;

    va_list args;
    va_start(args, format);
    const int length = vsnprintf(buffer + offset, sizeof(buffer) - offset, format, args);
    va_end(args);

    if (length < 0) return;

    offset += length;
    if (offset < 0 || offset >= static_cast<int>(sizeof(buffer) - 1)) {
      buffer[sizeof(buffer) - 2] = '\n';
      buffer[sizeof(buffer) - 1] = '\0';
    }
    else {
      buffer[offset++] = '\n';
      buffer[offset] = '\0';
    }

    Serial.write(reinterpret_cast<uint8_t*>(buffer), strlen(buffer));
  }

  void writeTestSequenceLine(const ZTestSet1::NamedSequence& sequence) {
    writeHandshakeRaw("<TEST_SEQUENCE=");
    writeHandshakeRaw(sequence.name);
    writeHandshakeRaw(":");

    for (size_t i = 0; i < sequence.states.size(); ++i) {
      char stateText[12];
      snprintf(stateText, sizeof(stateText), "%s%08lX", i == 0 ? "" : ",", static_cast<unsigned long>(sequence.states[i]));
      writeHandshakeRaw(stateText);
    }

    writeHandshakeRaw("\n");
  }
}

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
  writeHandshakeRaw("<CONFIG_BEGIN\n");

  writeHandshakeLine("STATE_DURATION_uS=%lf", CFG::STATE_DURATION_uS);
  writeHandshakeLine("HEAD_SETTLE_TIME_uS=%lf", CFG::HEAD_SETTLE_TIME_uS);
  writeHandshakeLine("POT_UPDATE_OFFSET_uS=%lf", CFG::POT_UPDATE_OFFSET_uS);
  writeHandshakeLine("A2D_SAMPLING_SPEED_Hz=%lf", CFG::A2D_SAMPLING_SPEED_Hz);
  writeHandshakeLine("A2D_READING_PERIOD_uS=%lf", CFG::A2D_READING_PERIOD_uS);
  writeHandshakeLine("MAX_BLOCKSIZE=%lu", CFG::MAX_BLOCKSIZE);
  writeHandshakeLine("MAX_EVENTS_PER_BLOCK=%lu", CFG::MAX_EVENTS_PER_BLOCK);
  writeHandshakeLine("DEVICE_VERSION=%s", CFG::DEVICE_VERSION);
  writeHandshakeLine("DEBUG_MODE=%s", CFG::getDebugModeString());
  writeHandshakeLine("COMMAND_FLAGS=%lu", static_cast<unsigned long>(CFG::commandFlags));
  writeHandshakeLine("MAX_SEQUENCE_STATES=%u", static_cast<unsigned>(XCMD_SetSequence::MAX_STATES));

  for (const auto& sequence : ZTestSet1::NamedSets)
    writeTestSequenceLine(sequence);

  writeHandshakeRaw("<CONFIG_END\n");
}
