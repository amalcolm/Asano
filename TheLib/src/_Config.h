#pragma once

using namespace System;
using namespace System::Collections::Generic;

namespace TheLib
{
    public ref class HeadTestSequenceConfig sealed
    {
    public:
        HeadTestSequenceConfig()
        {
            Name = String::Empty;
            States = gcnew array<UInt32>(0);
        }

        HeadTestSequenceConfig(String^ name, array<UInt32>^ states)
        {
            Name = name == nullptr ? String::Empty : name;
            States = states == nullptr ? gcnew array<UInt32>(0) : states;
        }

        property String^ Name;
        property array<UInt32>^ States;
    };

    public enum class DebugMode {
        OFF = 0,
        ON = 1,
        SINGLE_STATE = 2,

        MASTER = 10, // for testing with another Teensy
        TESTER1 = 11,

        none = 255
    };

    public ref class DeviceConfig sealed
    {
    public:
        DeviceConfig();

        UInt32 STATE_DURATION_uS     = 3'000;
        UInt32 HEAD_SETTLE_TIME_uS   =   440;
        UInt32 POT_UPDATE_OFFSET_uS  =   667;
        UInt32 A2D_SAMPLING_SPEED_Hz = 2'000;
        UInt32 A2D_READING_PERIOD_uS =   900;
        UInt32 MAX_BLOCKSIZE         =   164;
        UInt32 MAX_EVENTS_PER_BLOCK  =   400;
        UInt32 MAX_SEQUENCE_STATES   =    64;
        String^ DEBUG_MODE           = "OFF";
        UInt32 COMMAND_FLAGS         =     0;
        List<HeadTestSequenceConfig^>^ TEST_SEQUENCES;
        String^ DeviceVersion        = String::Empty;

        void ResetHandshakeConfig();
        void ParseHandshakeResponse(String^ response);
    };

    public ref class Config
    {
    public:
        static UInt32     STATE_DURATION_uS     =  3'000;  // time for each state.
        static UInt32     HEAD_SETTLE_TIME_uS   =    440;  // delay between Head change and first A2D read
        static UInt32     POT_UPDATE_OFFSET_uS  =    667;  // A2D read -> Potentiometer update offset, minimizes interference
        static UInt32     A2D_SAMPLING_SPEED_Hz =  2'000;  // A2D sampling speed
        static UInt32     A2D_READING_PERIOD_uS =    900;  // A2D reading speed when in triggered mode
        static UInt32     MAX_BLOCKSIZE         =    164;  // max number of DataType entries in a BlockType
		static UInt32     MAX_EVENTS_PER_BLOCK  =    400;  // max number of EventType entries in a BlockType
        static UInt32     MAX_SEQUENCE_STATES   =     64;  // max number of states in a sequence command
        static DebugMode  DEBUG_MODE            =  DebugMode::OFF;  // "OFF", "SINGLE_STATE"
        static UInt32     COMMAND_FLAGS         =      0;  // command flags last reported by the device
        static List<HeadTestSequenceConfig^>^ TEST_SEQUENCES = gcnew List<HeadTestSequenceConfig^>();

        static String^ ProgramVersion = "v1.6.0";
        static String^ DeviceVersion  = String::Empty;
        static double ChannelScale = 1.0 / 466010000.0;
        static double C0to1024     = 1.0 / 5000.0;

        static void ResetHandshakeConfig();
        static void ParseHandshakeResponse(System::String^ response);
        static void ApplyDeviceConfig(DeviceConfig^ config);
    };

}
