#pragma once
#pragma managed(push, off)

#define WIN32_LEAN_AND_MEAN
#include <Windows.h>
#include <cstdint>
#include <cstddef>
#include <type_traits>
#include <vector>

using Frame = uint32_t;

// ----------------------------- Native carrier --------------------------------
struct CPacket {
    double                timestamp{};  // arrival time (optional)
    std::vector<BYTE>     data{};       // raw bytes from device
    uint32_t              bytesRead{};  // valid byte count in data

    inline bool isEmpty() const { return bytesRead == 0; }
};

// ----------------------------- Wire structs ----------------------------------
#pragma pack(push, 1)

struct CDataPacket
{
    static constexpr uint8_t A2D_NUM_CHANNELS = 8;

	static constexpr Frame frameStart = 0xED'D1'FA'B4;  // D1/D2 = Data Packet
    static constexpr Frame frameEnd   = 0xED'D2'FA'B4;

    uint32_t state{};
    double   timeStamp{};
    double   stateTime{};
    uint64_t hardwareState{};
	uint32_t sensorState{};
    float    Sensor1;
	float    Sensor2;
    uint32_t channel[A2D_NUM_CHANNELS]{};

    static constexpr uint32_t STATE_UNSET = 0b1000'0000'0000'0000'0000'0000'0000'0000;
};

struct CEventPacket
{
    uint32_t eventKind{};
    double   stateTime{};
};

struct CBlockPacket
{
    static constexpr size_t MAX_BLOCK_SIZE = 164;
	static constexpr size_t MAX_EVENTS_PER_BLOCK = 512;

	static constexpr Frame frameStart = 0xED'B1'FA'B4;  // B1/B2 = Block Packet
    static constexpr Frame frameEnd   = 0xED'B2'FA'B4;

    uint32_t state{};
    double   timeStamp{};
    uint32_t count{}; // number of valid entries in blockData
    CDataPacket   blockData[MAX_BLOCK_SIZE]{};

	uint32_t numEvents{}; // number of valid entries in eventData
	CEventPacket  eventData[MAX_EVENTS_PER_BLOCK]{};
};

struct CTextPacket
{
    static constexpr size_t MAX_TEXT_SIZE = 4096;

	uint32_t timeStamp{};
	uint32_t length{}; // number of valid bytes in text
    uint8_t  utf8Bytes[MAX_TEXT_SIZE]{};
};

struct CTelemetryPacket
{
	static constexpr Frame frameStart = 0xED'71'FA'B4;  // 71/72 = Telemetry Packet
    static constexpr Frame frameEnd   = 0xED'72'FA'B4;
  
    double   timeStamp{};
	uint8_t  group{};
	uint8_t  subGroup{};
    uint16_t id{};
    float    value{};

    uint32_t key{};
};

struct CDebugData
{
    int32_t  startTick{};
    int32_t  sample{};
    int32_t  endTick{};
};

struct CDebugPacket
{
	static constexpr size_t MAX_DEBUG_DATA = 4096;

    static constexpr Frame frameStart = 0xED'01'FA'B4;  // 01/02 = Debug Packet
    static constexpr Frame frameEnd   = 0xED'02'FA'B4;
    double   timeStamp{};
    uint32_t state{};
    uint32_t count{};
    CDebugData data[MAX_DEBUG_DATA]{};
};

#pragma pack(pop)

// Sizes & sanity checks (same endianness is assumed by design)
static_assert(std::is_trivially_copyable_v<CDataPacket> , "CDataPacket must be POD");
static_assert(std::is_trivially_copyable_v<CBlockPacket>, "CBlockPacket must be POD");

static_assert(sizeof(CDataPacket) ==
    sizeof(uint32_t) + sizeof(double) + sizeof(double) + sizeof(uint64_t) + sizeof(uint32_t) + sizeof(float) + sizeof(float) + CDataPacket::A2D_NUM_CHANNELS * sizeof(uint32_t),
    "Unexpected CDataPacket layout/packing");

static_assert(offsetof(CBlockPacket, blockData) ==
	sizeof(uint32_t) + sizeof(double) + sizeof(uint32_t),
    "Unexpected CBlockPacket header layout");


// ----------------------------- Tagged result ---------------------------------
enum class PacketKind : uint8_t { Unknown = 0, Data = 1, Block = 2, Telemetry = 3, Text = 4, Debug = 5 };

struct CDecodedPacket
{
    PacketKind kind{ PacketKind::Unknown };
    union {
        CDataPacket      data;
        CBlockPacket     block;
        CTextPacket      text;
		CTelemetryPacket telemetry;
		CDebugPacket     debug;
    };

    CDecodedPacket() noexcept {} // POD; union members are zero-inited by caller when used
};


#pragma managed(pop)
