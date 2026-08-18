#include "CA2D.h"
#include "Setup.h"
#include "CUSB.h"
#include "CHead.h"
#include "Helpers.h"
#include "HWforState.h"

// buffers for DMA SPI transfers - must be 32-byte aligned for cache management on Teensy 4.x
alignas(32) uint8_t m_rxBuffer[32];
alignas(32) uint8_t m_txBuffer[32];
alignas(32) uint8_t m_frBuffer[32];

void CA2D::init_DMA() {
  s_spiEvent.attach(onSpiDmaComplete);
}

DataType CA2D::readADS1299(DataType &data) {

  if (s_dmaActive) return DataType(Head.RED8);

  s_dmaActive = true;

  SPI.beginTransaction(spiSettings);
  digitalWrite(CS.A2D, LOW);

  memset(m_txBuffer, 0, 32);
  if (m_mode == ModeType::TRIGGERED) {
    (void)SPI.transfer(0x12); // RDATA command
    delayMicroseconds(4);
  }

  arm_dcache_flush(m_txBuffer, sizeof(m_txBuffer));
  arm_dcache_delete(m_rxBuffer, sizeof(m_rxBuffer));

  Timer.addEvent(EventKind::SPI_DMA_START);

  SPI.transfer(m_txBuffer, m_rxBuffer, 27, s_spiEvent);

//  data.fillFromHardware(*HW, false); 

  while (s_dmaActive) yield(); // wait for DMA complete (CS.A2D raised in callback)

  Timer.addEvent(EventKind::SPI_DMA_COMPLETE);

  bool badHeader = (m_frBuffer[0] & 0xF0) != 0xC0; // status[0] header nibble must be 0xC
//  bool isZero = (m_frBuffer[3] == 0 && m_frBuffer[4] == 0 && m_frBuffer[5] == 0); //  “all zero” sample

 //  if (badHeader != lastBadHeader) LED.write(15, lastBadHeader = badHeader);
 //  if (isZero    != lastIsZero   ) LED.write(14, lastIsZero    = isZero   );

   if (badHeader) {
     data.state = DIRTY;
     return data;
   }

  const uint8_t* p = &m_frBuffer[3]; // skip status (first 3 bytes)
  for (int ch=0; ch<8; ++ch) {
    data.channels[ch] = be24_to_s32(p[0], p[1], p[2]);
    p += 3;
  }
  return data;
}


void CA2D::onSpiDmaComplete(EventResponderRef)
{
    arm_dcache_delete( m_rxBuffer, sizeof(m_rxBuffer));
    memcpy(m_frBuffer, m_rxBuffer, sizeof(m_rxBuffer));

    digitalWrite(CS.A2D, HIGH);
    SPI.endTransaction();

    s_dmaActive = false;
}