#include "SerialHelper.h"
#include "Utilities.h"
#include "EventRaisers.h"
#include "Packets/Decoder.h"
#include "Packets/XCommands.h"

// Include necessary headers for interop
#include <vcclr.h> // For GCHandle, pin_ptr
#include <stdexcept> // Include for std::runtime_error etc. if needed directly

// Explicitly use namespaces
using namespace System;
using namespace System::Diagnostics;
using namespace System::Runtime::InteropServices;
using namespace System::Threading;
using namespace System::Text;
using namespace TheLib;

constexpr bool VERBOSE = false; // Set to true for verbose logging

namespace TheLib 
{

    //---------------------------------------------------------------------
    // Constructor / Destructor / IDisposable
    //---------------------------------------------------------------------
    SerialHelper::SerialHelper(CallbackPolicy policy)
        : m_nativeSerial(nullptr),
        m_managedCallbacks(nullptr),
        m_disposed(false),
        m_selfHandle(GCHandle()),
        m_delegateDataHandler(nullptr),
        m_delegateErrorHandler(nullptr),
        m_delegateConnectionHandler(nullptr)
    {
        bool success = false;
        try {
            m_managedCallbacks = gcnew ManagedCallbacks(policy);
            m_nativeSerial = new CSerial();
            if (!m_nativeSerial) {
                throw gcnew OutOfMemoryException("Failed to allocate native CSerial instance.");
            }
            m_selfHandle = GCHandle::Alloc(this, GCHandleType::Normal);                                                                             if (VERBOSE) Debug::WriteLine("SerialHelper: GCHandle allocated.");
            void* pUserData = GCHandle::ToIntPtr(m_selfHandle).ToPointer();

			// Create delegates and store to prevent GC
            m_delegateConnectionHandler = gcnew NativeConnectionCallbackDelegate(&SerialHelper::StaticConnectionHandler);
            m_delegateErrorHandler      = gcnew NativeErrorCallbackDelegate     (&SerialHelper::StaticErrorHandler     );

            // Get function pointers from delegates
            IntPtr pFuncConnection = Marshal::GetFunctionPointerForDelegate(m_delegateConnectionHandler);
            IntPtr pFuncError      = Marshal::GetFunctionPointerForDelegate(m_delegateErrorHandler);

            m_nativeSerial->SetConnectionHandler(static_cast<CSerial::ConnectionHandler>(pFuncConnection.ToPointer()));
            m_nativeSerial->SetErrorHandler     (static_cast<CSerial::ErrorHandler     >(pFuncError     .ToPointer()));                             if (VERBOSE) Debug::WriteLine("SerialHelper: Native Connection and Error handlers set via delegates.");
            success = true;
        }
        catch (Exception^ ex) {
            Debug::WriteLine(String::Format("SerialHelper: CRITICAL - Exception during construction: {0}", ex));
            Disposer(true);
            throw;
        }                                                                                                                                           if (VERBOSE) Debug::WriteLine("SerialHelper: Construction complete.");
    }

    SerialHelper::~SerialHelper() {                                                                                                                 if (VERBOSE) Debug::WriteLine("SerialHelper: ~SerialHelper() called (Dispose).");
        Disposer(true);
        GC::SuppressFinalize(this);
    }

    SerialHelper::!SerialHelper() {                                                                                                                 if (VERBOSE) Debug::WriteLine("SerialHelper: !SerialHelper() called (Finalizer).");
        Disposer(false);
    }

    void SerialHelper::Disposer(bool disposing) {                                                                                                   if (VERBOSE) Debug::WriteLine(String::Format("SerialHelper: Disposer called (disposing={0}).", disposing));
        if (!m_disposed) {
            if (disposing) {                                                                                                                        if (VERBOSE) Debug::WriteLine("SerialHelper: Disposing managed resources...");
                if (m_managedCallbacks != nullptr) {
                    delete m_managedCallbacks;
                    m_managedCallbacks = nullptr;                                                                                                   if (VERBOSE) Debug::WriteLine("SerialHelper: ManagedCallbacks disposed.");
                }
                m_delegateDataHandler = nullptr;
                m_delegateErrorHandler = nullptr;
                m_delegateConnectionHandler = nullptr;                                                                                              if (VERBOSE) Debug::WriteLine("SerialHelper: Delegate references cleared.");
            }
                                                                                                                                                    if (VERBOSE) Debug::WriteLine("SerialHelper: Disposing unmanaged resources (native CSerial)...");
            if (m_nativeSerial != nullptr) {
                try {
                    if (m_nativeSerial->IsOpen()) {                                                                                                 if (VERBOSE) Debug::WriteLine("SerialHelper: Calling native Close() during dispose...");
                        m_nativeSerial->Close();                                                                                                    if (VERBOSE) Debug::WriteLine("SerialHelper: Native Close() returned.");
                    }
                    else {
                        Debug::WriteLine("SerialHelper: Native port already closed, skipping native Close().");
                    }
                }
                catch (const std::exception& ex) {
                    String^ errMsg = gcnew String(ex.what());
                    Debug::WriteLine(String::Format("SerialHelper: WARNING - Native exception during Close() in Dispose: {0}", errMsg));
                }
                catch (...) {
                    Debug::WriteLine("SerialHelper: WARNING - Unknown native exception during Close() in Dispose.");
                }
                delete m_nativeSerial;
                m_nativeSerial = nullptr;                                                                                                           if (VERBOSE) Debug::WriteLine("SerialHelper: Native CSerial deleted.");
            }
            else {
                Debug::WriteLine("SerialHelper: Native CSerial pointer was already null.");
            }

            if (m_selfHandle.IsAllocated) {
                m_selfHandle.Free();                                                                                                                if (VERBOSE) Debug::WriteLine("SerialHelper: GCHandle freed.");
            }
            else {
                Debug::WriteLine("SerialHelper: GCHandle was not allocated or already freed.");
            }
            m_disposed = true;                                                                                                                      if (VERBOSE) Debug::WriteLine("SerialHelper: Dispose finished.");
        }
        else {
            Debug::WriteLine("SerialHelper: Already disposed.");
        }
    }

    const void SerialHelper::ThrowIfDisposed() {
        if (m_disposed) {
            throw gcnew ObjectDisposedException(SerialHelper::typeid->FullName);
        }
    }

    //---------------------------------------------------------------------
    // Public Methods
    //---------------------------------------------------------------------

    bool SerialHelper::Open() {
        if (String::IsNullOrEmpty(m_portName)) { Debug::WriteLine("SerialHelper::Open Error: PortName is not set."); return false; }
        return Open(m_portName, BaudRate); // Uses the property or default baud
    }

    bool SerialHelper::Open(String^ portName) {
		return Open(portName, CSerial::DEFAULT_BAUDRATE);
	}   

    bool SerialHelper::Open(String^ portName, int baudRate) {
		constexpr bool FAIL = false;
        ThrowIfDisposed();
        if (m_nativeSerial == nullptr) { Debug::WriteLine("SerialHelper::Open Error: Native serial object is null."); return FAIL; }
        if (String::IsNullOrEmpty(portName)) { throw gcnew ArgumentNullException("portName"); }

        m_portName = portName;
        std::string nativePortName = ConvertSysString(portName);

        void* pUserData = nullptr;
        if (m_selfHandle.IsAllocated) { pUserData = GCHandle::ToIntPtr(m_selfHandle).ToPointer(); }
        else { throw gcnew InvalidOperationException("Internal error: GCHandle not allocated before Open."); }

        if (m_delegateDataHandler == nullptr) {
            m_delegateDataHandler = gcnew NativeDataCallbackDelegate(&SerialHelper::StaticDataHandler);                                             if (VERBOSE) Debug::WriteLine("SerialHelper: Data handler delegate created.");
        }

        IntPtr pFuncData = Marshal::GetFunctionPointerForDelegate(m_delegateDataHandler);
        CSerial::DataHandler pNativeDataHandler = static_cast<CSerial::DataHandler>(pFuncData.ToPointer());

        bool result = FAIL;
        try {                                                                                                                                       if (VERBOSE) Debug::WriteLine(String::Format("SerialHelper: Calling native SetPort('{0}', {1})...", portName, baudRate));
            result = m_nativeSerial->SetPort(nativePortName, pNativeDataHandler, pUserData, baudRate);                                              if (VERBOSE) Debug::WriteLine(String::Format("SerialHelper: Native SetPort returned {0}.", result));
            if (result) 
                m_portName = portName;                                                                                                              if (VERBOSE) Debug::WriteLine(String::Format("SerialHelper: PortName set to '{0}'.", m_portName));
        }
        catch (const std::exception& ex) {
            String^ errMsg = gcnew String(ex.what());
            Debug::WriteLine(String::Format("SerialHelper: Native exception during SetPort: {0}", errMsg));
            RaiseErrorOccurredEvent(ConvertStdException(ex));
            result = FAIL;
        }
        catch (...) {
            Debug::WriteLine("SerialHelper: Unknown native exception during SetPort.");
            RaiseErrorOccurredEvent(gcnew Exception("Unknown native exception during SetPort"));
            result = FAIL;
        }
        return result;
    }

    bool SerialHelper::Close() {
		constexpr bool FAIL = false;
        ThrowIfDisposed();
        if (m_nativeSerial == nullptr) return FAIL;
        bool result = FAIL;
        try {                                                                                                                                       if (VERBOSE) Debug::WriteLine("SerialHelper: Calling native Close()...");
            result = m_nativeSerial->Close();                                                                                                       if (VERBOSE) Debug::WriteLine(String::Format("SerialHelper: Native Close returned {0}.", result));
        }
        catch (const std::exception& ex) {
            String^ errMsg = gcnew String(ex.what());
            Debug::WriteLine(String::Format("SerialHelper: Native exception during Close: {0}", errMsg));
            RaiseErrorOccurredEvent(ConvertStdException(ex));
            result = FAIL;
        }
        catch (...) {
            Debug::WriteLine("SerialHelper: Unknown native exception during Close.");
            RaiseErrorOccurredEvent(gcnew Exception("Unknown native exception during Close"));
            result = FAIL;
        }
        return result;
    }

    bool SerialHelper::Write(String^ data) {
		constexpr bool FAIL = false;
        ThrowIfDisposed();

        if (m_nativeSerial == nullptr) return FAIL;
        if (data == nullptr) return FAIL;
        std::string nativeData = ConvertSysString(data);
        if (nativeData.empty()) return FAIL;
        bool result = FAIL;
        try {
            result = m_nativeSerial->Write(nativeData);
        }
        catch (const std::exception& ex) {
            String^ errMsg = gcnew String(ex.what());
            Debug::WriteLine(String::Format("SerialHelper: Native exception during Write(string): {0}", errMsg));
            RaiseErrorOccurredEvent(ConvertStdException(ex));
            result = FAIL;
        }
        catch (...) {
            Debug::WriteLine("SerialHelper: Unknown native exception during Write(string).");
            RaiseErrorOccurredEvent(gcnew Exception("Unknown native exception during Write(string)"));
            result = FAIL;
        }
        return result;
    }


    array<Byte>^ SerialHelper::EncodeXCommand(IXCommand^ command)
    {
        if (command == nullptr)
            return nullptr;

        Type^ type = command->GetType();

        int packetSize = Marshal::SizeOf(type);
        array<Byte>^ packet = gcnew array<Byte>(packetSize);

        IntPtr ptr = Marshal::AllocHGlobal(packetSize);

        try
        {
            Marshal::StructureToPtr(command, ptr, false);
            Marshal::Copy(ptr, packet, 0, packetSize);

            packet[0] = XCMD_MAGIC[0];
            packet[1] = XCMD_MAGIC[1];
            packet[2] = command->CommandID;
            packet[3] = XCMD_MAGIC[3];
        }
        finally
        {
            Marshal::FreeHGlobal(ptr);
        }

        return packet;
    }

    bool SerialHelper::Write(IXCommand^ command) {
		constexpr bool FAIL = false;
		ThrowIfDisposed();
        if (command == nullptr) return FAIL;
        if (m_nativeSerial == nullptr) return FAIL;
        CPacket* nativePacket = nullptr;

        array<Byte>^ packet = EncodeXCommand(command);

        if (packet == nullptr || packet->Length == 0)
        {
            Debug::WriteLine("SerialHelper::Write(IXCommand^) Error: Failed to encode command.");
            return FAIL;
        }

		return Write(packet);
    }

    bool SerialHelper::Write(array<Byte>^ data) {
		constexpr bool FAIL = false;
        ThrowIfDisposed();
        if (data == nullptr) return FAIL;
        return Write(data, 0, data->Length);
    }

    bool SerialHelper::Write(array<Byte>^ data, int offset, int count) {
		constexpr bool FAIL = false;
        ThrowIfDisposed();
        if (m_nativeSerial == nullptr) return FAIL;
        if (data == nullptr) { RaiseErrorOccurredEvent(gcnew ArgumentNullException("data", "Write(byte[]) called with null array.")); return FAIL; }
        if (offset < 0 || count < 0 || (offset + count) > data->Length) { RaiseErrorOccurredEvent(gcnew ArgumentOutOfRangeException("offset/count", "Invalid offset/count for Write(byte[], offset, count).")); return FAIL; }
        if (count == 0) return true;
        bool result = FAIL;
        try {
            pin_ptr<Byte> pinnedData = &data[offset];
            BYTE* nativeDataPtr = pinnedData;
            result = m_nativeSerial->Write(nativeDataPtr, 0, static_cast<DWORD>(count));
        }
        catch (const std::exception& ex) {
            String^ errMsg = gcnew String(ex.what());
            Debug::WriteLine(String::Format("SerialHelper: Native exception during Write(bytes): {0}", errMsg));
            RaiseErrorOccurredEvent(ConvertStdException(ex));
            result = FAIL;
        }
        catch (...) {
            Debug::WriteLine("SerialHelper: Unknown native exception during Write(bytes).");
            RaiseErrorOccurredEvent(gcnew Exception("Unknown native exception during Write(bytes)"));
            result = FAIL;
        }
        return result;
    }

    void SerialHelper::Clear() {
        ThrowIfDisposed();
        m_handshakeLength = 0;
        Array::Clear(m_managedBytes, 0, m_managedBytes->Length);
        m_handshakeEvent->Reset();

        m_nativeSerial->Clear();
	}


    Task<bool>^ SerialHelper::OpenAsync() {
        return Task::Run(gcnew Func<bool>(this, &SerialHelper::Open));
    }

    Task<bool>^ SerialHelper::OpenAsync(String^ portName) {
        m_portName = portName;
		return Task::Run(gcnew Func<bool>(this, &SerialHelper::Open));
    }

    Task<bool>^ SerialHelper::CloseAsync() {
        return Task::Run(gcnew Func<bool>(this, &SerialHelper::Close));
    }




    bool SerialHelper::IsOpen::get() {
		constexpr bool FAIL = false;
        if (m_disposed || m_nativeSerial == nullptr) {
            return FAIL;
        }
        try {
            return m_nativeSerial->IsOpen();
        }
        catch (const std::exception& ex) {
            String^ errMsg = gcnew String(ex.what()); // Basic conversion
            // String^ errMsg = ConvertStdString(ex.what()); // Use direct call if available
            Debug::WriteLine(String::Format("SerialHelper: WARNING - Exception during native IsOpen get: {0}", errMsg));
            return FAIL;
        }
        catch (...) {
            Debug::WriteLine("SerialHelper: WARNING - Unknown native exception during IsOpen get.");
            return FAIL;
        }
    }

    int SerialHelper::BaudRate::get() {
		constexpr int FAIL = 0;
        if (m_disposed || m_nativeSerial == nullptr) {
            return FAIL;
        }
        try {
            return m_nativeSerial->GetBaudRate();
        }
        catch (const std::exception& ex) {
            String^ errMsg = gcnew String(ex.what()); // Basic conversion
            // String^ errMsg = ConvertStdString(ex.what()); // Use direct call if available
            Debug::WriteLine(String::Format("SerialHelper: WARNING - Exception during native GetBaudRate get: {0}", errMsg));
            return FAIL;
        }
        catch (...) {
            Debug::WriteLine("SerialHelper: WARNING - Unknown native exception during GetBaudRate get.");
            return FAIL;
        }
    }

    int SerialHelper::PendingCallbacks::get() {
		constexpr int FAIL = 0;
        if (m_disposed || m_managedCallbacks == nullptr) {
            return FAIL;
        }

        try {
            return m_managedCallbacks->QueueSize;
        }
        catch (ObjectDisposedException^) {
            Debug::WriteLine("SerialHelper::PendingCallbacks Warning: ManagedCallbacks was disposed.");
            return FAIL;
        }
        catch (Exception^ ex) {
            Debug::WriteLine(String::Format("SerialHelper::PendingCallbacks Error getting queue size: {0}", ex->Message));
            return FAIL;
        }
    }

    //---------------------------------------------------------------------
    // Private Static Callback Bridges
    //---------------------------------------------------------------------
	void SerialHelper::StaticDataHandler(void* userData, CSerial* pSender, const CDecodedPacket& packet) {  //packet is reused by decoder, do not store
        GCHandle handle = GCHandle::FromIntPtr(IntPtr(userData));
        SerialHelper^ wrapper = nullptr;
        try {
            if (handle.IsAllocated && handle.Target != nullptr) { wrapper = static_cast<SerialHelper^>(handle.Target); }
        }
        catch (Exception^ ex) { Debug::WriteLine(String::Format("StaticDataHandler GCHandle: {0}", ex)); return; }

        if (wrapper != nullptr && !wrapper->m_disposed) {
            try {
                bool isHandshakePacket =
                    (wrapper->m_connectionState == ConnectionState::HandshakeInProgress) &&
                    (packet.kind == PacketKind::Text)                                    &&
                    (packet.text.length > 1)                                             &&
                    (packet.text.utf8Bytes[0] == '<');

                if (isHandshakePacket)
					wrapper->OnHandshakeReceived(packet.text);
                else
                    wrapper->OnDataReceived(packet);
            }
            catch (Exception^ ex) {
                Debug::WriteLine(String::Format("StaticDataHandler Exception: {0}", ex));
                try {
                    wrapper->RaiseErrorOccurredEvent(gcnew Exception("Exception in StaticDataHandler callback processing.", ex));
                }
                catch (...) {/* Ignore */ }
            }
        }
        else { Debug::WriteLine("StaticDataHandler WARNING: Wrapper null or disposed."); }
    }

    void SerialHelper::StaticErrorHandler(void* userData, CSerial* pSender, const std::exception& ex) {
        GCHandle handle = GCHandle::FromIntPtr(IntPtr(userData));
        SerialHelper^ wrapper = nullptr;
        try {
            if (handle.IsAllocated && handle.Target != nullptr) { wrapper = static_cast<SerialHelper^>(handle.Target); }
        }
        catch (Exception^ ex) { Debug::WriteLine(String::Format("StaticErrorHandler GCHandle: {0}", ex)); return; }

        if (wrapper != nullptr && !wrapper->m_disposed) {
            try {
                wrapper->OnErrorOccurred(ex);
            }
            catch (Exception^ exManaged) {
                Debug::WriteLine(String::Format("StaticErrorHandler Exception: {0}", exManaged));
            }
        }
        else { Debug::WriteLine("StaticErrorHandler WARNING: Wrapper null or disposed."); }
    }

    void SerialHelper::StaticConnectionHandler(void* userData, CSerial* pSender, const bool state) {
        GCHandle handle = GCHandle::FromIntPtr(IntPtr(userData));
        SerialHelper^ wrapper = nullptr;
        try {
            if (handle.IsAllocated && handle.Target != nullptr) { wrapper = static_cast<SerialHelper^>(handle.Target); }
        }
        catch (Exception^ ex) { Debug::WriteLine(String::Format("StaticConnectionHandler GCHandle: {0}", ex)); return; }

        if (wrapper != nullptr && !wrapper->m_disposed) {
            try {

                wrapper->OnConnectionChanged(state ? ConnectionState::Connected : ConnectionState::Disconnected);
            }
            catch (Exception^ ex) {
                Debug::WriteLine(String::Format("StaticConnectionHandler Exception: {0}", ex));
                try {
                    wrapper->RaiseErrorOccurredEvent(gcnew Exception("Exception in StaticConnectionHandler callback processing.", ex));
                }
                catch (...) {/* Ignore */ }
            }
        }
        else { Debug::WriteLine("StaticConnectionHandler WARNING: Wrapper null or disposed."); }
    }

    //---------------------------------------------------------------------
    // Private Instance Callback Handlers (Use Helper Structs)
    //---------------------------------------------------------------------

	void SerialHelper::OnDataReceived(const CDecodedPacket& packet) {  // packet is reused by decoder, do not store
        IPacket^ managedPacket = nullptr;
        try {

            managedPacket = Decoder::Convert(packet);  // this is the only use of packet.  managedPacket is rented and returned

        }
        catch (Exception^ ex) {
            Debug::WriteLine(String::Format("SerialHelper::OnDataReceived Error converting native packet: {0}", ex));
            RaiseErrorOccurredEvent(gcnew Exception("Failed to convert native packet data.", ex));
            return;
        }


        DataEventRaiser^ raiser = DataEventRaiser::Rent(this, managedPacket);

        if (m_managedCallbacks != nullptr) {
            try {
                m_managedCallbacks->Execute(raiser);
            }
            catch (ObjectDisposedException^) {
                Debug::WriteLine("SerialHelper::OnDataReceived Warning: ManagedCallbacks was disposed.");
            }
            catch (Exception^ ex) {
                Debug::WriteLine(String::Format("SerialHelper::OnDataReceived Error executing callback via ManagedCallbacks: {0}", ex));
                RaiseErrorOccurredEvent(gcnew Exception("Error executing DataReceived callback.", ex));
            }
        }
        else {
            Debug::WriteLine("SerialHelper::OnDataReceived Error: ManagedCallbacks instance is null.");
        }
    }

    void SerialHelper::OnErrorOccurred(const std::exception& ex) {
        Exception^ managedException = nullptr;
        try {
            managedException = ConvertStdException(ex);
        }
        catch (Exception^ conversionEx) {
            Debug::WriteLine(String::Format("SerialHelper::OnErrorOccurred Error converting native exception: {0}", conversionEx));
            String^ errMsg = gcnew String(ex.what());
            managedException = gcnew Exception(String::Format("Failed to convert native exception: {0}", errMsg), conversionEx);
        }

        ErrorEventRaiser^ raiser = ErrorEventRaiser::Rent(this, managedException);

        if (m_managedCallbacks != nullptr) {
            try {
                m_managedCallbacks->Execute(raiser);
            }
            catch (ObjectDisposedException^) {
                Debug::WriteLine("SerialHelper::OnErrorOccurred Warning: ManagedCallbacks was disposed.");
            }
            catch (Exception^ exCallback) {
                Debug::WriteLine(String::Format("SerialHelper::OnErrorOccurred Error executing ErrorOccurred callback itself: {0}", exCallback));
            }
        }
        else {
            Debug::WriteLine("SerialHelper::OnErrorOccurred Error: ManagedCallbacks instance is null.");
        }
    }

    void SerialHelper::OnConnectionChanged(ConnectionState state) {
        ConnectionEventRaiser^ raiser = ConnectionEventRaiser::Rent(this, state);

        if (m_managedCallbacks != nullptr) {
            try {
				m_connectionState = state;
                m_managedCallbacks->Execute(raiser);
            }
            catch (ObjectDisposedException^) {
                Debug::WriteLine("SerialHelper::OnConnectionChanged Warning: ManagedCallbacks was disposed.");
            }
            catch (Exception^ exCallback) {
                Debug::WriteLine(String::Format("SerialHelper::OnConnectionChanged Error executing callback: {0}", exCallback));
                try {
                    RaiseErrorOccurredEvent(gcnew Exception("Error executing ConnectionChanged callback.", exCallback));
                }
                catch (...) { /* Ignore exceptions from error handler itself */ }
            }
        }
        else {
            Debug::WriteLine("SerialHelper::OnConnectionChanged Error: ManagedCallbacks instance is null.");
        }
    }

    void SerialHelper::OnHandshakeReceived(const CTextPacket& message) {

        if (message.length == 0) return;

        Marshal::Copy(
            IntPtr((void*)message.utf8Bytes),
            m_managedBytes, 
            0,
            static_cast<int>(message.length)
        );
		m_handshakeLength = static_cast<int>(message.length);

		m_handshakeEvent->Set();
	}

    String^ SerialHelper::GetHandshakeResponse() { return UTF8Encoding::UTF8->GetString(m_managedBytes, 0, m_handshakeLength); }

    bool SerialHelper::TestHandshakeResponse(array<Byte>^ response){


        if (response->Length == 0) { OutputDebugString(L"SerialHelper::TestHandshakeResponse: No handshake received.\r\n"); return response->Length == 0; }

		int maxLength = min(m_handshakeLength, response->Length);

		OutputDebugString(L"SerialHelper::TestHandshakeResponse: Length = ");

		pin_ptr<const wchar_t> pinnedLen = PtrToStringChars(response->Length.ToString());
		OutputDebugString((LPCWSTR)pinnedLen);
        OutputDebugStringW(L" {");

        pin_ptr<const wchar_t> pinnedStr = PtrToStringChars(GetHandshakeResponse());
		OutputDebugString((LPCWSTR)pinnedStr);
		wchar_t lastChar = wcslen(pinnedStr) > 0 ? pinnedStr[wcslen(pinnedStr) - 1] : L'\0';
        if (lastChar == L'\n')
			OutputDebugStringW(L"}");
		else
    		OutputDebugStringW(L"}\r\n");

        for (int i = 0; i < maxLength; ++i) 
            if (m_managedBytes[i] != response[i]) return false;
		

		return true;
    }
} // End namespace TheLib
