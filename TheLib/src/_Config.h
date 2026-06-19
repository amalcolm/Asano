#pragma once

using namespace System;

namespace TheLib
{

    public ref class Config
    {
    public:
        static UInt32  STATE_DURATION_uS     =  3'000;  // time for each state.
        static UInt32  HEAD_SETTLE_TIME_uS   =    440;  // delay between Head change and first A2D read
        static UInt32  POT_UPDATE_OFFSET_uS  =    667;  // A2D read -> Potentiometer update offset, minimizes interference
        static UInt32  A2D_SAMPLING_SPEED_Hz =  2'000;  // A2D sampling speed 
        static UInt32  A2D_READING_PERIOD_uS =    900;  // A2D reading speed when in triggered mode
        static UInt32  MAX_BLOCKSIZE         =    164;  // max number of DataType entries in a BlockType
		static UInt32  MAX_EVENTS_PER_BLOCK  =    400;  // max number of EventType entries in a BlockType
        static String^ DEBUG_MODE            =  "OFF";  // "OFF", "SINGLE_STATE"
        static UInt32  COMMAND_FLAGS         =      0;  // command flags last reported by the device

        static String^ ProgramVersion = "v1.6.0";
        static String^ DeviceVersion  = String::Empty;
        static double ChannelScale = 1.0 / 466010000.0;
        static double C0to1024     = 1.0 / 5000.0;

        static void ParseHandshakeResponse(System::String^ response);
    };

}
