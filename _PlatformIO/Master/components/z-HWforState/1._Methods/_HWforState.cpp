#include "HWforState.h"
#include "_HWTools.h"


HWforState::HWforState(StateType state)
  : state(state),
    ownedTools(std::make_unique<HWTools>(*this)),
    tools(*ownedTools)
{
   phase = Phase::SEARCH;

}

HWforState::~HWforState() = default; 

