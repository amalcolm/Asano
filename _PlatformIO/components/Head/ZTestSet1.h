#pragma once
#include "CHead.h"

struct ZTestSet1 {
  private:

    // Each runnable set includes at least one ALL_OFF sample for ambient subtraction.
    // Sets are kept short enough to target sub-50ms cycles including off-time.

    inline static constexpr StateType __Singles_1_4[] = {
      CHead::ALL_OFF,
      CHead::RED1, CHead::IR1,
      CHead::RED2, CHead::IR2,
      CHead::RED3, CHead::IR3,
      CHead::RED4, CHead::IR4,
    };

    inline static constexpr StateType __Singles_5_8[] = {
      CHead::ALL_OFF,
      CHead::RED5, CHead::IR5,
      CHead::RED6, CHead::IR6,
      CHead::RED7, CHead::IR7,
      CHead::RED8, CHead::IR8,
    };

    inline static constexpr StateType __Pairs_1_4[] = {
      CHead::ALL_OFF,
      CHead::RED1 | CHead::RED2,
      CHead::IR1  | CHead::IR2,
      CHead::RED3 | CHead::RED4,
      CHead::IR3  | CHead::IR4,
    };

    inline static constexpr StateType __Pairs_5_8[] = {
      CHead::ALL_OFF,
      CHead::RED5 | CHead::RED6,
      CHead::IR5  | CHead::IR6,
      CHead::RED7 | CHead::RED8,
      CHead::IR7  | CHead::IR8,
    };

    inline static constexpr StateType __Quads_1_4[] = {
      CHead::ALL_OFF,
      CHead::RED1 | CHead::RED2 | CHead::RED3 | CHead::RED4,
      CHead::ALL_OFF,
      CHead::IR1  | CHead::IR2  | CHead::IR3  | CHead::IR4,
    };

    inline static constexpr StateType __Quads_5_8[] = {
      CHead::ALL_OFF,
      CHead::RED5 | CHead::RED6 | CHead::RED7 | CHead::RED8,
      CHead::ALL_OFF,
      CHead::IR5  | CHead::IR6  | CHead::IR7  | CHead::IR8,
    };

    inline static constexpr StateType __AllReds[] = {
      CHead::ALL_OFF,
      CHead::RED1 | CHead::RED2 | CHead::RED3 | CHead::RED4 |
      CHead::RED5 | CHead::RED6 | CHead::RED7 | CHead::RED8,
    };

    inline static constexpr StateType __AllIRs[] = {
      CHead::ALL_OFF,
      CHead::IR1 | CHead::IR2 | CHead::IR3 | CHead::IR4 |
      CHead::IR5 | CHead::IR6 | CHead::IR7 | CHead::IR8,
    };

    inline static constexpr StateType __AllRedIR[] = {
      CHead::ALL_OFF,
      CHead::RED1 | CHead::RED2 | CHead::RED3 | CHead::RED4 |
      CHead::RED5 | CHead::RED6 | CHead::RED7 | CHead::RED8,
      CHead::ALL_OFF,
      CHead::IR1 | CHead::IR2 | CHead::IR3 | CHead::IR4 |
      CHead::IR5 | CHead::IR6 | CHead::IR7 | CHead::IR8,
    };

    inline static constexpr StateType __AllOnStress[] = {
      CHead::ALL_OFF,
      CHead::ALL_ON,
    };

    inline static constexpr StateType __CrossPairs[] = {
      CHead::ALL_OFF,
      CHead::RED1 | CHead::RED4,
      CHead::IR1  | CHead::IR4,
      CHead::RED3 | CHead::RED6,
      CHead::IR3  | CHead::IR6,
    };

  public:
    inline static constexpr std::span<const StateType> Singles_1_4{ __Singles_1_4 };
    inline static constexpr std::span<const StateType> Singles_5_8{ __Singles_5_8 };
    inline static constexpr std::span<const StateType> Pairs_1_4  { __Pairs_1_4   };
    inline static constexpr std::span<const StateType> Pairs_5_8  { __Pairs_5_8   };
    inline static constexpr std::span<const StateType> Quads_1_4  { __Quads_1_4   };
    inline static constexpr std::span<const StateType> Quads_5_8  { __Quads_5_8   };
    inline static constexpr std::span<const StateType> AllReds    { __AllReds     };
    inline static constexpr std::span<const StateType> AllIRs     { __AllIRs      };
    inline static constexpr std::span<const StateType> AllRedIR   { __AllRedIR    };
    inline static constexpr std::span<const StateType> AllOnStress{ __AllOnStress };
    inline static constexpr std::span<const StateType> CrossPairs { __CrossPairs  };
};

inline constexpr ZTestSet1 zTestSet1{};
