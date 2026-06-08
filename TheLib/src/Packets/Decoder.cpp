#include "Decoder.h"
#include "../Utilities.h"


namespace TheLib
{
	IPacket^ Decoder::Convert(const CDecodedPacket& nativePacket)
	{

		switch (nativePacket.kind)
		{
			case PacketKind::Data:
			{
				DataPacket^ pkt = DataPacket::Rent();

				pkt->TimeStamp     = nativePacket.data.timeStamp;
				pkt->StateTime     = nativePacket.data.stateTime;
				pkt->State         = static_cast<HeadState>(nativePacket.data.state);
				pkt->HardwareState = nativePacket.data.hardwareState;
				pkt->SensorState   = nativePacket.data.sensorState;
				pkt->Sensor1       = nativePacket.data.Sensor1;
				pkt->Sensor2       = nativePacket.data.Sensor2;

				for (size_t i = 0; i < CDataPacket::A2D_NUM_CHANNELS; ++i)
				{
					pkt->Channel[i] = nativePacket.data.channel[i];
				}
				return pkt;
			}

			case PacketKind::Block:
			{
				BlockPacket^ blockPkt = BlockPacket::Rent();

				blockPkt->TimeStamp = nativePacket.block.timeStamp;
				blockPkt->State     = static_cast<HeadState>(nativePacket.block.state);

				blockPkt->Count		= nativePacket.block.count;
				blockPkt->NumEvents = nativePacket.block.numEvents;

				for (size_t i = 0; i < nativePacket.block.count; ++i)
				{
					DataPacket^ dataPkt = blockPkt->BlockData[i];
					if (dataPkt == nullptr)
						dataPkt = blockPkt->BlockData[i] = DataPacket::Rent();
					else
						dataPkt->Reset();

					dataPkt->TimeStamp     = nativePacket.block.blockData[i].timeStamp;
					dataPkt->StateTime     = nativePacket.block.blockData[i].stateTime;
					dataPkt->State         = static_cast<HeadState>(nativePacket.block.blockData[i].state);
					dataPkt->HardwareState = nativePacket.block.blockData[i].hardwareState;
					dataPkt->SensorState   = nativePacket.block.blockData[i].sensorState;
					dataPkt->Sensor1       = nativePacket.block.blockData[i].Sensor1;
					dataPkt->Sensor2       = nativePacket.block.blockData[i].Sensor2;
					dataPkt->LightEnvelope = nativePacket.block.blockData[i].lightEnvelope;

					for (size_t ch = 0; ch < CDataPacket::A2D_NUM_CHANNELS; ++ch)
					{
						dataPkt->Channel[ch] = nativePacket.block.blockData[i].channel[ch];
					}

					blockPkt->BlockData[i] = dataPkt;
				}

				for (size_t i = 0; i < nativePacket.block.numEvents; ++i)
				{
					EventPacket^ eventPkt = blockPkt->EventData[i];
					if (eventPkt == nullptr)
						eventPkt = blockPkt->EventData[i] = EventPacket::Rent();
					else
						eventPkt->Reset();

					eventPkt->Kind         = static_cast<EventKind>(nativePacket.block.eventData[i].eventKind);
					eventPkt->StateTime    = nativePacket.block.eventData[i].stateTime;
					blockPkt->EventData[i] = eventPkt;
				}

				return blockPkt;
			}

			case PacketKind::Text:
			{
				TextPacket^ textPkt = TextPacket::Rent();
				const uint8_t* utf8Bytes = nativePacket.text.utf8Bytes;

				textPkt->TimeStamp  = nativePacket.text.timeStamp;
				textPkt->State      = HeadState::None;
				textPkt->Text       = AString::FromUtf8(utf8Bytes, 0, nativePacket.text.length);
				textPkt->Length		= textPkt->Text->Length;

				return textPkt;
			}

			case PacketKind::Telemetry:
			{
				TelemetryPacket^ telePkt = TelemetryPacket::Rent();
				telePkt->TimeStamp = nativePacket.telemetry.timeStamp;
				telePkt->State     = HeadState::None;
				telePkt->Group     = static_cast<TelemetryPacket::TeleGroup>(nativePacket.telemetry.group);
				telePkt->SubGroup  = nativePacket.telemetry.subGroup;
				telePkt->ID        = nativePacket.telemetry.id;
				telePkt->Value     = nativePacket.telemetry.value;
				telePkt->Key       = nativePacket.telemetry.key;
				return telePkt;
			}

			case PacketKind::Debug:
			{
				DebugPacket^ debugPkt = DebugPacket::Rent();
				debugPkt->TimeStamp = nativePacket.debug.timeStamp;
				debugPkt->State     = static_cast<HeadState>(nativePacket.debug.state);
				debugPkt->Count     = nativePacket.debug.count;
				for (size_t i = 0; i < nativePacket.debug.count; ++i)
				{
					debugPkt->Data[i].StartTick = nativePacket.debug.data[i].startTick;
					debugPkt->Data[i].Sample    = nativePacket.debug.data[i].sample;
					debugPkt->Data[i].EndTick   = nativePacket.debug.data[i].endTick;
				}
				return debugPkt;
			}

		default:
			// Unknown packet type
			return nullptr;
		}
	}
}
