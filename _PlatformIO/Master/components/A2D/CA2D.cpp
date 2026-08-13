#include "CA2D.h"
#include "Setup.h"
#include "CHead.h"
#include "Helpers.h"
#include "HWforState.h"
#include "CA2DTimer.h"
#include "Config.h"

const std::array<std::pair<uint32_t, uint8_t>, 8> SpeedLookup = {{
    {16000, 0x90}, { 8000, 0x91}, { 4000, 0x92}, { 2000, 0x93},
    { 1000, 0x94}, {  500, 0x95}, {  250, 0x96}, {  125, 0x97}
}};

CA2D::CA2D() {
  m_mode = CFG::A2D_USE_CONTINUOUS_MODE ? ModeType::CONTINUOUS : ModeType::TRIGGERED;
  m_ReadState = ReadState::IDLE;
}

void CA2D::begin() {
  pinMode(CS.A2D        , OUTPUT); // SPI CS
  pinMode(m_pinDataReady, INPUT ); // no pullups; ADS drives the line

  // Configure the ADS1299, and sent START command, and RDATAC if in continuous mode
  configure_ADS1299();

  init_DMA();

  // We use two blocks and swap between them, allowing reading into one while the other is being sent
  m_pBlockToFill = &m_BlockA;
  m_pBlockToSend = &m_BlockB;
  m_BlockA.clear();
  m_BlockB.clear();

  NVIC_SET_PRIORITY(IRQ_GPIO2_0_15, 1);  // raise priority of GPIO1 interrupts

  // attach the dataReadyPin to the interrupt handler, fires on falling edge (when ADS has data ready)
  attachInterrupt(digitalPinToInterrupt(m_pinDataReady), CA2D::ISR_Data, FALLING);
}

volatile uint32_t interruptCount = 0;
void CA2D::ISR_Data() {
  uint32_t now = ARM_DWT_CYCCNT; 
  A2D.m_dataStateTime = Timer.getStateTime(now);
  A2D.m_dataReady = true;
  
  Timer.A2D.setDataReady(now);
  interruptCount++;
  
  delayMicroseconds(4); // ensure we meet timing requirements for CS hold time and data ready setup time before exiting ISR
}



void CA2D::waitForNextDataReady() {
  while (!m_dataReady)
    yield();

  poll();
}
  
//CTeleCounter TC_Poll{TeleGroup::A2D, 1};
//CTeleCounter TC_Read{TeleGroup::A2D, 2};

bool CA2D::poll() {
  double start = Timer.getStateTime();
//  TC_Poll.increment();

  switch (m_mode) {
    case ModeType::CONTINUOUS: if (!m_dataReady       ) return false; else break;
    case ModeType::TRIGGERED : if (Timer.A2D.waiting()) return false; else break;
    default: return false;
  }
 

  m_dataReady = false;  // reset flag
//  TC_Read.increment();
  
  bool result = true;

  if (m_ReadState != ReadState::IDLE) {
    result = storeNewData();
  }

  double end = Timer.getStateTime();
  m_raPollDuration.add(end - start);

  Timer.addEvent(EventKind::A2D_READ_START   , start);
  Timer.addEvent(EventKind::A2D_READ_COMPLETE, end  );  

  return result;
}

bool CA2D::storeNewData() {

  DataType data(Head.getState());  // sets timestamp and stateTime
  if (CFG::ADS1299_USE_24BIT)
    readADS1299(data);
  else
    data.fillFromHardware(*HW, false);
  
  if (m_mode == ModeType::CONTINUOUS) data.stateTime = m_dataStateTime;

  m_pBlockToFill->tryAdd(data);

  return data.state != DIRTY;
}


void CA2D::read24bitData() {
  DataType data(Head.getState());  // sets timestamp and stateTime
  readADS1299(data);
  if (m_mode == ModeType::CONTINUOUS) data.stateTime = m_dataStateTime;

  m_pBlockToFill->tryAdd(data);
}


uint8_t CA2D::getConfig1() const {
  uint8_t config1 = 0x94;

  // Set speed bits based on SAMPLING_SPEED
  for (const auto& [speed, code] : SpeedLookup) {
    if (CFG::A2D_SAMPLING_SPEED_Hz == speed) {
      config1 = code;
      break;
    }
  }

  return config1;
}


void CA2D::SPIwrite(std::initializer_list<uint8_t> data) {

  if (data.size() == 0) return;

  digitalWrite(CS.A2D, LOW);
  delayMicroseconds(4);

  // get length from data.end() - data.begin();
  if (data.size() == 1) {
    SPI.transfer(*data.begin());
  } else {
    spiTimer.reset();  // 2uS between bytes needed for ADS1299
    for (uint8_t b : data) {
      SPI.transfer(b);
      spiTimer.wait();
    }
  }
  
  delayMicroseconds(5);
  digitalWrite(CS.A2D, HIGH);
  delayMicroseconds(10);
}





void CA2D::swapBlocks(StateType state) {
  noInterrupts();
  {
    std::swap(m_pBlockToSend, m_pBlockToFill);
  }
  interrupts();

  m_pBlockToFill->clear();
  m_pBlockToFill->state = state;
  m_pBlockToFill->timestamp = Timer.getConnectTime();

  USB.buffer(m_pBlockToSend); // qaueue the block we just filled to be sent over USB
}
