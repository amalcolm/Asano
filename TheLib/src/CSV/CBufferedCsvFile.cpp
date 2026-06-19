#include "CBufferedCsvFile.h"

#pragma managed(push, off)

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <limits>

namespace NativeCsv
{
    namespace
    {
        constexpr uint64_t kReserveThreshold = 4ull * 1024ull * 1024ull;
        constexpr uint64_t kReserveChunk = 8ull * 1024ull * 1024ull;

        uint64_t RoundUp(uint64_t value, uint64_t chunk) noexcept
        {
            return ((value + chunk - 1) / chunk) * chunk;
        }
    }

    CBufferedCsvFile::CBufferedCsvFile(size_t bufferSize)
        : m_handle(INVALID_HANDLE_VALUE)
        , m_buffer(bufferSize)
    {
    }

    CBufferedCsvFile::~CBufferedCsvFile()
    {
        Close();
    }

    bool CBufferedCsvFile::Open(const std::wstring& path)
    {
        Close();

        std::error_code ec;
        std::filesystem::create_directories(std::filesystem::path(path).parent_path(), ec);

        HANDLE handle = CreateFileW(
            path.c_str(),
            GENERIC_WRITE,
            FILE_SHARE_READ,
            nullptr,
            CREATE_ALWAYS,
            FILE_ATTRIBUTE_NORMAL | FILE_FLAG_SEQUENTIAL_SCAN,
            nullptr);

        if (handle == INVALID_HANDLE_VALUE)
        {
            ReportError("CreateFileW", GetLastError());
            m_failed = true;
            return false;
        }

        m_handle.reset(handle);
        m_used = 0;
        m_bytesWritten = 0;
        m_reservedBytes = 0;
        m_failed = false;

        return true;
    }

    void CBufferedCsvFile::Append(std::string_view bytes)
    {
        if (m_failed || !IsOpen() || bytes.empty())
            return;

        if (bytes.size() > m_buffer.size())
        {
            Flush();
            WriteBytes(bytes.data(), bytes.size());
            return;
        }

        if (m_used + bytes.size() > m_buffer.size())
            Flush();

        std::memcpy(m_buffer.data() + m_used, bytes.data(), bytes.size());
        m_used += bytes.size();
    }

    void CBufferedCsvFile::Append(char c)
    {
        Append(std::string_view(&c, 1));
    }

    void CBufferedCsvFile::Close() noexcept
    {
        Flush();
        m_handle.reset();
        m_used = 0;
    }

    bool CBufferedCsvFile::IsOpen() const noexcept
    {
        return m_handle.get() != INVALID_HANDLE_VALUE;
    }

    void CBufferedCsvFile::Flush() noexcept
    {
        if (m_used == 0 || m_failed || !IsOpen())
            return;

        WriteBytes(m_buffer.data(), m_used);
        m_used = 0;
    }

    void CBufferedCsvFile::WriteBytes(const char* data, size_t bytes) noexcept
    {
        if (m_failed || !IsOpen())
            return;

        ReserveFor(m_bytesWritten + bytes);

        const char* cursor = data;
        size_t remaining = bytes;

        while (remaining > 0)
        {
            DWORD chunk = static_cast<DWORD>((std::min)(remaining, static_cast<size_t>((std::numeric_limits<DWORD>::max)())));
            DWORD written = 0;

            if (!WriteFile(m_handle.get(), cursor, chunk, &written, nullptr) || written == 0)
            {
                ReportError("WriteFile", GetLastError());
                m_failed = true;
                return;
            }

            cursor += written;
            remaining -= written;
            m_bytesWritten += written;
        }
    }

    void CBufferedCsvFile::ReserveFor(uint64_t endOffset) noexcept
    {
        if (endOffset < kReserveThreshold || endOffset <= m_reservedBytes || !IsOpen())
            return;

        FILE_ALLOCATION_INFO info{};
        info.AllocationSize.QuadPart = static_cast<LONGLONG>(RoundUp(endOffset, kReserveChunk));

        if (SetFileInformationByHandle(m_handle.get(), FileAllocationInfo, &info, sizeof(info)))
            m_reservedBytes = static_cast<uint64_t>(info.AllocationSize.QuadPart);
        else
            m_reservedBytes = endOffset;
    }

    void CBufferedCsvFile::ReportError(const char* operation, DWORD error) noexcept
    {
        char message[160]{};
        std::snprintf(message, sizeof(message), "NativeCsv: %s failed, error %lu\r\n", operation, error);
        OutputDebugStringA(message);
    }
}

#pragma managed(pop)
