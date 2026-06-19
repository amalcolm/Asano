#pragma once
#pragma managed(push, off)

#include <cstdint>
#include "../Packets/CPackets.h"

namespace NativeCsv
{
    struct CCsvSample
    {
        double timestamp{};
        uint32_t state{};
        int top{};
        int bot{};
        int mid{};
        int offset{};
        int gain{};
        double sensor1{};
        double sensor2{};
        double lightEnvelope{};

        static bool TryCopyLastFromBlock(const CBlockPacket& block, CCsvSample& out) noexcept
        {
            if (block.count == 0)
                return false;

            const CDataPacket& data = block.blockData[block.count - 1];

            out.timestamp = data.timeStamp;
            out.state = block.state;
            out.mid = static_cast<int>((data.hardwareState >> 56) & 0xFFull);
            out.top = static_cast<int>((data.hardwareState >> 48) & 0xFFull);
            out.bot = static_cast<int>((data.hardwareState >> 40) & 0xFFull);
            out.offset = static_cast<int>((data.hardwareState >> 24) & 0xFFull);
            out.gain = static_cast<int>((data.hardwareState >> 16) & 0xFFull);
            out.sensor1 = data.Sensor1;
            out.sensor2 = data.Sensor2;
            out.lightEnvelope = data.lightEnvelope;

            return true;
        }
    };
}

#pragma managed(pop)
