#pragma once

#include "CPackets.h"
#include "Packets.h"

namespace TheLib
{

	ref class Decoder
	{
		public:
			static IPacket^ Convert(const CDecodedPacket& nativePacket);
	};

}