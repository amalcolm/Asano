#pragma once

#include "SerialHelper.h"
#include "ObjectPool.h"

using namespace System;
using namespace System::Diagnostics;

namespace TheLib
{
    // --- Define Private Helper Structs for Event Raising ---

    // Helper struct for raising DataReceived event
    private ref struct DataEventRaiser : IRaiser {
    	static ObjectPool<DataEventRaiser^>^ s_pool = gcnew ObjectPool<DataEventRaiser^>(128);

        SerialHelper^ m_target;
        IPacket^ m_packet;

		DataEventRaiser() : m_target(nullptr), m_packet(nullptr) {}

		static DataEventRaiser^ Rent(SerialHelper^ target, IPacket^ packet) {
			DataEventRaiser^ raiser = s_pool->Rent();
			raiser->m_target = target;
			raiser->m_packet = packet;
			return raiser;
		}
		static void Return(IRaiser^ raiser) {
			DataEventRaiser^ item = safe_cast<DataEventRaiser^>(raiser);
			item->m_target = nullptr;
			item->m_packet = nullptr;
			s_pool->Return(item);
		}

        DataEventRaiser(SerialHelper^ target, IPacket^ packet) : m_target(target), m_packet(packet) {
            if (m_target == nullptr) throw gcnew System::ArgumentNullException("target");
            if (m_packet == nullptr) throw gcnew System::ArgumentNullException("packet");
        }

		virtual void Raise() {
			try {
				if (!m_target->m_disposed)
					m_target->RaiseDataReceivedEvent(m_packet);
			}
			catch (Exception^ ex)
            {
                if (Debugger::IsAttached || IsDebuggerPresent())
                    Debugger::Break();

                Debug::WriteLine(String::Format("DataEventRaiser::Raise Exception: {0}", ex->Message));
                Debug::WriteLine(ex->StackTrace);
            }
            finally {
				m_packet->Cleanup(); // Ensure packet cleanup after event is raised, even if handler throws
            }
                
        }
    };

    // Helper struct for raising ErrorOccurred event
    private ref struct ErrorEventRaiser : IRaiser {
		static ObjectPool<ErrorEventRaiser^>^ s_pool = gcnew ObjectPool<ErrorEventRaiser^>(128);
        SerialHelper^ m_target;
        Exception^ m_exception;
		ErrorEventRaiser() : m_target(nullptr), m_exception(nullptr) {}

		static ErrorEventRaiser^ Rent(SerialHelper^ target, Exception^ ex) {
			ErrorEventRaiser^ raiser = s_pool->Rent();
			raiser->m_target = target;
			raiser->m_exception = ex;
			return raiser;
		}
		static void Return(IRaiser^ raiser) {
			ErrorEventRaiser^ item = safe_cast<ErrorEventRaiser^>(raiser);
			item->m_target = nullptr;
			item->m_exception = nullptr;
			s_pool->Return(item);
		}

        ErrorEventRaiser(SerialHelper^ target, Exception^ ex) : m_target(target), m_exception(ex) {
            if (m_target    == nullptr) throw gcnew System::ArgumentNullException("target");
            if (m_exception == nullptr) throw gcnew System::ArgumentNullException("ex");
        }

        virtual void Raise() {
            if (m_target->m_disposed) return;

            try { m_target->RaiseErrorOccurredEvent(m_exception); }
            catch (Exception^ ex) { Debug::WriteLine(String::Format("ErrorEventRaiser::Raise Exception in ErrorOccurred handler itself: {0}", ex->Message)); }
        }
    };

    // Helper struct for raising ConnectionChanged event
    private ref struct ConnectionEventRaiser : IRaiser {
		static ObjectPool<ConnectionEventRaiser^>^ s_pool = gcnew ObjectPool<ConnectionEventRaiser^>(128);
        SerialHelper^ m_target;
        ConnectionState m_state;

		ConnectionEventRaiser() : m_target(nullptr), m_state(ConnectionState::Disconnected) {}

		static ConnectionEventRaiser^ Rent(SerialHelper^ target, ConnectionState state) {
			ConnectionEventRaiser^ raiser = s_pool->Rent();
			raiser->m_target = target;
			raiser->m_state = state;
			return raiser;
		}
		static void Return(IRaiser^ raiser) {
			ConnectionEventRaiser^ item = safe_cast<ConnectionEventRaiser^>(raiser);
			item->m_target = nullptr;
			item->m_state = ConnectionState::Disconnected;
			s_pool->Return(item);
		}

        ConnectionEventRaiser(SerialHelper^ target, ConnectionState state) : m_target(target), m_state(state) {
            if (m_target == nullptr) throw gcnew System::ArgumentNullException("target");
        }

        virtual void Raise() {
            if (m_target->m_disposed) return;

            try { m_target->RaiseConnectionChangedEvent(m_state); }
            catch (Exception^ ex) {
                try {
                    m_target->RaiseErrorOccurredEvent(gcnew Exception(String::Format("Exception in ConnectionChanged handler: {0}", ex->Message), ex));
                }
                catch (...) {}
            }
        }
    };

}
