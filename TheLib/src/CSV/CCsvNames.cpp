#include "CCsvNames.h"

#pragma managed(push, off)

#include <cctype>

namespace NativeCsv
{
    namespace
    {
        bool IsInvalidFilenameCharacter(unsigned char c) noexcept
        {
            switch (c)
            {
            case '<':
            case '>':
            case ':':
            case '"':
            case '/':
            case '\\':
            case '|':
            case '?':
            case '*':
                return true;
            default:
                return c < 32 || std::isspace(c) != 0;
            }
        }
    }

    std::string CCsvNames::Sanitize(std::string_view value)
    {
        size_t begin = 0;
        size_t end = value.size();

        while (begin < end && std::isspace(static_cast<unsigned char>(value[begin])) != 0)
            ++begin;

        while (end > begin && std::isspace(static_cast<unsigned char>(value[end - 1])) != 0)
            --end;

        if (begin == end)
            return "state";

        std::string result;
        result.reserve(end - begin);

        bool previousWasUnderscore = false;

        for (size_t i = begin; i < end; ++i)
        {
            unsigned char c = static_cast<unsigned char>(value[i]);

            if (IsInvalidFilenameCharacter(c))
            {
                if (!previousWasUnderscore && !result.empty())
                {
                    result.push_back('_');
                    previousWasUnderscore = true;
                }

                continue;
            }

            result.push_back(static_cast<char>(c));
            previousWasUnderscore = c == '_';
        }

        while (!result.empty() && result.front() == '_')
            result.erase(result.begin());

        while (!result.empty() && result.back() == '_')
            result.pop_back();

        return result.empty() ? "state" : result;
    }

    std::string CCsvNames::LowerAscii(std::string_view value)
    {
        std::string result;
        result.reserve(value.size());

        for (unsigned char c : value)
            result.push_back(static_cast<char>(std::tolower(c)));

        return result;
    }
}

#pragma managed(pop)
