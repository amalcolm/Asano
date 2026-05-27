#include "CTimerBase.h"
#include "../teensy_compat.h"


CTimerBase::CTimerBase() {
  s_instanceCount++;
  if (s_instanceCount == 1) {
    uint32_t reg = ARM_DWT_CTRL;
    ARM_DWT_CTRL = reg | ARM_DWT_CTRL_CYCCNTENA;  // Enable the counter
  }
}

void CTimerBase::initGPT1(void(* isrHandler)()) {
  
  // --- Enable clock for GPT1 in CCM ---
  uint32_t reg = CCM_CCGR1;
    reg |= CCM_CCGR1_GPT(CCM_CCGR_ON);
    CCM_CCGR1 = reg;

  // --- Reset and configure GPT1 ---
  GPT1_CR = 0;               // disable while configuring
  GPT1_PR = 0;               // no prescaler. runs at peripheral clock (F_CPU/4)
  GPT1_OCR1 = (F_CPU/4) / 2;   // compare value for interrupt (0.5s)
  GPT1_SR = 0x3F;            // clear all status flags
  GPT1_IR = GPT_IR_OF1IE
          | GPT_IR_OC1IE;    // enable overflow interrupt
  GPT1_CR = GPT_CR_CLKSRC(1) 
          | GPT_CR_ENMOD
          | GPT_CR_EN;       // peripheral clock, enable

   // --- Attach interrupt vector ---
  attachInterruptVector(IRQ_GPT1, isrHandler);
  NVIC_ENABLE_IRQ(IRQ_GPT1);
  GPT1_SR = 0x3F;            // clear any pending
  
}

