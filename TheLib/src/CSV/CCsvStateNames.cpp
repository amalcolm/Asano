#include "CCsvStateNames.h"

#pragma managed(push, off)

namespace NativeCsv
{
    namespace
    {
        void AppendSection(std::string& out, uint32_t state, int offset, const char* prefix)
        {
            uint32_t mask = (state >> offset) & 0xFFFu;
            if (mask == 0)
                return;

            if (!out.empty())
                out.append(": ");

            out.append(prefix);

            bool needPlus = false;
            for (int bit = 0; bit < 12; ++bit)
            {
                if ((mask & (1u << bit)) == 0)
                    continue;

                if (needPlus)
                    out.push_back('+');

                out.append(std::to_string(bit + 1));
                needPlus = true;
            }
        }
    }

    std::string CCsvStateNames::Describe(uint32_t state)
    {
        switch (state)
        {
        case 0x00000000u: return "ALL_OFF";
        case 0x01FF01FFu: return "ALL_ON";
        case 0x00000001u: return "IR1";
        case 0x00000002u: return "IR2";
        case 0x00000004u: return "IR3";
        case 0x00000008u: return "IR4";
        case 0x00000010u: return "IR5";
        case 0x00000020u: return "IR6";
        case 0x00000040u: return "IR7";
        case 0x00000080u: return "IR8";
        case 0x00000100u: return "IR9";
        case 0x00010000u: return "RED1";
        case 0x00020000u: return "RED2";
        case 0x00040000u: return "RED3";
        case 0x00080000u: return "RED4";
        case 0x00100000u: return "RED5";
        case 0x00200000u: return "RED6";
        case 0x00400000u: return "RED7";
        case 0x00800000u: return "RED8";
        case 0x01000000u: return "RED9";
        case 0x80000000u: return "UNSET";
        default:
            break;
        }

        state &= 0x7FFFFFFFu;

        std::string result;
        AppendSection(result, state, 0, "IR");
        AppendSection(result, state, 16, "RED");

        return result;
    }
}

#pragma managed(pop)
