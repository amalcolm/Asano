#pragma once

#pragma managed(push, off)
#include "CPackets.h"
#pragma managed(pop)

#pragma managed(push, on)

#include "..\AString.h"

using namespace System;
using namespace System::Collections::Concurrent;

namespace TheLib
{
    public enum class HeadState : System::UInt32
    {
        None = 0,
		UNSET = 1U << 31,
    };

    ref struct Packet
    {
    internal:
        static ConcurrentQueue<Packet^>^ s_pool = gcnew ConcurrentQueue<Packet^>();

        // Rent from pool or allocate a new one.
        static Packet^ Rent();

        // C++/CLI destructor == IDisposable.Dispose
        ~Packet();         // deterministic return to pool
        !Packet();         // finalizer (avoid doing anything heavy)

        // Reset clears instance state before reusing
        void Reset();

        // Payload
        property double Timestamp;
        property array<Byte>^ Data;
        property UInt32 BytesRead;

    protected:
        Packet();        // real constructor is protected
    };


	public interface class IPacket
    {
        property double    TimeStamp;
        property HeadState State;

        virtual void Cleanup();
    };

    public enum class FieldEnum
    {
        Timestamp,
		C0, C1, C2, C3, C4, C5, C6, C7,
        Events,

        Mid,
        Top,
		Bot,
        Offset,
        Gain,
		rawSensor1,
		rawSensor2,
        Sensor1,
        Sensor2,
    };

	public ref class DataPacket : IPacket, IDisposable
    {
    private:
        static constexpr System::UInt64 WordMask = 0xFFFFull;
		static constexpr System::UInt64 ByteMask = 0x00FFull;

    public:
		static DataPacket^ Rent();
		virtual void Cleanup();

        ~DataPacket();
		!DataPacket();

		void Reset();

        virtual property HeadState State;
        virtual property double    TimeStamp;

		property double         StateTime;
        property System::UInt64 HardwareState;
        property int            SensorState;
		property double         Sensor1;
		property double         Sensor2;
        property double         LightEnvelope;

        property array<unsigned int>^ Channel;


        property int Mid            { int get() { return (int)((HardwareState >> 56) & ByteMask); } }
        property int Top            { int get() { return (int)((HardwareState >> 48) & ByteMask); } }
        property int Bot            { int get() { return (int)((HardwareState >> 40) & ByteMask); } }
        property int SequenceNumber { int get() { return (int)((HardwareState >> 32) & ByteMask); } }
        property int Offset         { int get() { return (int)((HardwareState >> 24) & ByteMask); } }
        property int Gain           { int get() { return (int)((HardwareState >> 16) & ByteMask); } }
        property int _Reserved      { int get() { return (int)((HardwareState      ) & WordMask); } }
        property int RawSensor1     { int get() { return (int)((SensorState   >> 16) & WordMask); } }
		property int RawSensor2     { int get() { return (int)((SensorState        ) & WordMask); } }



        double get(FieldEnum field) {
            switch (field) {
                case FieldEnum::Timestamp:  return StateTime;
                case FieldEnum::C0:         return Channel[0];
				case FieldEnum::C1:         return Channel[1];
				case FieldEnum::C2:         return Channel[2];
				case FieldEnum::C3:         return Channel[3];
				case FieldEnum::C4:         return Channel[4];
				case FieldEnum::C5:         return Channel[5];
				case FieldEnum::C6:         return Channel[6];
				case FieldEnum::C7:         return Channel[7];
				case FieldEnum::Top:        return Top;
				case FieldEnum::Bot:        return Bot;
                case FieldEnum::Mid:        return Mid;
                case FieldEnum::rawSensor1: return RawSensor1;
                case FieldEnum::rawSensor2: return RawSensor2;
                case FieldEnum::Offset:     return Offset;
                case FieldEnum::Gain:       return Gain;
                case FieldEnum::Sensor1:    return Sensor1;
                case FieldEnum::Sensor2:    return Sensor2;
                default:                    return Double::NaN;
			}
        }

        void CopyFrom(DataPacket^ other) {
            State = other->State;
            TimeStamp = other->TimeStamp;
            StateTime = other->StateTime;
            HardwareState = other->HardwareState;
            SensorState = other->SensorState;
            Sensor1 = other->Sensor1;
            Sensor2 = other->Sensor2;

            if (other->Channel == nullptr) return;

            if (Channel == nullptr || Channel->Length != other->Channel->Length)
                Channel = gcnew array<unsigned int>(other->Channel->Length);
            Array::Copy(other->Channel, Channel, other->Channel->Length);
		}
    
    protected:
		DataPacket();
        static ConcurrentQueue<DataPacket^>^ s_pool = gcnew ConcurrentQueue<DataPacket^>();
    };


    public enum class EventKind : System::UInt32
    {
        NONE = 0,

        A2D_DATA_READY     = 0x11,
		A2D_READ_START     = 0x12,
		A2D_READ_COMPLETE  = 0x13,
   
        HW_UPDATE_START    = 0x21,
        HW_UPDATE_COMPLETE = 0x22,
   
        SPI_DMA_START      = 0x31,
        SPI_DMA_COMPLETE   = 0x32,
    
        RESERVED = 255
    };

    public ref class EventPacket : IDisposable
    {
    public:
        static EventPacket^ Rent();
		virtual void Cleanup();

        ~EventPacket();
        !EventPacket();

        void Reset();
        property EventKind Kind;
        property double    StateTime;

    protected:
        EventPacket();

        static ConcurrentQueue<EventPacket^>^ s_pool = gcnew ConcurrentQueue<EventPacket^>();
    };

	public ref class BlockPacket : IPacket, IDisposable
    {
    public:
		static BlockPacket^ Rent();
        virtual void Cleanup();

		~BlockPacket();
		!BlockPacket();

		void Reset();

        virtual property HeadState    State;
        virtual property double       TimeStamp;

        property int                  Count;
		property int				  NumEvents;
        property array<DataPacket^>^  BlockData;
		property array<EventPacket^>^ EventData;

	protected:
		BlockPacket();

		static ConcurrentQueue<BlockPacket^>^ s_pool = gcnew ConcurrentQueue<BlockPacket^>();
    };

	public ref class TextPacket : IPacket, IDisposable
	{
    public:
        static TextPacket^ Rent();
        virtual void Cleanup();

        ~TextPacket();
        !TextPacket();
        
        void Reset();

        virtual property HeadState State;
        virtual property double    TimeStamp;

        property AString^   Text;
		property int        Length;

    protected:
        TextPacket();
        static ConcurrentQueue<TextPacket^>^ s_pool = gcnew ConcurrentQueue<TextPacket^>();
	};

    public ref class TelemetryPacket : IPacket, IDisposable
	{
    public:
        enum class TeleGroup : System::Byte
        {
			NONE     = 0x00,
            Program  = 0x01,
			Hardware = 0x02,

            A2D      = 0x11,
            DigiPots = 0x12,
            USB      = 0x13,
            Head     = 0x14,
            Timer    = 0x15,

			UNSET    = 0xFF,
		};

        static TelemetryPacket^ Rent();
        virtual void Cleanup();

        ~TelemetryPacket();
        !TelemetryPacket();
        
        void Reset();
        virtual property HeadState State;
        virtual property double    TimeStamp;

		property TeleGroup Group;
        property int       SubGroup;
        property int       ID;
        property float     Value;

        property UInt32    Key;

    protected:
        TelemetryPacket();
        static ConcurrentQueue<TelemetryPacket^>^ s_pool = gcnew ConcurrentQueue<TelemetryPacket^>();
	};

    public value struct SignalData
    {
        int32_t StartTick;
		int32_t Sample;
        int32_t EndTick;
	};

    public ref class RawSignalPacket : IPacket, IDisposable
    {
    public:
        static property int MAX_SAMPLES { int get(); }

        static RawSignalPacket^ Rent();
        virtual void Cleanup();
        ~RawSignalPacket();
        !RawSignalPacket();

        void Reset();
        virtual property HeadState State;
        virtual property double    TimeStamp;
        property int       Count;
        property array<SignalData>^ Data;

    protected:
        RawSignalPacket();
        static ConcurrentQueue<RawSignalPacket^>^ s_pool = gcnew ConcurrentQueue<RawSignalPacket^>();
    };



    public ref class DebugPacket : IPacket, IDisposable
	{
        public:
        static DebugPacket^ Rent();
        virtual void Cleanup();
        ~DebugPacket();
        !DebugPacket();
        
        void Reset();
        virtual property HeadState State;
        virtual property double    TimeStamp;

    protected:
        DebugPacket();
        static ConcurrentQueue<DebugPacket^>^ s_pool = gcnew ConcurrentQueue<DebugPacket^>();
	};
}

#pragma managed(pop)
