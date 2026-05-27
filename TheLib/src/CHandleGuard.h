#pragma once
#define WIN32_LEAN_AND_MEAN
#include <Windows.h>

// RAII wrapper for Windows HANDLE
class HandleGuard {
public:
    HandleGuard(HANDLE handle = INVALID_HANDLE_VALUE) : m_handle(handle) {}

    ~HandleGuard() {
        if (m_handle != INVALID_HANDLE_VALUE) {
            CloseHandle(m_handle);
        }
    }

    HandleGuard(const HandleGuard&) = delete;
    HandleGuard& operator=(const HandleGuard&) = delete;

    HandleGuard(HandleGuard&& other) noexcept : m_handle(other.m_handle) {
        other.m_handle = INVALID_HANDLE_VALUE;
    }

    HandleGuard& operator=(HandleGuard&& other) noexcept {
        if (this != &other) {
            if (m_handle != INVALID_HANDLE_VALUE) {
                CloseHandle(m_handle);
            }
            m_handle = other.m_handle;
            other.m_handle = INVALID_HANDLE_VALUE;
        }
        return *this;
    }

    HANDLE get() const { return m_handle; }

    // Release ownership without closing
    HANDLE release() {
        HANDLE tmp = m_handle;
        m_handle = INVALID_HANDLE_VALUE;
        return tmp;
    }

    // Reset with a new handle
    void reset(HANDLE handle = INVALID_HANDLE_VALUE) {
        if (m_handle != INVALID_HANDLE_VALUE) {
            CloseHandle(m_handle);
        }
        m_handle = handle;
    }

    operator HANDLE() const { return m_handle; }

private:
    HANDLE m_handle;
};

