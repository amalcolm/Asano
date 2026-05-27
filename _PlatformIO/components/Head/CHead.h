#pragma once
#include <initializer_list>
#include <vector>
#include <span>
#include "Setup.h"
#include "DataTypes.h"
#include "CRunningAverage.h"

class CHead {
  public:

    static constexpr int NUM_LEDS    =  9;
    static constexpr int IR_STARTBIT = 16;

    //                                        3         2         1         0
    //                                       10987654321098765432109876543210

    //                                                 RED             IR
    //                                              987654321       987654321

    static constexpr StateType IR1       = 0b00000000000000000000000000000001;
    static constexpr StateType IR2       = 0b00000000000000000000000000000010;
    static constexpr StateType IR3       = 0b00000000000000000000000000000100;
    static constexpr StateType IR4       = 0b00000000000000000000000000001000;
    static constexpr StateType IR5       = 0b00000000000000000000000000010000;
    static constexpr StateType IR6       = 0b00000000000000000000000000100000;
    static constexpr StateType IR7       = 0b00000000000000000000000001000000;
    static constexpr StateType IR8       = 0b00000000000000000000000010000000;
    static constexpr StateType IR9       = 0b00000000000000000000000100000000;

    //                                                 RED             IR
    //                                              987654321       987654321

    static constexpr StateType RED1      = 0b00000000000000010000000000000000;
    static constexpr StateType RED2      = 0b00000000000000100000000000000000;
    static constexpr StateType RED3      = 0b00000000000001000000000000000000;
    static constexpr StateType RED4      = 0b00000000000010000000000000000000;
    static constexpr StateType RED5      = 0b00000000000100000000000000000000;
    static constexpr StateType RED6      = 0b00000000001000000000000000000000;
    static constexpr StateType RED7      = 0b00000000010000000000000000000000;
    static constexpr StateType RED8      = 0b00000000100000000000000000000000;
    static constexpr StateType RED9      = 0b00000001000000000000000000000000;

    //                                                 RED             IR
    //                                              987654321       987654321

    static constexpr StateType VALIDBITS = 0b00000001111111110000000111111111; 

    static constexpr StateType ALL_OFF   = 0b00000000000000000000000000000000;
    static constexpr StateType ALL_ON    = 0b00000001111111110000000111111111;

  
  public:
    CHead();
   ~CHead();
   
    void begin();
    void setSequence( std::initializer_list<struct SequenceItem> il2d );

    inline StateType getState() { return m_State; }
    inline void setStateForDebug(StateType state) { m_sequence[0] = state; }
    StateType setNextState();
    void clear();

    std::vector<StateType>& getSequence() { return m_sequence; }
    uint8_t getSequencePosition() const { return m_sequencePosition; }

    void waitForReady() const;

    StateType   m_State;
  
    std::vector<StateType> m_sequence;
    int   m_sequencePosition = -1;

    static const uint64_t MAXUINT64;
  
};

  struct SequenceItem {
    bool isSingle = true;
    StateType single = 0;

    const StateType* data = nullptr;
    size_t size = 0;

    constexpr SequenceItem(StateType s)
      : isSingle(true), single(s) {}

    constexpr SequenceItem(std::span<const StateType> s)
      : isSingle(false), data(s.data()), size(s.size()) {}
  };


#include "ZTests.h"

extern CHead Head;
