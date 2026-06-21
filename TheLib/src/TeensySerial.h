#pragma once

#include "SerialHelper.h"

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


    private:
		Task^ m_handshakeTask;
		Task^ PerformHandshake();
        bool PerformAsyncConnectionSequence();

        CancellationTokenSource^ m_handshakeCts;

		static const int BAUDRATE = 115200*8;
        static array<Byte>^ HOST_ACKNOWLEDGE   = System::Text::Encoding::UTF8->GetBytes(">HOST_ACK\n"  ); 
		static array<Byte>^ DEVICE_ACKNOWLEDGE = System::Text::Encoding::UTF8->GetBytes("<DEVICE_ACK\n");

        bool ReadHandshakeConfig(System::Threading::CancellationToken token);

		bool m_isDisposing = false;
    };

}
