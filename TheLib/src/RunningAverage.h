// RunningAverageMinMaxCli.h
#pragma once

#include <cstdint>
#include "CRunningAverage.h"   // contains RunningAverageMinMax

using namespace System;

namespace TheLib
{
    public ref class RunningAverage sealed
    {
    private:
        CRunningAverageMinMax* _p = nullptr;

    public:
        RunningAverage(size_t windowSize);
        ~RunningAverage();
		!RunningAverage();


        void Reset(size_t windowSize);
        void Add(double value);

		property double   Average { inline double   get(); }
        property double   Min     { inline double   get(); }
        property double   Max     { inline double   get(); }
        property uint32_t Count   { inline uint32_t get(); }
    };
}
