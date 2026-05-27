#pragma once
#pragma managed(push, off)

#include <cstdint>
#include <cstddef>
#include <vector>
#include "CPackets.h"

class CDecoder
{
public:

    // Tries Data first, then Block. On success returns kind and fills the matching out param.
    PacketKind process(const CPacket& in, CDecodedPacket& out) noexcept;

    void reset() noexcept;

private:
    std::vector<uint8_t> m_buf;

    static bool IsKnownFrameHeaderAt(const std::vector<uint8_t>& buf, size_t i);

	static constexpr int MAX_BADHEADER_ATTEMPTS = 3;
	int m_badHeaderAttempts = 0;   
};

#pragma managed(pop)