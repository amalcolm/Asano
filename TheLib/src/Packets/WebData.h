#pragma once
#include "Packets.h"
#include "XCommands.h"

using namespace System;
using namespace System::Text::Json::Serialization;


namespace TheLib::Packets
{

    public interface class IWebMessage
    {
        [JsonPropertyName("type")] property String^ Type { String^ get(); }
        [JsonPropertyName("cmdFlags")] property CommandFlags CMDflags { CommandFlags get(); }
    };


    public ref class VoltageValues sealed
    {
    private:
        literal float Scalar = 3.3f / 1023.0f;

    public:
        [JsonPropertyName("sensor1")] property float Sensor1;
        [JsonPropertyName("sensor2")] property float Sensor2;

        VoltageValues() { Sensor1 = 0.0f; Sensor2 = 0.0f; }

        void CopyFrom(BlockPacket^ block) {if (block == nullptr || block->Count <= 0 || block->BlockData == nullptr) return;

            DataPacket^ data = block->BlockData[block->Count - 1];                              if (data == nullptr) return;

            Sensor1 = data->Sensor1 * Scalar;
            Sensor2 = data->Sensor2 * Scalar;
        }
        void CopyFrom(VoltageValues^ other) { if (other == nullptr) return;
            Sensor1 = other->Sensor1;
            Sensor2 = other->Sensor2;
        }

        [JsonIgnore]  property bool IsValid { bool get() { return Sensor1 != 0.0f || Sensor2 != 0.0f; } }

        virtual bool Equals(Object^ obj) override
        {
            VoltageValues^ other = dynamic_cast<VoltageValues^>(obj); if (other == nullptr) return false;

            return Sensor1 == other->Sensor1 && Sensor2 == other->Sensor2;
        }

        virtual int GetHashCode() override
        {
            int hash = 17;
            hash = hash * 31 + Sensor1.GetHashCode();
            hash = hash * 31 + Sensor2.GetHashCode();
            return hash;
        }
    };


    public ref class WiperValues sealed
    {
    private:
        bool _hasValues;

    public:
        [JsonPropertyName("top"   )] property int Top;
        [JsonPropertyName("bot"   )] property int Bot;
        [JsonPropertyName("mid"   )] property int Mid;
        [JsonPropertyName("offset")] property int Offset;
        [JsonPropertyName("gain"  )] property int Gain;

        WiperValues() { Top = 0; Bot = 0; Mid = 0; Offset = 0; Gain = 0; _hasValues = false; }

        void CopyFrom(BlockPacket^ block) { if (block == nullptr || block->Count <= 0 || block->BlockData == nullptr) return;

            DataPacket^ data = block->BlockData[block->Count - 1];                               if (data == nullptr) return;

            Top    = data->Top;
            Bot    = data->Bot;
            Mid    = data->Mid;
            Offset = data->Offset;
            Gain   = data->Gain;

            _hasValues = true;
        }

        void CopyFrom(WiperValues^ other) { if (other == nullptr) return;

            Top    = other->Top;
            Bot    = other->Bot;
            Mid    = other->Mid;
            Offset = other->Offset;
            Gain   = other->Gain;

            _hasValues = other->_hasValues;
        }

        [JsonIgnore] property bool IsValid { bool get() { return _hasValues; } }

        virtual bool Equals(Object^ obj) override
        {
            WiperValues^ other = dynamic_cast<WiperValues^>(obj);  if (other == nullptr)     return false;

            return Top == other->Top && Bot == other->Bot && Mid == other->Mid
                && Offset == other->Offset && Gain == other->Gain;
        }

        virtual int GetHashCode() override
        {
            int hash = 17;
            hash = hash * 31 + Top;
            hash = hash * 31 + Bot;
            hash = hash * 31 + Mid;
            hash = hash * 31 + Offset;
            hash = hash * 31 + Gain;
            return hash;
        }
    };


    public ref class VoltagesChangedMessage sealed : public IWebMessage
    {
    private:
        String^ _type;
        CommandFlags _cmdFlags;
        VoltageValues^ _voltages;
		
    public:
        VoltagesChangedMessage() { _type = "voltagesChanged"; _cmdFlags = CommandFlags::None; _voltages = gcnew VoltageValues(); }

        [JsonPropertyName("type"    )] virtual property String^        Type     { String^        get() { return _type;     } void set(String^        value) {     _type = value; } }
        [JsonPropertyName("cmdFlags")] virtual property CommandFlags   CMDflags { CommandFlags   get() { return _cmdFlags; } };
        [JsonPropertyName("voltages")]         property VoltageValues^ Voltages { VoltageValues^ get() { return _voltages; } void set(VoltageValues^ value) { _voltages = value; } }
        void CopyFrom(BlockPacket^ block) { if (Voltages == nullptr) Voltages = gcnew VoltageValues();
        
            Voltages->CopyFrom(block); 
			_cmdFlags = CommandFlags::None; 
        }

        void CopyFrom(VoltagesChangedMessage^ other) { if (other == nullptr) return; if (Voltages == nullptr) Voltages = gcnew VoltageValues();

            Voltages->CopyFrom(other->Voltages);
            _cmdFlags = other->_cmdFlags;
        }

        [JsonIgnore] property bool IsValid { bool get() { return Voltages != nullptr && Voltages->IsValid; } }

        virtual bool Equals(Object^ obj) override { VoltagesChangedMessage^ other = dynamic_cast<VoltagesChangedMessage^>(obj); if (other == nullptr) return false;

            return String::Equals(Type, other->Type) && Object::Equals(Voltages, other->Voltages);
        }

        virtual int GetHashCode() override
        {
            int hash = 17;
            hash = hash * 31 + (Type     == nullptr ? 0 :     Type->GetHashCode());
            hash = hash * 31 + (Voltages == nullptr ? 0 : Voltages->GetHashCode());
            return hash;
        }
    };


    public ref class WipersChangedMessage sealed : public IWebMessage
    {
    private:
        String^ _type;
        CommandFlags _cmdFlags;
        WiperValues^ _wipers;

    public:
        WipersChangedMessage() { _type = "wipersChanged"; _cmdFlags = CommandFlags::None; _wipers = gcnew WiperValues(); }

        [JsonPropertyName("type"    )] virtual property String^      Type     { String^      get() { return _type;     } void set(String^      value) { _type   = value; } }
        [JsonPropertyName("cmdFlags")] virtual property CommandFlags CMDflags { CommandFlags get() { return _cmdFlags; } };
        [JsonPropertyName("wipers"  )]         property WiperValues^ Wipers   { WiperValues^ get() { return _wipers;   } void set(WiperValues^ value) { _wipers = value; } }

        void CopyFrom(BlockPacket^ block) { if (Wipers == nullptr) Wipers = gcnew WiperValues();
            Wipers->CopyFrom(block);
			_cmdFlags = CommandFlags::None;
        }

        void CopyFrom(WipersChangedMessage^ other) { if (other == nullptr) return; if (Wipers == nullptr) Wipers = gcnew WiperValues();
            Wipers->CopyFrom(other->Wipers);
			_cmdFlags = other->_cmdFlags;
        }

        [JsonIgnore] property bool IsValid { bool get() { return Wipers != nullptr && Wipers->IsValid; } }

        virtual bool Equals(Object^ obj) override { WipersChangedMessage^ other = dynamic_cast<WipersChangedMessage^>(obj); if (other == nullptr) return false;

            return String::Equals(Type, other->Type) && Object::Equals(Wipers, other->Wipers);
        }

        virtual int GetHashCode() override
        {
            int hash = 17;
            hash = hash * 31 + (Type   == nullptr ? 0 :   Type->GetHashCode());
            hash = hash * 31 + (Wipers == nullptr ? 0 : Wipers->GetHashCode());
            return hash;
        }
    };

    public ref class StateChangedMessage sealed : public IWebMessage
    {
    private:
        String^ _type;
        CommandFlags _cmdFlags;
		HeadState _state;

    public:
        StateChangedMessage(HeadState state) { _type = "stateChanged"; _cmdFlags = CommandFlags::None; _state = state; }
        [JsonPropertyName("type"    )] virtual property String^      Type     { String^      get() { return _type;     } void set(String^      value) { _type     = value; } }
        [JsonPropertyName("cmdFlags")] virtual property CommandFlags CMDflags { CommandFlags get() { return _cmdFlags; } void set(CommandFlags value) { _cmdFlags = value; } };
        [JsonPropertyName("state"   )]         property HeadState    State    { HeadState    get() { return _state;    } void set(HeadState    value) { _state    = value; } }

        void CopyFrom(BlockPacket^ block) { if (block == nullptr || block->Count <= 0 || block->BlockData == nullptr) return;
            DataPacket^ data = block->BlockData[block->Count - 1];                               if (data == nullptr) return;
			State = static_cast<HeadState>(data->State);
			_cmdFlags = CommandFlags::None;
            }

        void CopyFrom(StateChangedMessage^ other) { if (other == nullptr) return;
            State = other->State;
			_cmdFlags = other->_cmdFlags;
        }

		[JsonIgnore] property bool IsValid{ bool get() { return State != HeadState::UNSET; } }
         
        virtual bool Equals(Object^ obj) override { StateChangedMessage^ other = dynamic_cast<StateChangedMessage^>(obj); if (other == nullptr) return false;
            return String::Equals(Type, other->Type) && State == other->State;
        }
        virtual int GetHashCode() override
        {
            int hash = 17;
            hash = hash * 31 + (Type  == nullptr ? 0 :  Type->GetHashCode());
            hash = hash * 31 + State.GetHashCode();
            return hash;
		}
    };


    public ref class SetWipersMessage sealed : public IWebMessage
    {
    private:
        String^ _type;
        CommandFlags _cmdFlags;
        WiperValues^ _wipers;

    public:
        SetWipersMessage() { _type = "setWipers"; _cmdFlags = CommandFlags::HoldWipers; _wipers = gcnew WiperValues(); }
        [JsonPropertyName("type"    )] virtual property String^      Type     { String^      get() { return _type;     } void set(String^      value) {   _type   = value; } }
        [JsonPropertyName("cmdFlags")] virtual property CommandFlags CMDflags { CommandFlags get() { return _cmdFlags; } void set(CommandFlags value) { _cmdFlags = value; } };
        [JsonPropertyName("wipers"  )]         property WiperValues^ Wipers   { WiperValues^ get() { return _wipers;   } void set(WiperValues^ value) { _wipers   = value; } }
    }; 


    public ref class SetStateMessage sealed : public IWebMessage
	{
    private:
        String^ _type;
        HeadState _state;
		CommandFlags _cmdFlags;

    public:
        SetStateMessage() { _type = "setState"; _state = HeadState::UNSET; _cmdFlags = CommandFlags::None; }
        [JsonPropertyName("type"    )] virtual property String^      Type     { String^      get() { return _type;     } void set(String^      value) { _type     = value; } }
        [JsonPropertyName("cmdFlags")] virtual property CommandFlags CMDflags { CommandFlags get() { return _cmdFlags; } void set(CommandFlags value) { _cmdFlags = value; } };
        [JsonPropertyName("state"   )]         property HeadState    State    { HeadState    get() { return _state;    } void set(HeadState    value) { _state    = value; } }
	};


    public ref class SetDebugFlagsMessage sealed : public IWebMessage
	{
    private:
        String^ _type;
		CommandFlags _cmdFlags;

    public:
        SetDebugFlagsMessage() { _type = "setDebugFlags"; _cmdFlags = CommandFlags::None; }
        [JsonPropertyName("type"      )] virtual property String^      Type     { String^      get() { return _type;       } void set(String^      value) { _type       = value; } }
        [JsonPropertyName("cmdFlags"  )] virtual property CommandFlags CMDflags { CommandFlags get() { return _cmdFlags;   } void set(CommandFlags value) { _cmdFlags   = value; } };
		
        [JsonIgnore] property bool HasTestFlag { bool get() { return (static_cast<uint16_t>(_cmdFlags) & 0xFF00) != 0; } }
	};
}
