#include "pins_arduino.h"
#include "core_pins.h"
#include "CHead.h"
#include "CA2D.h"
#include "HWforState.h"
#include "Helpers.h"
#include "Setup.h"
#include "DataTypes.h"
#include "CTimer.h"
#include "Config.h"

const uint64_t CHead::MAXUINT64 = static_cast<uint64_t>(-1);
const ZTests zTest;

CHead::CHead() : m_State(UNSET), m_sequencePosition(-1) {}

CHead::~CHead() {}

void CHead::begin() {
  LED.clear();  // turn off all LEDs
}

void CHead::waitForReady() const { 

  A2D.setReadState(CA2D::ReadState::PREPARE);
 
  while (Timer.Head.waiting()) A2D.poll();
 
  A2D.setReadState(CA2D::ReadState::READ); // clear dataReady to ensure fresh read on next A2D read
 }

StateType CHead::setNextState() { if (m_sequencePosition < 0) Ready = true;
//  static constexpr bool hasOffPeriod = CFG::LED_OFF_PEERIOD_uS > 0;
  
  Timer.syncAndChangeState(); // wait on state timer, then align timers to the state change marker

  const bool reset = (m_sequencePosition == -1) || Pins::flashReset;
  if (reset) Pins::flashReset = false; // only use FlashReset once, and set it at start
  
  const StateType oldState = reset ? UNSET : m_State;

  m_sequencePosition = (m_sequencePosition + 1) % m_sequence.size();

  const StateType newState = m_sequence[m_sequencePosition];

  A2D.swapBlocks(newState);  // this swaps the A2D double buffer and sends the previous block to the output buffer

  StateType diff = (newState ^ oldState) & VALIDBITS;  // non-zero if any difference between the states

  if (!diff && !reset) return m_State;

  m_State = newState;

  LED.writeState(newState);

  HW = getHWforState();
  HW->set();            // Apply hardware settings (digipots) for new state

  return m_State;
}

void CHead::clear() {
  m_State = UNSET;
  m_sequencePosition = -1;

  LED.clear();
}



void CHead::setSequence(std::initializer_list<SequenceItem> items) {
  size_t total = 0;
  for (const auto& it : items)
    total += it.isSingle ? 1u : it.size;
  
  if (total == 0) ERROR("CHead::setSequence: empty sequence");

  m_sequence.clear();
  m_sequence.reserve(total);

  for (const auto& it : items)
    if (it.isSingle)
      m_sequence.push_back(it.single);
    else if (it.data && it.size) 
      m_sequence.insert(m_sequence.end(), it.data, it.data + it.size);

  if (m_sequence.size() == 1)
    snprintf(CFG::DEBUG_MODE, sizeof(CFG::DEBUG_MODE), "SINGLE_STATE");
}
