#include "TeensySerial.h"
#include "Utilities.h"
#include "_Config.h"

namespace TheLib
{
	TeensySerial::TeensySerial() :  SerialHelper(CallbackPolicy::Queued)
	{
	}

	TeensySerial::~TeensySerial()
	{
	}

	TeensySerial::!TeensySerial()
	{
		m_isDisposing = true;
		
		if (m_handshakeTask != nullptr && !m_handshakeTask->IsCompleted)
		{
			m_handshakeCts->Cancel();
			m_handshakeEvent->Set();
			m_handshakeTask->Wait(1000);
			m_handshakeTask = nullptr;
		}
	}

	bool TeensySerial::Open(String^ portName)
	{
		if (m_disposed || m_isDisposing) return false;

		if (m_handshakeTask != nullptr && !m_handshakeTask->IsCompleted) {
			m_handshakeCts->Cancel();
			m_handshakeTask->Wait(1000);
			if (m_disposed || m_isDisposing) return false;

			if (!m_handshakeTask->IsCompleted) {
				RaiseErrorOccurredEvent(gcnew System::Exception("Previous handshake still running"));
				return false;
			}

			if (!m_handshakeCts->TryReset()) 
				m_handshakeCts = gcnew CancellationTokenSource();
		}

		if (!SerialHelper::Open(portName, BAUDRATE)) { RaiseErrorOccurredEvent(gcnew System::Exception("Failed to open port")); return false; }

		m_handshakeTask = Task::Run(gcnew Func<Task^>(this, &TeensySerial::PerformHandshake));
		return true;
	}



	Task^ TeensySerial::PerformHandshake()
	{
		m_connectionState = ConnectionState::HandshakeInProgress;
		
		m_handshakeCts = gcnew CancellationTokenSource();
		CancellationToken token = m_handshakeCts->Token;

		bool result = false;
		try
		{
			ClearHandshakeResponses();
			Config::ResetHandshakeConfig();

			// Simulate handshake process
			while (!token.IsCancellationRequested)
			{
				if (!IsOpen)
				{
					Exception^ ex = SafeWait(200, token);
					if (ex != nullptr) {
						RaiseErrorOccurredEvent(ex);
					}
					continue;
				}

				if (token.IsCancellationRequested)
					break;
				
				ClearHandshakeResponses();
				Write(HOST_ACKNOWLEDGE);

				bool devAck = false;
				bool received = false;
				for (int count = 5; devAck == false && count > 0 && !token.IsCancellationRequested; count--) 
				{
					received = WaitForHandshakeResponse(500);  // handshake event fired on close as well

					if (!received)
						break;

					if (received && !token.IsCancellationRequested)
						devAck = TestHandshakeResponse(DEVICE_ACKNOWLEDGE);
				}

				if (devAck)
				{
//					Clear();
					Write(">" + Config::ProgramVersion + "\n");

					if (ReadHandshakeConfig(token))
					{
						m_connectionState = ConnectionState::HandshakeSuccessful;
//						Clear();
						break;
					}
				}
				else
					OutputDebugString(L"No response after sending host acknowledge.\r\n");


				Exception^ ex = SafeWait(5000, token);
				if (ex != nullptr) {
					RaiseErrorOccurredEvent(ex);
				}
			}

			result = true;
		}
		catch (Exception^ ex)
		{
			RaiseErrorOccurredEvent(ex);
			result = false;
		}
		finally
		{
			if (!IsOpen)
				m_connectionState = ConnectionState::Disconnected;

			RaiseConnectionChangedEvent(m_connectionState);
		}
		return Task::FromResult(result);
	}

	bool TeensySerial::ReadHandshakeConfig(CancellationToken token)
	{
		bool received = WaitForHandshakeResponse(500);
		if (!received || token.IsCancellationRequested)
			return false;

		String^ response = GetHandshakeResponse();
		String^ marker = response->Trim();

		Config::ResetHandshakeConfig();
		Config::ParseHandshakeResponse(response);

		if (!String::Equals(marker, "<CONFIG_BEGIN", StringComparison::OrdinalIgnoreCase))
			return true;

		for (int count = 64; count > 0 && !token.IsCancellationRequested; --count)
		{
			received = WaitForHandshakeResponse(500);
			if (!received)
				return false;

			response = GetHandshakeResponse();
			marker = response->Trim();
			Config::ParseHandshakeResponse(response);

			if (String::Equals(marker, "<CONFIG_END", StringComparison::OrdinalIgnoreCase))
				return true;
		}

		return false;
	}

	
	Task<bool>^ TeensySerial::OpenAsync(String^ portName)
	{
		if (m_handshakeTask != nullptr && !m_handshakeTask->IsCompleted) {
			RaiseErrorOccurredEvent(gcnew System::Exception("Previous handshake still running"));
			return Task::FromResult(false);
		}

		this->PortName = portName; 

		return Task::Run(gcnew Func<bool>(this, &TeensySerial::PerformAsyncConnectionSequence));
	}

	bool TeensySerial::PerformAsyncConnectionSequence()
	{
		// 1. Open Physical Port (Uses the member variable m_portName we just set)
		if (!SerialHelper::Open()) {
			RaiseErrorOccurredEvent(gcnew System::Exception("Failed to open port"));
			return false;
		}

		// 2. Perform Handshake (Blocking wait is safe here strictly because we are in a Task)
		try {
			m_handshakeTask = this->PerformHandshake();
			m_handshakeTask->Wait(); // Wait for the handshake task to finish
		}
		catch (Exception^ ex) {
			RaiseErrorOccurredEvent(ex);
			return false;
		}

		return (m_connectionState == ConnectionState::HandshakeSuccessful);
	}
}
