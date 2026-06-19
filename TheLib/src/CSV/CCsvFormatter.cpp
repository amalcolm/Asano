#include "CCsvFormatter.h"

#pragma managed(push, off)

#include <charconv>
#include <system_error>

namespace NativeCsv
{
    namespace
    {
        template <typename T>
        void AppendNumber(std::string& out, T value)
        {
            char buffer[64]{};
            auto result = std::to_chars(buffer, buffer + sizeof(buffer), value);

            if (result.ec == std::errc{})
                out.append(buffer, result.ptr);
        }
    }

    void CCsvFormatter::AppendStateRow(std::string& out, const CCsvSample& sample, std::string_view stateDescription)
    {
        AppendDouble(out, sample.timestamp);
        out.push_back(',');
        AppendQuoted(out, stateDescription);
        out.push_back(',');
        AppendInt(out, sample.top);
        out.push_back(',');
        AppendInt(out, sample.bot);
        out.push_back(',');
        AppendInt(out, sample.mid);
        out.push_back(',');
        AppendInt(out, sample.offset);
        out.push_back(',');
        AppendInt(out, sample.gain);
        out.push_back(',');
        AppendDouble(out, sample.sensor1);
        out.push_back(',');
        AppendDouble(out, sample.sensor2);
        AppendLineEnding(out);
    }

    void CCsvFormatter::AppendQuoted(std::string& out, std::string_view value)
    {
        out.push_back('"');

        for (char c : value)
        {
            if (c == '"')
                out.push_back('"');

            out.push_back(c);
        }

        out.push_back('"');
    }

    void CCsvFormatter::AppendDouble(std::string& out, double value)
    {
        char buffer[64]{};
        auto result = std::to_chars(buffer, buffer + sizeof(buffer), value, std::chars_format::general, 17);

        if (result.ec == std::errc{})
            out.append(buffer, result.ptr);
    }

    void CCsvFormatter::AppendInt(std::string& out, int value)
    {
        AppendNumber(out, value);
    }

    void CCsvFormatter::AppendLineEnding(std::string& out)
    {
        out.append("\r\n", 2);
    }
}

#pragma managed(pop)
