#pragma once

#include "SerialHelper.h"
#include "_Config.h"

using namespace System;
using namespace System::Threading::Tasks;

namespace TheLib
{

    public ref class TeensySerial : public SerialHelper
    {
    public:
        TeensySerial();
        
        virtual ~TeensySerial();
        !TeensySerial();

		bool Open() { return Open(PortName); }
        bool Open(String^ portName);

		Task<bool>^ OpenAsync() { return OpenAsync(PortName); }
		Task<bool>^ OpenAsync(String^ portName);

		property DeviceConfig^ DeviceConfiguration {
			DeviceConfig^ get() { return m_deviceConfig; }
		}

		void UseAsLegacyConfigSource();

	private:
		Task^ m_handshakeTask;
		Task^ PerformHandshake();
		bool PerformAsyncConnectionSequence();

        CancellationTokenSource^ m_handshakeCts;

		static const int BAUDRATE = 115200*8;
        static array<Byte>^ HOST_ACKNOWLEDGE   = System::Text::Encoding::UTF8->GetBytes(">HOST_ACK\n"  ); 
		static array<Byte>^ DEVICE_ACKNOWLEDGE = System::Text::Encoding::UTF8->GetBytes("<DEVICE_ACK\n");

		bool ReadHandshakeConfig(System::Threading::CancellationToken token);
		void DisposeTeensy();
		void PublishLegacyConfigurationIfOwner();
		void ReleaseLegacyConfigOwnership();

		bool m_isDisposing = false;
		DeviceConfig^ m_deviceConfig;
		Int64 m_configOwnerToken;

		static Int64 s_nextConfigOwnerToken;
		static Int64 s_legacyConfigOwnerToken;
	};

}
