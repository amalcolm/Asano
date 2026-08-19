#include "Packets.h"
#include "CPackets.h"
#include "WebData.h"

namespace TheLib
{
    Packet::Packet()
    {
		Data = gcnew array<Byte>(4096);
        Reset();
	}

    Packet^ Packet::Rent()
    {
        Packet^ p; if (s_pool->TryDequeue(p)) return p;
        return gcnew Packet();
    }

    Packet::~Packet()
    {
        // Deterministic cleanup path (Dispose)
        Reset();
        s_pool->Enqueue(this);
        GC::SuppressFinalize(this);
    }

    Packet::!Packet()
    {
        // Avoid resurrecting the object or touching arbitrary managed graph.
        // Only free unmanaged stuff here if you ever add any.
        // No pooling here-finalization indicates caller didn't Dispose.
    }

    void Packet::Reset()
    {
        Timestamp = 0.0;
		// Data array is reused, and no need to clean it.
        BytesRead = 0;
    }




    DataPacket::DataPacket()
    {
        Channel = gcnew array<System::Int32>(8);
        Reset();
    }

    DataPacket^ DataPacket::Rent()
    {
        DataPacket^ p; if (s_pool->TryDequeue(p)) return p;
        return gcnew DataPacket();
	}
    void DataPacket::Cleanup()
    {
        this->~DataPacket();
    }

    DataPacket::~DataPacket() { Cleanup(); GC::SuppressFinalize(this); }
    DataPacket::!DataPacket() { }

    void DataPacket::Reset()
    {
        State = HeadState::None;
        TimeStamp = 0.0;
		StateTime = 0.0;
        HardwareState = 0;
		SensorState = 0;
        Sensor1 = 0.0f;
		Sensor2 = 0.0f;
		LightEnvelope = 0.0f;
		// Channel array is reused, and no need to clean it.
    }



    EventPacket::EventPacket()
    {
        Reset();
    }

    EventPacket^ EventPacket::Rent()
    {
        EventPacket^ p; if (s_pool->TryDequeue(p)) return p;
        return gcnew EventPacket();
    }

    void EventPacket::Cleanup()
    {
        Reset();
        s_pool->Enqueue(this);
	}

	EventPacket::~EventPacket() { Cleanup(); GC::SuppressFinalize(this); }
	EventPacket::!EventPacket() {}

    void EventPacket::Reset()
    {
        Kind = EventKind::NONE;
        StateTime = 0.0;
    }




	BlockPacket::BlockPacket()
	{
		BlockData = gcnew array<DataPacket ^>(CBlockPacket::MAX_BLOCK_SIZE);
		EventData = gcnew array<EventPacket^>(CBlockPacket::MAX_EVENTS_PER_BLOCK);

        Reset();
	}
    
    BlockPacket^ BlockPacket::Rent()
    {
        BlockPacket^ p; if (s_pool->TryDequeue(p)) return p;
        return gcnew BlockPacket();
	}
    void BlockPacket::Cleanup()
    
    {   Reset();
        s_pool->Enqueue(this);
	}
	
    BlockPacket::~BlockPacket(){ Cleanup(); GC::SuppressFinalize(this);	}
    BlockPacket::!BlockPacket() { }

    void BlockPacket::Reset()
    {
        State = HeadState::None;
        TimeStamp = 0.0;
        Count = 0;
		NumEvents = 0;
        // BlockData array is reused, no need to clean it.
	}


    TextPacket::TextPacket()
    {
		Text = AString::Rent();
        Reset();
    }
    
    TextPacket^ TextPacket::Rent()
    {
        TextPacket^ p; if (s_pool->TryDequeue(p)) return p;
        return gcnew TextPacket();
    }

    
    void TextPacket::Cleanup()
    {
        Reset();
        s_pool->Enqueue(this);
    }

    TextPacket::~TextPacket() { Cleanup(); GC::SuppressFinalize(this); }   
    TextPacket::!TextPacket() {}
    
    void TextPacket::Reset()
    {
        State = HeadState::None;
		Length = 0;
        TimeStamp = 0.0;
        // release Text in cleanup
    }

    

    TelemetryPacket::TelemetryPacket()
    {
        Reset();
	}
    TelemetryPacket^ TelemetryPacket::Rent()
    {
        TelemetryPacket^ p; if (s_pool->TryDequeue(p)) return p;
        return gcnew TelemetryPacket();
    }
    
    void TelemetryPacket::Cleanup()
    {
        Reset();
        s_pool->Enqueue(this);
    }

	TelemetryPacket::~TelemetryPacket() { Cleanup(); GC::SuppressFinalize(this); }
    TelemetryPacket::!TelemetryPacket() {}

    void TelemetryPacket::Reset()
    {
        State = HeadState::None;
        TimeStamp = 0.0;
        Group = TeleGroup::NONE;
		SubGroup = 0;
        ID = 0;
        Value = 0.0f;
        Key = 0;
	}


	int RawSignalPacket::MAX_SAMPLES::get() { return CRawSignalPacket::MAX_SAMPLES; }

    RawSignalPacket::RawSignalPacket()
    {
		Data = gcnew array<SignalData>(CRawSignalPacket::MAX_SAMPLES);
        Reset();
	}
    RawSignalPacket^ RawSignalPacket::Rent()
    {
        RawSignalPacket^ p; if (s_pool->TryDequeue(p)) return p;
        return gcnew RawSignalPacket();
    }
    
    void RawSignalPacket::Cleanup()
    {
        Reset();
        s_pool->Enqueue(this);
	}

    RawSignalPacket::~RawSignalPacket() { Cleanup(); GC::SuppressFinalize(this); }
    RawSignalPacket::!RawSignalPacket() {}
    void RawSignalPacket::Reset()
    {
        State = HeadState::None;
        TimeStamp = 0.0;
        Count = 0;
        // Data array is reused, and no need to clean it.
	}


    DebugPacket::DebugPacket()
    {
        Reset();
    }
    DebugPacket^ DebugPacket::Rent()
    {
        DebugPacket^ p; if (s_pool->TryDequeue(p)) return p;
        return gcnew DebugPacket();
	}
    void DebugPacket::Cleanup()
    {
        Reset();
        s_pool->Enqueue(this);
    }
    DebugPacket::~DebugPacket() { Cleanup(); GC::SuppressFinalize(this); }
    DebugPacket::!DebugPacket() {}
    void DebugPacket::Reset()
    {
        State = HeadState::None;
        TimeStamp = 0.0;
        // Data array is reused, and no need to clean it.
	}
}
