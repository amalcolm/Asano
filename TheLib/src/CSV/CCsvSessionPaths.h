#pragma once
#pragma managed(push, off)

#include <string>

namespace NativeCsv
{
    class CCsvSessionPaths
    {
    public:
        static std::wstring CreateSessionDirectory();
    };
}

#pragma managed(pop)
