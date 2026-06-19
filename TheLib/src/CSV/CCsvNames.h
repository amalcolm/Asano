#pragma once
#pragma managed(push, off)

#include <string>
#include <string_view>

namespace NativeCsv
{
    class CCsvNames
    {
    public:
        static std::string Sanitize(std::string_view value);
        static std::string LowerAscii(std::string_view value);
    };
}

#pragma managed(pop)
