#pragma once
#include <stdint.h>

using namespace System;
using namespace System::Runtime::InteropServices;

namespace TheLib::Packets
{
	static const uint8_t XCMD_MAGIC[4] = { 0x58, 0x43, 0x00, 0xFF };

    [FlagsAttribute]

    public enum class CommandFlags : uint32_t {
        None = 0,
        HoldWipers     = 0x02,
        HoldSensor2    = 0x04,
        RunDebug       = 0x80,

        Run__findSignal  = 0x100,
		RunGetNoiseSample = 0x200,
    };


    public interface class IXCommand
    {
        property Byte CommandID { Byte get(); }
    };

    [StructLayoutAttribute(LayoutKind::Sequential, Pack = 1)]
    public value struct XCMD_Header
    {
        Byte magic0;
        Byte magic1;
        Byte id;
        Byte magic3;
        CommandFlags cmdFlags;

        literal uint32_t CommandBytePresent = 0x0100'0000;
        literal uint32_t CommandByteShift   = 16;

    };

	[StructLayoutAttribute(LayoutKind::Sequential, Pack = 1)]
    public ref struct XCMD_SetWipers : IXCommand
    {
        literal Byte ID = 0x01;        virtual property Byte CommandID { Byte get() { return ID; } }
        XCMD_Header header;

        Byte top;
        Byte bot;
        Byte mid;

        Byte offset;
        Byte gain;

        Byte _reserved1;
        Byte _reserved2;
        Byte _reserved3;

        property CommandFlags cmdFlags
        {
            CommandFlags get() { return header.cmdFlags; }
            void set(CommandFlags value) { header.cmdFlags = value; }
        }
    };

    [StructLayoutAttribute(LayoutKind::Sequential, Pack = 1)]
    public ref struct XCMD_SetState : IXCommand
    {
        literal Byte ID = 0x02;        virtual property Byte CommandID { Byte get() { return ID; } }
        XCMD_Header header;

        uint32_t state;

        property CommandFlags cmdFlags
        {
            CommandFlags get() { return header.cmdFlags; }
            void set(CommandFlags value) { header.cmdFlags = value; }
        }
    };

    [StructLayoutAttribute(LayoutKind::Sequential, Pack = 1)]
    public ref struct XCMD_SetDebugFlags : IXCommand
    {
        literal Byte ID = 0x03;        virtual property Byte CommandID { Byte get() { return ID; } }
        XCMD_Header header;

        property CommandFlags cmdFlags
        {
            CommandFlags get() { return header.cmdFlags; }
            void set(CommandFlags value) { header.cmdFlags = value; }
        }
    };

    [StructLayoutAttribute(LayoutKind::Sequential, Pack = 1)]
    public ref struct XCMD_SetActiveState : IXCommand
    {
        literal Byte ID = 0x04;        virtual property Byte CommandID { Byte get() { return ID; } }
        XCMD_Header header;

        uint32_t state;

        property CommandFlags cmdFlags
        {
            CommandFlags get() { return header.cmdFlags; }
            void set(CommandFlags value) { header.cmdFlags = value; }
        }
    };

    [StructLayoutAttribute(LayoutKind::Sequential, Pack = 1)]
    public ref struct XCMD_SetSequence : IXCommand
    {
        literal Byte ID = 0x05;        virtual property Byte CommandID { Byte get() { return ID; } }
        literal int MAX_STATES = 64;

        XCMD_Header header;

        Byte count;
        Byte _reserved1;
        Byte _reserved2;
        Byte _reserved3;

        [MarshalAs(UnmanagedType::ByValArray, SizeConst = 64)]
        array<uint32_t>^ states;

        XCMD_SetSequence()
        {
            count = 0;
            states = gcnew array<uint32_t>(MAX_STATES);
        }

        property CommandFlags cmdFlags
        {
            CommandFlags get() { return header.cmdFlags; }
            void set(CommandFlags value) { header.cmdFlags = value; }
        }
    };
}
