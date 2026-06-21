#pragma once
#include "CHead.h"

struct ZTests {
  private:

    inline static constexpr StateType __FullTest[] = {                                                // 36 states:
      Head.RED1 , Head.IR1  , Head.RED2 , Head.IR2  , Head.RED3 , Head.IR3  , Head.RED4 , Head.IR4 ,  //  8
      Head.RED5 , Head.IR5  , Head.RED6 , Head.IR6  , Head.RED7 , Head.IR7  , Head.RED8 , Head.IR8 ,  //  8

      Head.RED1 | Head.RED2 , Head.IR1  | Head.IR2  , Head.RED3 | Head.RED4 , Head.IR3  | Head.IR4 ,  //  4
      Head.RED5 | Head.RED6 , Head.IR5  | Head.IR6  , Head.RED7 | Head.RED8 , Head.IR7  | Head.IR8 ,  //  4

      Head.RED1 | Head.RED2 | Head.RED3 | Head.RED4 , Head.IR1  | Head.IR2  | Head.IR3  | Head.IR4 ,  //  2
      Head.RED5 | Head.RED6 | Head.RED7 | Head.RED8 , Head.IR5  | Head.IR6  | Head.IR7  | Head.IR8 ,  //  2

      Head.RED1 | Head.RED2 | Head.RED3 | Head.RED4 | Head.RED5 | Head.RED6 | Head.RED7 | Head.RED8,  //  1
      Head.IR1  | Head.IR2  | Head.IR3  | Head.IR4  | Head.IR5  | Head.IR6  | Head.IR7  | Head.IR8 ,  //  1

      Head.RED1 | Head.RED4 , Head.IR1  | Head.IR4  , Head.RED3 | Head.RED6 , Head.IR3  | Head.IR6 ,  //  4

      CHead::ALL_OFF, CHead::ALL_ON,                                                                  //  2
    };

    inline static constexpr StateType __AllReds[] = {
      Head.RED1 | Head.RED2 | Head.RED3 | Head.RED4 | Head.RED5 | Head.RED6 | Head.RED7 | Head.RED8
    };

    inline static constexpr StateType __AllIRs[] = {
      Head.IR1 | Head.IR2 | Head.IR3 | Head.IR4 | Head.IR5 | Head.IR6 | Head.IR7 | Head.IR8
    };

  public:
    inline static constexpr std::span<const StateType> FullTest{ __FullTest };
    inline static constexpr std::span<const StateType> AllReds { __AllReds  };
    inline static constexpr std::span<const StateType> AllIRs  { __AllIRs   };
};

extern const ZTests zTest;