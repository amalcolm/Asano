#pragma once
#pragma managed(push, off)
#include "CHandleGuard.h"
#include "Packets/CPackets.h"

#define WIN32_LEAN_AND_MEAN
#include <Windows.h>

#include <string>
#include <vector>
#include <mutex>
#include <thread>  // Include thread for m_readThread
#include <atomic>  // Include atomic for m_stopReadLoop
#include <stdexcept> // Include for std::exception

class CSerial {
public:
    

    // Native C-Style Callback Function Pointer Types
    typedef void (*DataHandler)(void* userData, CSerial* sender, const CDecodedPacket& packet);  // packet is reused by decoder, do not store
    typedef void (*ErrorHandler)(void* userData, CSerial* sender, const std::exception& ex);
    typedef void (*ConnectionHandler)(void* userData, CSerial* sender, bool state);

    // Constructor / Destructor
    CSerial();
    ~CSerial();

    // SetPort: Sets DataHandler AND the single userData for ALL callbacks
    bool SetPort(const std::string& portName, DataHandler dataHandler, void* userData, int baudRate = DEFAULT_BAUDRATE);

    bool Write(const std::string& data);
    bool Write(const BYTE* data, DWORD offset, DWORD count);

    void Clear();

    bool Close();

    bool IsOpen() const;
    int GetBaudRate() const;

    // These only take the handler. The userData is assumed to be set via SetPort.
    void SetConnectionHandler(ConnectionHandler handler) {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_connectionHandler = handler;
    }

    void SetErrorHandler(ErrorHandler handler) {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_errorHandler = handler;
    }

    static const int DEFAULT_BAUDRATE = 57600 * 16;

private:
    static const int   READ_BUFFER_SIZE     = 4096;
    static const DWORD IO_OPERATION_TIMEOUT = 100;

    void ReadLoop();
    std::thread m_readThread;
    std::atomic<bool> m_stopReadLoop{ false };
    std::atomic<bool> m_readLoopRunning{ false };

    std::atomic<bool>        m_clearRequested{ false };
    std::mutex               m_clearMutex;
    std::condition_variable  m_clearCv;

    HandleGuard m_hSerial;
    bool m_isOpen;
	bool m_isClosing{ false };
    int m_baudRate;
    mutable std::mutex m_mutex;

    DataHandler       m_dataHandler;
    ErrorHandler      m_errorHandler;
    ConnectionHandler m_connectionHandler;

    void* m_userData;

    void InvokeConnectionChanged(bool state);
    void InvokeErrorOccurred(const std::exception& ex);
    void InvokeDataReceived(CPacket& packet);

    CDecodedPacket* m_decodedPacket;
};

#pragma managed(pop)
