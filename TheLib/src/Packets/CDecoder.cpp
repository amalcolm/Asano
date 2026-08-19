#define NOMINMAX
#include "CDecoder.h"
#include <cstring>   // memcpy
#include <algorithm> // min
#include <exception>

#pragma managed(push, off)

#ifndef _DEBUG
#define _DEBUG 0
#endif // !_Debug


namespace
{
    constexpr size_t kFrameSize = sizeof(Frame);

    constexpr size_t kBlockHeaderSize      = sizeof(uint32_t)                                  // block state
                                           + sizeof(double)                                    // block timeStamp
                                           + sizeof(uint32_t)                                  // block count
                                           + sizeof(uint32_t);                                 // block numEvents

    constexpr size_t kBlockStateOffset     =  0u;
    constexpr size_t kBlockTimeStampOffset = sizeof(uint32_t);                  // after state
    constexpr size_t kBlockCountOffset     = sizeof(uint32_t) + sizeof(double); // after state + timeStamp
	constexpr size_t kBlockNumEvOffset     = kBlockCountOffset + sizeof(uint32_t); // after count

	// this is the size of the incoming data for each block item.
    // It does not include the state field, (as it's the same for the whole block).
    constexpr size_t kBlockItemSize        = sizeof(double)                                    // timeStamp
                                           + sizeof(double)                                    // stateTime
                                           + sizeof(uint64_t)                                  // hardwareState
                                           + sizeof(uint32_t)                                  // sensorState
                                           + sizeof(double)                                    // Sensor1
                                           + sizeof(double)                                    // Sensor2
                                           + sizeof(double)                                    // lightEnvelope
                                           + CDataPacket::A2D_NUM_CHANNELS * sizeof(int32_t);  // channel data

    constexpr size_t kBlockEventSize       = sizeof(uint8_t)  // eventKind
                                   		   + sizeof(double);  // eventTimeStamp

    constexpr size_t kTelemetryPayloadSize = sizeof(double)   // timeStamp
                                           + sizeof(uint8_t)  // group
                                           + sizeof(uint8_t)  // subGroup
                                           + sizeof(uint16_t) // id
                                           + sizeof(float);   // value

    constexpr size_t kRawSignalPayloadSize = sizeof(uint32_t)  // startTick
                                           + sizeof(uint32_t)  // sample
                                           + sizeof(uint32_t); // endTick

    constexpr size_t kRawSignalHeaderSize  = sizeof(double)    // timeStamp
	                                       + sizeof(uint32_t)  // state
		                                   + sizeof(uint32_t); // count

    constexpr size_t kDebugHeaderSize      = sizeof(double)    // timeStamp
                                    	   + sizeof(uint32_t);  // state

	constexpr uint8_t kFrameStart[2] = {0xB4, 0xFA}; // common start bytes of all framing

    enum class FrameParseResult {
		TooShortForHeader,  // not enough bytes to decide
        NoHeader,           // doesn’t even start with kFrameStart
        IncompleteHeader,   // header present, but not enough bytes yet
		IncompletePacket,   // header + enough bytes, but not full packet yet
		InvalidHeader,      // header present, but unknown type
		InvalidFooter,      // ending frame invalid for frame type
        ValidPacket         // full valid frame; out.kind set, usedBytes set
    };


    // Template forward declaration
    template <typename T>
           FrameParseResult read      (const uint8_t* payload, T       & out) noexcept;

    inline FrameParseResult readI32   (const uint8_t* payload, int32_t & out) noexcept;
    inline FrameParseResult readU8    (const uint8_t* payload, uint8_t & out) noexcept;
    inline FrameParseResult readU16   (const uint8_t* payload, uint16_t& out) noexcept;
    inline FrameParseResult readU32   (const uint8_t* payload, uint32_t& out) noexcept;
	inline FrameParseResult readU64   (const uint8_t* payload, uint64_t& out) noexcept;
    inline FrameParseResult readFloat (const uint8_t* payload, float   & out) noexcept;
    inline FrameParseResult readDouble(const uint8_t* payload, double  & out) noexcept;

    FrameParseResult readDataPayload  (const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept;
    FrameParseResult readBlockPayload (const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept;
    FrameParseResult readTextPayload  (const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept;
	FrameParseResult readTelePayload  (const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept;
	FrameParseResult readSignalPayload(const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept;
	FrameParseResult readDebugPayload (const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept;


    FrameParseResult quickFrameCheck    (const uint8_t* buf, size_t len, CDecodedPacket& out, size_t& usedBytes) noexcept;
    FrameParseResult tryParseDataFrame  (const uint8_t* buf, size_t len, CDecodedPacket& out, size_t& usedBytes) noexcept;
    FrameParseResult tryParseBlockFrame (const uint8_t* buf, size_t len, CDecodedPacket& out, size_t& usedBytes) noexcept;
	FrameParseResult tryParseTeleFrame  (const uint8_t* buf, size_t len, CDecodedPacket& out, size_t& usedBytes) noexcept;
	FrameParseResult tryParseSignalFrame(const uint8_t* buf, size_t len, CDecodedPacket& out, size_t& usedBytes) noexcept;
	FrameParseResult tryParseDebugFrame (const uint8_t* buf, size_t len, CDecodedPacket& out, size_t& usedBytes) noexcept;

    static PacketKind classify(const uint8_t* buf, size_t n) noexcept;


}


PacketKind CDecoder::process(const CPacket& in, CDecodedPacket& out) noexcept
{
    constexpr size_t bloat_cutoff_size = 4096;

    out.kind = PacketKind::Unknown;

    // 1) Append new data
    if (in.bytesRead > 0 && !in.data.empty()) {
        const size_t oldSize = m_buf.size();
        m_buf.resize(oldSize + in.bytesRead);
        std::memcpy(m_buf.data() + oldSize, in.data.data(), in.bytesRead);
    }

    if (m_buf.empty())
        return PacketKind::Unknown;

    size_t usedBytes = 0;

    // 2) Check for complete frame at the start of the buffer
	FrameParseResult res = quickFrameCheck(m_buf.data(), m_buf.size(), out, usedBytes);

    switch (res)
    {
        case FrameParseResult::ValidPacket:
            m_buf.erase(m_buf.begin(), m_buf.begin() + usedBytes);
			m_badHeaderAttempts = 0;
            return out.kind;

        case FrameParseResult::IncompleteHeader:
        case FrameParseResult::IncompletePacket:
            return PacketKind::Unknown; // need more data

		case FrameParseResult::TooShortForHeader:
		case FrameParseResult::NoHeader:
		case FrameParseResult::InvalidHeader:
        {
            if (m_buf.size() < kFrameSize)
				return PacketKind::Unknown; // need more data

            uint32_t test;	readU32(m_buf.data(), test);
            if (test == CDataPacket::frameEnd || test == CBlockPacket::frameEnd || test == CTelemetryPacket::frameEnd)
            {
                // Found a frame end where we expected a start: drop it
                m_buf.erase(m_buf.begin(), m_buf.begin() + kFrameSize);
				m_badHeaderAttempts = 0;
				return PacketKind::Unknown;
            }

            // 3) Try text line (newline-terminated)
            auto itNL = std::find(m_buf.begin(), m_buf.end(), '\n');
            if (itNL != m_buf.end()) {
                size_t lineBytes = static_cast<size_t>((itNL - m_buf.begin()) + 1); // include '\n'

                size_t usedBytesText = 0;
                readTextPayload(m_buf.data(), lineBytes, out, usedBytesText);

                if (out.kind == PacketKind::Text && out.text.timeStamp == 0)
                    out.text.timeStamp = static_cast<uint32_t>(in.timestamp);
                else
                {

                    size_t frameStartIndex = m_buf.size();

                    for (size_t i = 0; i + 4 <= frameStartIndex; ++i)
                        if (IsKnownFrameHeaderAt(m_buf, i))
                            frameStartIndex = i;

                    if (frameStartIndex != m_buf.size())
                        usedBytesText = frameStartIndex;
                    else
                    {
                        // No full frame header found.
                        // Keep last 3 bytes in case they are the start of a split header:
                        // ED, ED D1, or ED D1 FA.
                        usedBytesText = m_buf.size() > 3 ? m_buf.size() - 3 : 1;
                    }
                }

                m_buf.erase(m_buf.begin(), m_buf.begin() + usedBytesText);
				m_badHeaderAttempts = 0;
                return out.kind;
            }

			if (res == FrameParseResult::InvalidHeader)
				m_badHeaderAttempts++;
			break;
        }
        
        case FrameParseResult::InvalidFooter: // resynch
			m_badHeaderAttempts++;
            break;
    }
    
    if (m_badHeaderAttempts > MAX_BADHEADER_ATTEMPTS && !m_buf.empty()) {
        m_buf.erase(m_buf.begin());  // drop 1 byte, not the whole header
        m_badHeaderAttempts = 0;
        return PacketKind::Unknown;
    }

    // 4) resynch on the header pattern further in the buffer
    if (m_buf.size() >= sizeof(kFrameStart)) {
        auto it = std::search(m_buf.begin() + 1, m_buf.end(),
                              std::begin(kFrameStart), std::end(kFrameStart));

        if (it != m_buf.end()) {
            // Drop junk before this candidate header
            m_buf.erase(m_buf.begin(), it);

            // Try again to parse a full frame at the start
            if (quickFrameCheck(m_buf.data(), m_buf.size(), out, usedBytes) == FrameParseResult::ValidPacket) {
                m_buf.erase(m_buf.begin(), m_buf.begin() + usedBytes);
                return out.kind;
            }
        }
        else if (m_buf.size() > bloat_cutoff_size) {
            // No header at all in a bloated buffer: keep only last kFrameStartSize-1 bytes
            m_buf.erase(m_buf.begin(), m_buf.end() - (sizeof(kFrameStart) - 1));
        }
    }

    return PacketKind::Unknown;
}

bool CDecoder::IsKnownFrameHeaderAt(const std::vector<uint8_t>& buf, size_t i)
{
    if (i + 4 > buf.size())
        return false;

    if (buf[i + 0] != 0xED) return false;
    if (buf[i + 2] != 0xFA) return false;
    if (buf[i + 3] != 0xB4) return false;

    switch (buf[i + 1])
    {
    case 0xD1: // Data packet
    case 0xB1: // Block packet
    case 0x71: // Telemetry packet
	case 0x51: // Raw Signal packet
	case 0x01: // Debug packet
        return true;

    default:
        return false;
    }
}


void CDecoder::reset() noexcept
{
    m_buf.clear();
	m_badHeaderAttempts = 0;
}

namespace
{

    PacketKind classify(const uint8_t* buf, size_t n) noexcept
    {
        if (n < kFrameSize) return PacketKind::Unknown;

        uint32_t start = 0; readU32(buf, start);

        switch (start)
        {
            case      CDataPacket::frameStart: return PacketKind::Data;
            case     CBlockPacket::frameStart: return PacketKind::Block;
            case CTelemetryPacket::frameStart: return PacketKind::Telemetry;
			case CRawSignalPacket::frameStart: return PacketKind::RawSignal;
			case     CDebugPacket::frameStart: return PacketKind::Debug;
            default: return PacketKind::Unknown;
        }
    }

    FrameParseResult quickFrameCheck(const uint8_t* buf, size_t len, CDecodedPacket& out, size_t& usedBytes) noexcept {
        usedBytes = 0;
        out.kind = PacketKind::Unknown;

        if (len < sizeof(kFrameStart))
            return FrameParseResult::TooShortForHeader;

        if (!std::equal(std::begin(kFrameStart), std::end(kFrameStart), buf))
            return FrameParseResult::NoHeader;

        // We know we have a header; now check minimum length for header + length field
        if (len < kFrameSize)
            return FrameParseResult::IncompleteHeader;

        // All good
        switch (classify(buf, len))
        {
            case PacketKind::Data     : return tryParseDataFrame  (buf, len, out, usedBytes);
            case PacketKind::Block    : return tryParseBlockFrame (buf, len, out, usedBytes);
            case PacketKind::Telemetry: return tryParseTeleFrame  (buf, len, out, usedBytes); 
			case PacketKind::RawSignal: return tryParseSignalFrame(buf, len, out, usedBytes);
            case PacketKind::Debug    : return tryParseDebugFrame (buf, len, out, usedBytes);
            default                   : return FrameParseResult::InvalidHeader;
        }
    }

    template <typename T>
    inline FrameParseResult read(const uint8_t* payload, T& out) noexcept {
        std::memcpy(&out, payload, sizeof(T));
        return FrameParseResult::ValidPacket;
    }

    inline FrameParseResult readI32   (const uint8_t* payload, int32_t & out) noexcept { return read(payload, out); }
    inline FrameParseResult readU8    (const uint8_t* payload, uint8_t & out) noexcept { return read(payload, out); }
    inline FrameParseResult readU16   (const uint8_t* payload, uint16_t& out) noexcept { return read(payload, out); }
    inline FrameParseResult readU32   (const uint8_t* payload, uint32_t& out) noexcept { return read(payload, out); }
    inline FrameParseResult readU64   (const uint8_t* payload, uint64_t& out) noexcept { return read(payload, out); }
    inline FrameParseResult readFloat (const uint8_t* payload, float   & out) noexcept { return read(payload, out); }
    inline FrameParseResult readDouble(const uint8_t* payload, double  & out) noexcept { return read(payload, out); }


    FrameParseResult tryParseDataFrame(const uint8_t* buf, size_t n, CDecodedPacket& out, size_t& usedBytes) noexcept
    {
        usedBytes = 0;

        constexpr size_t need = kFrameSize + sizeof(CDataPacket) + kFrameSize;
        if (n < need) return FrameParseResult::IncompletePacket;

        uint32_t start = 0; readU32(buf + 0, start);                                                    if (start != CDataPacket::frameStart) return FrameParseResult::InvalidHeader;
        uint32_t end   = 0; readU32(buf + kFrameSize + sizeof(CDataPacket), end);                       if (end   != CDataPacket::frameEnd  ) return FrameParseResult::InvalidFooter;

		FrameParseResult result = readDataPayload(buf + kFrameSize, sizeof(CDataPacket), out, usedBytes);

        if (result == FrameParseResult::ValidPacket)
            usedBytes = kFrameSize + usedBytes + kFrameSize;

        return result;
    }

    FrameParseResult tryParseBlockFrame(const uint8_t* buf, size_t n, CDecodedPacket& out, size_t& usedBytes) noexcept
    {
        usedBytes = 0;

        constexpr size_t minNeed = kFrameSize + kBlockHeaderSize + kFrameSize;                          if (n < minNeed) return FrameParseResult::IncompletePacket;

        uint32_t start = 0; readU32(buf + 0, start);                                                    if (start != CBlockPacket::frameStart) return FrameParseResult::InvalidHeader;
        uint32_t count = 0; readU32(buf + kFrameSize + kBlockCountOffset, count);
        uint32_t numEv = 0; readU32(buf + kFrameSize + kBlockNumEvOffset, numEv);

        const size_t data_bytes = static_cast<size_t>(count) * kBlockItemSize;
        const size_t eventbytes = static_cast<size_t>(numEv) * kBlockEventSize;

        const size_t payloadBytes = kBlockHeaderSize + data_bytes + eventbytes;
        const size_t need = kFrameSize + payloadBytes + kFrameSize;                                     if (n < need)  return FrameParseResult::IncompletePacket;

        uint32_t end = 0; readU32(buf + kFrameSize + payloadBytes, end);                                if (end != CBlockPacket::frameEnd) return FrameParseResult::InvalidFooter;

        FrameParseResult result = readBlockPayload(buf + kFrameSize, payloadBytes, out, usedBytes);

        if (result == FrameParseResult::ValidPacket)
            usedBytes = kFrameSize + usedBytes + kFrameSize;

        return result;
    }

    FrameParseResult tryParseTeleFrame(const uint8_t* buf, size_t n, CDecodedPacket& out, size_t& usedBytes) noexcept
    {
        usedBytes = 0;
        constexpr size_t need = kFrameSize + kTelemetryPayloadSize + kFrameSize;                        if (n < need) return FrameParseResult::IncompletePacket;
        uint32_t start = 0; readU32(buf + 0, start);                                                    if (start != CTelemetryPacket::frameStart) return FrameParseResult::InvalidHeader;
		uint32_t end   = 0; readU32(buf + kFrameSize + kTelemetryPayloadSize, end);                     if (end != CTelemetryPacket::frameEnd) return FrameParseResult::InvalidFooter;

        FrameParseResult result = readTelePayload(buf + kFrameSize, kTelemetryPayloadSize, out, usedBytes);

        if (result == FrameParseResult::ValidPacket)
            usedBytes = kFrameSize + usedBytes + kFrameSize;

        return result;
    }

    FrameParseResult tryParseSignalFrame(const uint8_t* buf, size_t n, CDecodedPacket& out, size_t& usedBytes) noexcept
    {
        usedBytes = 0;
        constexpr size_t minNeed = kFrameSize + kRawSignalHeaderSize + kFrameSize;                      if (n < minNeed) return FrameParseResult::IncompletePacket;
        uint32_t start = 0; readU32(buf + 0, start);                                                    if (start != CRawSignalPacket::frameStart) return FrameParseResult::InvalidHeader;
        uint32_t count = 0; readU32(buf + kFrameSize + sizeof(double) + sizeof(uint32_t), count);       if (count > CRawSignalPacket::MAX_SAMPLES) return FrameParseResult::InvalidHeader;

		const size_t payloadBytes = kRawSignalHeaderSize + static_cast<size_t>(count) * kRawSignalPayloadSize;
		const size_t need = kFrameSize + payloadBytes + kFrameSize;                                     if (n < need) return FrameParseResult::IncompletePacket;
		uint32_t end = 0; readU32(buf + kFrameSize + payloadBytes, end);                                if (end != CRawSignalPacket::frameEnd) return FrameParseResult::InvalidFooter;

        FrameParseResult result = readSignalPayload(buf + kFrameSize, kRawSignalHeaderSize + count * kRawSignalPayloadSize, out, usedBytes);

        if (result == FrameParseResult::ValidPacket)
			usedBytes = kFrameSize + usedBytes + kFrameSize;

		return result;
    }

    FrameParseResult tryParseDebugFrame(const uint8_t* buf, size_t n, CDecodedPacket& out, size_t& usedBytes) noexcept
    {
        usedBytes = 0;
        constexpr size_t minNeed = kFrameSize + kDebugHeaderSize + kFrameSize;                          if (n < minNeed) return FrameParseResult::IncompletePacket;
        uint32_t start = 0; readU32(buf + 0, start);                                                    if (start != CDebugPacket::frameStart) return FrameParseResult::InvalidHeader;

        const size_t need = kFrameSize + kDebugHeaderSize + kFrameSize;                                 if (n < need) return FrameParseResult::IncompletePacket;
        uint32_t end = 0; readU32(buf + kFrameSize + kDebugHeaderSize, end);                            if (end != CDebugPacket::frameEnd) return FrameParseResult::InvalidFooter;

        FrameParseResult result = readDebugPayload(buf + kFrameSize, kDebugHeaderSize, out, usedBytes);
        if (result == FrameParseResult::ValidPacket)
            usedBytes = kFrameSize + usedBytes + kFrameSize;
        return result;
    }

    /// Readers
    
    FrameParseResult readDataPayload(const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept
    {
                                                                                                		if (payloadBytes < sizeof(CDataPacket)) return FrameParseResult::IncompletePacket;
    	consumed = sizeof(CDataPacket);
		CDataPacket dp{}; memcpy(&dp, payload, consumed);
        
        out.data = dp;
        out.kind = PacketKind::Data;
        return FrameParseResult::ValidPacket;
    }

	double lastTimeStamp = 0;


    FrameParseResult readBlockPayload(const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept
    {
                                                                                                        if (payloadBytes < kBlockHeaderSize) return FrameParseResult::IncompleteHeader;
        uint32_t state = 0; readU32   (payload + kBlockStateOffset,     state);
        double   ts    = 0; readDouble(payload + kBlockTimeStampOffset, ts   );
		uint32_t count = 0; readU32   (payload + kBlockCountOffset,     count);                         if (count > CBlockPacket::MAX_BLOCK_SIZE       && _DEBUG) ::OutputDebugString(L"CDecoder: Block count exceeds maximum allowed size.");
   		uint32_t numEv = 0; readU32   (payload + kBlockNumEvOffset,     numEv);                         if (numEv > CBlockPacket::MAX_EVENTS_PER_BLOCK && _DEBUG) ::OutputDebugString(L"CDecoder: Event count exceeds maximum allowed size.");

        const size_t itemsBytes = static_cast<size_t>(count) * kBlockItemSize;
        const size_t eventbytes = static_cast<size_t>(numEv) * kBlockEventSize;
        const size_t need = kBlockHeaderSize + itemsBytes + eventbytes;
        
        if (payloadBytes < need) return FrameParseResult::IncompletePacket;

		CBlockPacket& bp = out.block;

        bp.state     = state;
        bp.timeStamp = ts;
        bp.count     = count;
		bp.numEvents = numEv;

        // Copy the packed Data items
        const uint8_t* rP = payload + kBlockHeaderSize;

//        uint32_t lastValue;
        for (uint32_t i = 0; i < count; ++i)
        {
            CDataPacket& dp = bp.blockData[i];
            dp.state = state; // shared block state

			readDouble(rP, dp.timeStamp    ); rP += sizeof(double  );
            readDouble(rP, dp.stateTime    ); rP += sizeof(double  );
            readU64   (rP, dp.hardwareState); rP += sizeof(uint64_t);
            readU32   (rP, dp.sensorState  ); rP += sizeof(uint32_t);
            readDouble(rP, dp.Sensor1      ); rP += sizeof(double  );
            readDouble(rP, dp.Sensor2      ); rP += sizeof(double  );
            readDouble(rP, dp.lightEnvelope); rP += sizeof(double  );

            for (size_t ch = 0; ch < CDataPacket::A2D_NUM_CHANNELS; ++ch, rP += sizeof(int32_t))
                readI32(rP, dp.channel[ch]);
        }

        for (uint32_t i = 0; i < count; ++i)
        {
            CDataPacket& dp = bp.blockData[i];

            if (dp.timeStamp < lastTimeStamp)
                dp.timeStamp = lastTimeStamp; // prevent time going backwards in case of bad data

        }


        for (uint32_t i = 0; i < numEv; ++i)
        {
            CEventPacket& ep = bp.eventData[i];

			uint8_t eventKind;

            readU8    (rP,    eventKind ); rP += sizeof(uint8_t);
            readDouble(rP, ep.stateTime ); rP += sizeof(double);

			ep.eventKind = static_cast<uint32_t>(eventKind);
        }



        consumed = need;
        out.block = bp;
        out.kind = PacketKind::Block;

        return FrameParseResult::ValidPacket;
    }
#if _DEBUG == 0
#undef _DEBUG
#endif // _DEBUG

    FrameParseResult readTextPayload(const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept
    {
        CTextPacket tp{};
        size_t len = std::min(payloadBytes, CTextPacket::MAX_TEXT_SIZE - 1u);

        for (const uint8_t* p = payload, *end = payload + len; p != end; p++)
            if (*p > 0x7F) return FrameParseResult::InvalidHeader; 

        memcpy_s(tp.utf8Bytes, CTextPacket::MAX_TEXT_SIZE, payload, len);
        tp.utf8Bytes[len] = '\0';
        tp.length = static_cast<uint32_t>(len-1);  // ignore terminator

        consumed = len;
        out.text = tp;
        out.kind = PacketKind::Text;

        return FrameParseResult::ValidPacket;
    }

	FrameParseResult readTelePayload(const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept
    {
                                                                                                        if (payloadBytes < kTelemetryPayloadSize) return FrameParseResult::IncompletePacket;
        CTelemetryPacket tp{};
        size_t offset = 0, storedOffset = 0;
		readDouble(payload + offset, tp.timeStamp); offset += sizeof(double); storedOffset = offset;
        readU8    (payload + offset, tp.group    ); offset += sizeof(uint8_t);
		readU8    (payload + offset, tp.subGroup ); offset += sizeof(uint8_t);
        readU16   (payload + offset, tp.id       ); offset += sizeof(uint16_t);
        readFloat (payload + offset, tp.value    ); offset += sizeof(float);

		readU32(payload + storedOffset, tp.key); // includes group, subGroup, id, not value

        consumed = offset;
        out.telemetry = tp;
        out.kind = PacketKind::Telemetry;
        return FrameParseResult::ValidPacket;
	}

    FrameParseResult readSignalPayload(const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept
    {
                                                                                                        if (payloadBytes < kRawSignalHeaderSize) return FrameParseResult::IncompleteHeader;
        CRawSignalPacket dp{};
        size_t offset = 0;
        readDouble(payload + offset, dp.timeStamp); offset += sizeof(double);
        readU32   (payload + offset, dp.state    ); offset += sizeof(uint32_t);
        readU32   (payload + offset, dp.count    ); offset += sizeof(uint32_t);                         if (dp.count > CRawSignalPacket::MAX_SAMPLES) return FrameParseResult::InvalidHeader;

        const size_t dataBytes = static_cast<size_t>(dp.count) * kRawSignalPayloadSize;
        const size_t need = kRawSignalHeaderSize + dataBytes;
        if (payloadBytes < need) return FrameParseResult::IncompletePacket;
        for (uint32_t i = 0; i < dp.count; ++i)
        {
            CSignalData& sd = dp.data[i];

            readI32(payload + offset, sd.startTick); offset += sizeof(int32_t);
            readI32(payload + offset, sd.sample   ); offset += sizeof(int32_t);
			// ignore reserved field, not transmitted
            readI32(payload + offset, sd.endTick  ); offset += sizeof(int32_t);
        }
        consumed = need;
        out.rawSignal = dp;
        out.kind = PacketKind::RawSignal;
		return FrameParseResult::ValidPacket;
    }

    FrameParseResult readDebugPayload(const uint8_t* payload, size_t payloadBytes, CDecodedPacket& out, size_t& consumed) noexcept
    {
                                                                                                        if (payloadBytes < kDebugHeaderSize) return FrameParseResult::IncompleteHeader;
        CDebugPacket dp{};
        size_t offset = 0;
        readDouble(payload + offset, dp.timeStamp); offset += sizeof(double);
        readU32   (payload + offset, dp.state    ); offset += sizeof(uint32_t);
        consumed = offset;
        out.debug = dp;
		out.kind = PacketKind::Debug;
        return FrameParseResult::ValidPacket;
    }
}

#pragma managed(pop)