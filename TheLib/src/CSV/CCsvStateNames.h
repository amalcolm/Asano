#pragma once
#pragma managed(push, off)

#include <cstdint>
#include <string>

namespace NativeCsv
{
    class CCsvStateNames
    {
    public:
        static std::string Describe(uint32_t state);
    };
}

#pragma managed(pop)
