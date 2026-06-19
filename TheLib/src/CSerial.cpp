#include "CSerial.h"
#pragma managed(push, off)
#include "Packets/CDecoder.h"

#include <chrono>
#include <thread>
#include <iostream>
#include <memory>
#include <atomic>
#include <sstream>

static CDecoder decoder;

#include <stdexcept> // Include for std::exception

// Error handling macro for Windows API calls
#define CHECK(expr, handle, errorMsg) \
    if (!(expr)) { \
        DWORD error = GetLastError(); \
        if (handle != INVALID_HANDLE_VALUE) CloseHandle(handle); \
        std::ostringstream os; \
        os << errorMsg << " Error: " << error << " (" << GetErrorMessage(error) << ")\r\n"; \
        OutputDebugString(os.str().c_str()); \
        InvokeErrorOccurred(std::runtime_error(os.str())); \
        return false; \
    }

CSerial::CSerial()
    : m_hSerial(INVALID_HANDLE_VALUE)
    , m_isOpen(false)
    , m_baudRate(DEFAULT_BAUDRATE)
    , m_stopReadLoop(false)
	, m_dataHandler(nullptr)
	, m_connectionHandler(nullptr)
	, m_errorHandler(nullptr)
	, m_readThread()
    , m_userData(nullptr)
	, m_mutex()
	, m_readLoopRunning(false)
	, m_decodedPacket(new CDecodedPacket()) // Allocate decodedPacket
{ }


CSerial::~CSerial() {
    Close();  // Ensure proper cleanup
}


void CSerial::InvokeConnectionChanged(bool state) {
    if (!state)
        m_csvRecorder.CloseCurrentSession();

    ConnectionHandler handler = nullptr;
    void* context = nullptr;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        handler = m_connectionHandler;
        context = m_userData; // Get user data under lock
    }

    // Invoke outside the lock
    if (handler) {
        try {
            handler(context, this, state); // Pass user data
        }
        catch (const std::exception& e) {
            OutputDebugStringA("CSerial: Exception caught during ConnectionChanged callback: ");
            OutputDebugStringA(e.what());
            OutputDebugStringA("\r\n");
            // Avoid calling InvokeErrorOccurred from here to prevent potential infinite loops
        }
        catch (...) {
            OutputDebugStringA("CSerial: Unknown exception caught during ConnectionChanged callback.\r\n");
        }
    }
}


void CSerial::InvokeErrorOccurred(const std::exception& ex) {
    ErrorHandler handler = nullptr;
    void* context = nullptr;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        handler = m_errorHandler;
        context = m_userData; // Get user data under lock
    }

    // Invoke outside the lock
    if (handler) {
        try {
            handler(context, this, ex); // Pass user data
        }
        catch (const std::exception& e) {
            OutputDebugStringA("CSerial: Exception caught during ErrorOccurred callback: ");
            OutputDebugStringA(e.what());
            OutputDebugStringA("\r\n");
        }
        catch (...) {
            OutputDebugString(L"CSerial: Unknown exception caught during ErrorOccurred callback.\r\n");
        }
    }
}

void CSerial::InvokeDataReceived(CPacket& packet) {
    DataHandler handler = nullptr;
    void* context = nullptr;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        handler = m_dataHandler;
        context = m_userData; // Get user data under lock
    }

	CDecodedPacket& dataPacket = *m_decodedPacket;  // single reusable decoded packet

    for (;;) {
        auto kind = decoder.process(packet, dataPacket);
        if (kind == PacketKind::Unknown)
            break;
        packet.bytesRead = 0; // Mark as consumed

		// Ignore lone carriage return text packets
        if (kind == PacketKind::Text && dataPacket.text.length == 1 && dataPacket.text.utf8Bytes[0] == '\r')
            continue;

        if (kind == PacketKind::Block && dataPacket.block.state == CDataPacket::STATE_UNSET)
            continue;

        m_csvRecorder.OnDecodedPacket(dataPacket);

        // Invoke outside the lock
        if (handler) {
            try {
				handler(context, this, dataPacket); // call hander with reusable packet reference
            }
            catch (const std::exception& e) {
                OutputDebugStringA("CSerial: Exception caught during DataReceived callback: ");
                OutputDebugStringA(e.what());
                OutputDebugStringA("\r\n");
                // Optionally invoke error handler here if desired, carefully
                // InvokeErrorOccurred(std::runtime_error("Exception in DataReceived callback: " + std::string(e.what())));
            }
            catch (...) {
                OutputDebugStringA("CSerial: Unknown exception caught during DataReceived callback.\r\n");
                // InvokeErrorOccurred(std::runtime_error("Unknown exception in DataReceived callback"));
            }
        }
	}
}

bool CSerial::SetPort(const std::string& portName, DataHandler dataHandler, void* userData, int baudRate) {

    static constexpr int RETRIES = 10;
    static constexpr int TOTALWAIT = 3000; // ms

    static constexpr int RETRY_DELAY = TOTALWAIT / (RETRIES-1);

    // Close any existing connection first (this is fine outside the lock)
    if (IsOpen()) Close();
    
    m_isClosing = false;

    HANDLE hSerial = INVALID_HANDLE_VALUE; // Declare outside lock scope
    const char* failStage = nullptr;

    while (true)
    {
        // --- Port Opening and Configuration ---

        std::string fullPortName = "\\\\.\\" + portName;
        
        for (int i = 10; i > 0; i--)
        {
            hSerial = CreateFileA(
                fullPortName.c_str(),
                GENERIC_READ | GENERIC_WRITE,
                0,
                NULL,
                OPEN_EXISTING,
                FILE_FLAG_OVERLAPPED,
                NULL
            );

            if (hSerial == INVALID_HANDLE_VALUE) {
                DWORD err = GetLastError();
                if (err == ERROR_FILE_NOT_FOUND) {
                    if (i > 1)
                        std::this_thread::sleep_for(std::chrono::milliseconds(RETRY_DELAY));
                    continue;   // try again
                }
                else {
                    failStage = "CreateFileA failed to open serial port.";
                    break;      // bail out, non-retryable
                }
            }

            // Success: break early
            break;
        }


        if (hSerial == INVALID_HANDLE_VALUE && failStage == nullptr)
            failStage = "Serial port not found.";

        if (failStage != nullptr)
            break;  // exits outer while


        DCB dcbSerialParams = { 0 };
        dcbSerialParams.DCBlength = sizeof(dcbSerialParams);
        if (!GetCommState(hSerial, &dcbSerialParams)) {
            failStage = "GetCommState failed.";
            break;
        }

        dcbSerialParams.BaudRate = baudRate;
        dcbSerialParams.ByteSize = 8;
        dcbSerialParams.StopBits = ONESTOPBIT;
        dcbSerialParams.Parity = NOPARITY;
        dcbSerialParams.fBinary = TRUE;

        // --- DTR / RTS and flow control ---
        // No hardware handshaking unless you explicitly want it:
        dcbSerialParams.fOutxCtsFlow = FALSE;
        dcbSerialParams.fOutxDsrFlow = FALSE;
        dcbSerialParams.fOutX = FALSE;
        dcbSerialParams.fInX = FALSE;

        // This is the native equivalent of SerialPort.DtrEnable = true;
        dcbSerialParams.fDtrControl = DTR_CONTROL_ENABLE;   // assert DTR while port is open
        // Optional, similar for RTS:
        dcbSerialParams.fRtsControl = RTS_CONTROL_ENABLE;   // or RTS_CONTROL_HANDSHAKE if you use RTS/CTS

        if (!SetCommState(hSerial, &dcbSerialParams)) {
            failStage = "SetCommState failed.";
            break;
        }


        SetupComm(hSerial, 1 << 16, 1 << 16);           // 64K in/out buffers
        PurgeComm(hSerial, PURGE_RXCLEAR | PURGE_TXCLEAR | PURGE_RXABORT | PURGE_TXABORT);

		break; // Success
    }

    if (failStage != nullptr) {
        DWORD errorCode = GetLastError();
        if (hSerial != INVALID_HANDLE_VALUE) CloseHandle(hSerial);
        std::ostringstream os; os << failStage << ". Error: " << errorCode;
        OutputDebugStringA(os.str().c_str());
		OutputDebugStringW(L"\r\n");
        InvokeErrorOccurred(std::runtime_error(os.str()));
        return false;
    }


    {
        std::lock_guard<std::mutex> g(m_mutex);
        m_userData = userData;
        m_dataHandler = dataHandler;
        m_baudRate = baudRate;
        m_hSerial.reset(hSerial);              // take ownership
        hSerial = INVALID_HANDLE_VALUE;        // prevent double-close
        m_isOpen = true;
        m_stopReadLoop = false;
    }

    // --- Phase 3: start thread and raise events out of the lock ---
    if (m_readThread.joinable()) {
        try { m_readThread.join(); }
        catch (...) {}
    }

    m_readThread = std::thread(&CSerial::ReadLoop, this);

    while (!m_isClosing && m_readLoopRunning.load(std::memory_order_acquire) == false)
        std::this_thread::sleep_for(std::chrono::milliseconds(1));

    InvokeConnectionChanged(true);
    return true;
}


void CSerial::ReadLoop()
{
    m_readLoopRunning.store(true, std::memory_order_release);
    // Create an auto-reset event for the read OVERLAPPED
	HANDLE hEvent = CreateEvent(nullptr, FALSE, FALSE, nullptr);
    if (hEvent == nullptr) {
        const DWORD le = GetLastError();
        std::ostringstream os; os << "CreateEvent failed in ReadLoop. Error: " << le;
        InvokeErrorOccurred(std::runtime_error(os.str()));
        m_readLoopRunning.store(false, std::memory_order_release);
        return;
    }

    OVERLAPPED ov{}; // will be re-initialised before each ReadFile

    std::vector<BYTE> buffer(READ_BUFFER_SIZE);

    const auto start = std::chrono::steady_clock::now();

    for (;;) {
        // Cooperative shutdown
        if (m_stopReadLoop.load(std::memory_order_acquire)) {
            break;
        }

        // Snapshot the handle under lock, then operate lock-free
        HANDLE h = INVALID_HANDLE_VALUE;
        bool   isOpen = false;
        {
            std::lock_guard<std::mutex> g(m_mutex);
            isOpen = m_isOpen;
            h = m_hSerial.get();
        }
        if (!isOpen || h == INVALID_HANDLE_VALUE) {
            break; // port closed while running
        }


        COMSTAT comStat{};
        DWORD   errors = 0;
            if (!ClearCommError(h, &errors, &comStat)) {
            const DWORD le = GetLastError();
            std::ostringstream os; os << "ClearCommError failed in ReadLoop. Error: " << le;
            InvokeErrorOccurred(std::runtime_error(os.str()));

            if (le == 22)
            {
                InvokeConnectionChanged(false);
				break;
            }

            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            continue;
        }

        DWORD queued = comStat.cbInQue;



        // If a Clear() is in progress and the driver says there's nothing queued,
        // we can signal completion and skip doing any reads this iteration.
        if (m_clearRequested.load(std::memory_order_acquire)) {
            if (queued == 0) {
                {
                    std::lock_guard<std::mutex> lk(m_clearMutex);
                    m_clearRequested.store(false, std::memory_order_release);
                }
                m_clearCv.notify_all();
                // No data to drain, just loop again
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
                continue;
            }
            // queued > 0 and clear is requested:
            // we will read and discard below.
        }
        if (queued == 0) {
            // Nothing buffered right now – short pause to avoid busy-spin
               std::this_thread::sleep_for(std::chrono::milliseconds(1));
            continue;
        }

        // We know there is data. Decide how much to ask for this time.
        DWORD requestSize = (std::min)(queued, static_cast<DWORD>(READ_BUFFER_SIZE));

        DWORD bytesRead = 0;

        // Re-initialise OVERLAPPED for this operation
        ZeroMemory(&ov, sizeof(ov));
        ov.hEvent = hEvent;

        // Issue the overlapped read
        BOOL issued = ReadFile(
            h,
            buffer.data(),
            requestSize,
            &bytesRead,
            &ov);

        if (!issued) {
            const DWORD err = GetLastError();
            if (err == ERROR_IO_PENDING) {
                // Wait in short slices so we can notice a stop request and cancel the specific I/O.
                for (;;) {
                    if (m_stopReadLoop.load(std::memory_order_acquire)) {
                        CancelIoEx(h, &ov); // cancel just this read
                    }
                    DWORD w = WaitForSingleObject(ov.hEvent, 100); // 100 ms slice (tune if you like)
                    if (w == WAIT_OBJECT_0) break;     // completed
                    if (w == WAIT_FAILED) {
                        const DWORD we = GetLastError();
                        std::ostringstream os; os << "WaitForSingleObject failed. Error: " << we;
                        InvokeErrorOccurred(std::runtime_error(os.str()));
                        // Best effort: cancel and try again
                        CancelIoEx(h, &ov);
                        bytesRead = 0;
                        break;
                    }
                    // WAIT_TIMEOUT ? loop and re-check stop flag
                }

                BOOL ok = GetOverlappedResult(h, &ov, &bytesRead, FALSE);
                if (!ok) {
                    const DWORD ge = GetLastError();
                    if (ge == ERROR_OPERATION_ABORTED) {
                        // Normal during Close(); exit
                        break;
                    }
                    // Transient failure — report and continue
                    std::ostringstream os; os << "GetOverlappedResult failed. Error: " << ge;
                    InvokeErrorOccurred(std::runtime_error(os.str()));
                    std::this_thread::sleep_for(std::chrono::milliseconds(1));
                    continue;
                }
            }
            else if (err == ERROR_OPERATION_ABORTED) {
                // Close() canceled us
                break;
            }
            else {
                // Immediate ReadFile failure unrelated to pending I/O
                std::ostringstream os; os << "ReadFile failed. Error: " << err;
                InvokeErrorOccurred(std::runtime_error(os.str()));
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
                continue;
            }
        }

        // If we got here with bytesRead set (sync or async paths)
        if (bytesRead == 0)
            continue;
        
        // If Clear() is in progress, we *intentionally* throw these bytes away.
        // They count toward "draining" the OS buffer, but we don't decode or callback.
        if (m_clearRequested.load(std::memory_order_acquire))
            continue;
        

        // Build and dispatch the packet (no locks held during callback)
        CPacket pkt{};
        auto now = std::chrono::steady_clock::now();
        pkt.timestamp = static_cast<uint32_t>(std::chrono::duration_cast<std::chrono::milliseconds>(now - start).count());
        pkt.bytesRead = bytesRead;
        pkt.data.assign(buffer.begin(), buffer.begin() + bytesRead);

        InvokeDataReceived(pkt);
    }

    // Silent exit: SetPort/Close handle connection state notifications
    CloseHandle(hEvent);
	m_readLoopRunning.store(false, std::memory_order_release);
}




bool CSerial::Write(const std::string& data) {
    // Forward to byte array version
    return Write(reinterpret_cast<const BYTE*>(data.c_str()), 0, static_cast<DWORD>(data.length()));
}

bool CSerial::Write(const BYTE* data, DWORD offset, DWORD count)
{
    if (IsOpen() == false) {
        return false;
	}
    // Snapshot handle under lock, but don't call callbacks while holding it
    HANDLE hSerialLocal = INVALID_HANDLE_VALUE;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (m_isOpen && m_hSerial.get() != INVALID_HANDLE_VALUE)
            hSerialLocal = m_hSerial.get();
    }

 
    if (hSerialLocal == INVALID_HANDLE_VALUE) {
        InvokeErrorOccurred(std::runtime_error("Write attempted on closed or invalid port."));
        return false;
    }

    if (count == 0)
        return true; // nothing to do


    const BYTE* p = data + offset;
    DWORD       remaining = count;

    // Event for this write sequence (auto-reset is fine; kernel manages it for overlapped I/O)
    HandleGuard eventHandle(CreateEvent(nullptr, FALSE, FALSE, nullptr));
    if (!eventHandle.get()) {
        DWORD le = GetLastError();
        std::ostringstream os; os << "CreateEvent failed in Write. Error: " << le;
        InvokeErrorOccurred(std::runtime_error(os.str()));
        return false;
    }

    OVERLAPPED overlapped{};
    overlapped.hEvent = eventHandle.get();

    while (remaining > 0) {
        DWORD bytesWritten = 0;

        // Issue overlapped write
        BOOL writeResult = WriteFile(
            hSerialLocal,
            p,
            remaining,
            nullptr,         // ignored for overlapped
            &overlapped);

        if (!writeResult) {
            DWORD error = GetLastError();

            if (error == ERROR_IO_PENDING) {
                // Wait for completion with a timeout
                DWORD waitResult = WaitForSingleObject(overlapped.hEvent, IO_OPERATION_TIMEOUT);
                if (waitResult == WAIT_OBJECT_0) {
                    // Operation completed; fetch the result
                    if (!GetOverlappedResult(hSerialLocal, &overlapped, &bytesWritten, FALSE)) {
                        DWORD overlappedError = GetLastError();
                        if (overlappedError != ERROR_OPERATION_ABORTED) {
                            std::ostringstream os;
                            os << "GetOverlappedResult failed in Write. Error: " << overlappedError;
                            InvokeErrorOccurred(std::runtime_error(os.str()));
                        }
                        return false;
                    }
                }
                else {
                    // Timeout or wait error
                    DWORD waitError = (waitResult == WAIT_TIMEOUT) ? ERROR_TIMEOUT : GetLastError();
                    CancelIoEx(hSerialLocal, &overlapped);

                    std::ostringstream os;
                    os << "WaitForSingleObject failed in Write. WaitResult: "
                        << waitResult << " Error: " << waitError;
                    InvokeErrorOccurred(std::runtime_error(os.str()));
                    return false;
                }
            }
            else if (error == ERROR_OPERATION_ABORTED) {
                // Port was closed while write in flight
                InvokeErrorOccurred(std::runtime_error("Write canceled because the port was closed."));
                return false;
            }
            else {
                std::ostringstream os;
                os << "WriteFile failed directly in Write. Error: " << error;
                InvokeErrorOccurred(std::runtime_error(os.str()));
                return false;
            }
        }
        else {
            // Completed synchronously (even with OVERLAPPED, lpBytesWritten is ignored)
            if (!GetOverlappedResult(hSerialLocal, &overlapped, &bytesWritten, FALSE)) {
                DWORD overlappedError = GetLastError();
                if (overlappedError != ERROR_OPERATION_ABORTED) {
                    std::ostringstream os;
                    os << "GetOverlappedResult failed (sync write). Error: " << overlappedError;
                    InvokeErrorOccurred(std::runtime_error(os.str()));
                }
                return false;
            }
        }

        if (bytesWritten == 0) {
            InvokeErrorOccurred(std::runtime_error("WriteFile wrote zero bytes."));
            return false;
        }

        // Advance pointer and reduce remaining count
        remaining -= bytesWritten;
        p += bytesWritten;

        // Prepare OVERLAPPED for the next chunk
        ZeroMemory(&overlapped, sizeof(overlapped));
        overlapped.hEvent = eventHandle.get();
    }

    return true;
}

void CSerial::Clear()
{
    if (!m_readLoopRunning.load(std::memory_order_acquire))
        return;

    // Ask read loop to drain & discard
    {
        std::unique_lock<std::mutex> lk(m_clearMutex);
        m_clearRequested.store(true, std::memory_order_release);

        m_clearCv.wait(lk, [this] {
            return !m_clearRequested.load(std::memory_order_acquire) ||
                !m_readLoopRunning.load(std::memory_order_acquire);
            });

        m_clearRequested.store(false, std::memory_order_release);
    } 

    {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (m_isOpen && m_hSerial.get() != INVALID_HANDLE_VALUE) 
            PurgeComm(m_hSerial.get(), PURGE_RXCLEAR | PURGE_TXCLEAR | PURGE_RXABORT | PURGE_TXABORT);
        
        decoder.reset();
    }
}


bool CSerial::Close()
{
    if (m_isClosing) return false; // already in the process of closing
	
    m_isClosing = true;

    // Tell the read thread to stop as soon as possible
    m_stopReadLoop.store(true, std::memory_order_release);

    std::thread threadToJoin;    // thread we will join outside the lock
    bool        wasOpen = false; // track whether we were actually open

    {
        std::lock_guard<std::mutex> lock(m_mutex);

        wasOpen = m_isOpen;

        // If there's a read thread, always move it to the local variable so we can join it.
        if (m_readThread.joinable()) {
            threadToJoin = std::move(m_readThread);
        }

        if (m_isOpen) {
            // We are currently open: cancel any pending I/O before closing the handle
            HANDLE h = m_hSerial.get();
            if (h != INVALID_HANDLE_VALUE) {
                if (!CancelIoEx(h, nullptr)) {
                    DWORD cancelError = GetLastError();
                    if (cancelError != ERROR_NOT_FOUND) {
                        ::OutputDebugStringA("Close: CancelIoEx failed. Error: ");
                        ::OutputDebugStringA(std::to_string(cancelError).c_str());
						::OutputDebugStringA("\r\n");
                    }
                }
            }

            // Close the underlying handle via RAII
            m_hSerial.reset();
            m_isOpen = false;
            m_dataHandler = nullptr; // no more data callbacks after close
        }
    } 

    // Small delay to let any in-flight I/O settle before join (heuristic only)
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    // Join the read thread outside the lock to avoid deadlocks
    if (threadToJoin.joinable()) {
        try {
            threadToJoin.join();
        }
        catch (const std::system_error& e) {
            ::OutputDebugStringA("Close: Exception while joining read thread: ");
            ::OutputDebugStringA(e.what());
            ::OutputDebugStringA(" (");
            ::OutputDebugStringA(std::to_string(e.code().value()).c_str());
            ::OutputDebugStringA(")\r\n");
        }
    }

    // Only signal a connection state change if we were actually open
    if (wasOpen) InvokeConnectionChanged(false);
    
    return true;
}

// GetBaudRate implementation
int CSerial::GetBaudRate() const {
	std::lock_guard<std::mutex> lock(m_mutex);
	return m_baudRate;
}

// IsOpen implementation
bool CSerial::IsOpen() const {
	std::lock_guard<std::mutex> lock(m_mutex);
	return m_isOpen;
}

#pragma managed(pop)