#pragma once
#pragma managed(push, off)

#include <string>

namespace NativeCsv
{
    class CCsvSessionPaths
    {
    public:
        static std::wstring CreateSessionDirectory();
        static std::wstring CreateSessionDirectory(const std::wstring& testName);
    };
}

#pragma managed(pop)
