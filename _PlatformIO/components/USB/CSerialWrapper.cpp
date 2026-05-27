#include "WString.h"
#include "CSerialWrapper.h"
#include "CHead.h"
#include "CMasterTimer.h"
#include "Setup.h"
#include "Hardware.h"
#include "Helpers.h"
#include "Config.h"
#include <array>
#include <queue>

CSerialWrapper::CSerialWrapper() : m_Mode(ModeType::UNSET), m_handshakeComplete(false) {
  Serial.begin(USB_BAUDRATE);
}

CSerialWrapper& CSerialWrapper::begin() {
  update();
  return *this;
}


void CSerialWrapper::update() {
  bool connected = Serial;

  if (m_Mode != ModeType::UNSET && !connected) {
    m_Mode = ModeType::UNSET;
    m_handshakeComplete = false;
    Pins::flash(1);
    return;
  }

  if (m_Mode == ModeType::UNSET && connected) {
    m_Mode = ModeType::INITIALISING;
  }

}


CSerialWrapper::ModeType CSerialWrapper::setMode(CSerialWrapper::ModeType mode) {
  m_Mode = mode;
  return m_Mode;
}

void CSerialWrapper::write(int32_t  number) { put((uint8_t*)&number, sizeof(number)); }
void CSerialWrapper::write(uint8_t  byte  ) { put(&byte,             sizeof(byte  )); }
void CSerialWrapper::write(uint16_t data  ) { put((uint8_t*)&data  , sizeof(data  )); }
void CSerialWrapper::write(uint32_t data  ) { put((uint8_t*)&data  , sizeof(data  )); }
void CSerialWrapper::write(uint64_t data  ) { put((uint8_t*)&data  , sizeof(data  )); }
void CSerialWrapper::write(float    number) { put((uint8_t*)&number, sizeof(number)); }
void CSerialWrapper::write(double   number) { put((uint8_t*)&number, sizeof(number)); }
  
void CSerialWrapper::write(uint8_t* pData, uint32_t dataLen) { put(pData, dataLen); }

constexpr uint32_t MAX_SETUP_QUEUE_SIZE = 64;
std::queue<std::vector<uint8_t>> setupDataQueue;

inline void CSerialWrapper::put(uint8_t* pData, uint32_t dataLen) {
  if (m_Mode == ModeType::UNSET || m_Mode == ModeType::INITIALISING)
  {
    if (setupDataQueue.size() >= MAX_SETUP_QUEUE_SIZE) return; // drop data if queue full
    setupDataQueue.emplace(pData, pData + dataLen);
    return;
  }

  while (!setupDataQueue.empty()) {
    std::vector<uint8_t>& data = setupDataQueue.front();
    Serial.write(data.data(), data.size());
    setupDataQueue.pop();
  }

  Serial.write(pData, dataLen); 
}


void CSerialWrapper::printf(const char *pFMT, ...) {
  ModeType previousMode = getMode();
  setMode(ModeType::TEXT);

  char buffer[PRINTF_BUFFER_SIZE];
  va_list args;
  va_start(args, pFMT);
  vsnprintf(buffer, sizeof(buffer)-1, pFMT, args);
  va_end(args);

  int len = strlen(buffer);

  if (buffer[len-1] != '\n')
    buffer[len++] = '\n'; // ensure newline

  put((uint8_t*)buffer, len);
  

  setMode(previousMode);
}


