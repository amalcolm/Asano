#pragma once
#pragma managed(push, off)

#include <string>
#include <string_view>
#include "CCsvSample.h"

namespace NativeCsv
{
    class CCsvFormatter
    {
    public:
        static void AppendStateRow(std::string& out, const CCsvSample& sample, std::string_view stateDescription);
        static void AppendQuoted(std::string& out, std::string_view value);
        static void AppendDouble(std::string& out, double value);
        static void AppendInt(std::string& out, int value);
        static void AppendLineEnding(std::string& out);
    };
}

#pragma managed(pop)
