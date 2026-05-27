#pragma once
#include "CHead.h"

struct ZTests {
  private:
    inline static const std::array<StateType, 30> __FullTest = {
      Head.RED1, Head.RED2, Head.RED3, Head.RED4, Head.RED5, Head.RED6, Head.RED7, Head.RED8,
      Head. IR1, Head. IR2, Head. IR3, Head. IR4, Head. IR5, Head. IR6, Head. IR7, Head. IR8,

      Head.RED1 | Head.IR1, Head.RED2 | Head.IR2, Head.RED3 | Head.IR3, Head.RED4 | Head.IR4,
      Head.RED5 | Head.IR5, Head.RED6 | Head.IR6, Head.RED7 | Head.IR7, Head.RED8 | Head.IR8,
      
      Head.RED1 | Head.RED2 | Head.IR1 | Head.IR2, 
      Head.RED3 | Head.RED4 | Head.IR3 | Head.IR4, 
      Head.RED5 | Head.RED6 | Head.IR5 | Head.IR6,
      Head.RED7 | Head.RED8 | Head.IR7 | Head.IR8,
    };

    inline static const std::array<StateType, 1> __AllReds = {
      Head.RED1 | Head.RED2 | Head.RED3 | Head.RED4 | Head.RED5 | Head.RED6 | Head.RED7 | Head.RED8
    };

    inline static const std::array<StateType, 1> __AllIRs = {
      Head.IR1 | Head.IR2 | Head.IR3 | Head.IR4 | Head.IR5 | Head.IR6 | Head.IR7 | Head.IR8,
    };

  public:
    inline static constexpr std::span<const StateType> FullTest{ __FullTest };
    inline static constexpr std::span<const StateType> AllReds { __AllReds };
    inline static constexpr std::span<const StateType> AllIRs  { __AllIRs };
};

extern const ZTests zTest;