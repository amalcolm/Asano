#pragma once
#pragma managed(push, off)

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>
#include "../CHandleGuard.h"

namespace NativeCsv
{
    class CBufferedCsvFile
    {
    public:
        explicit CBufferedCsvFile(size_t bufferSize = 1024 * 1024);
        ~CBufferedCsvFile();

        CBufferedCsvFile(const CBufferedCsvFile&) = delete;
        CBufferedCsvFile& operator=(const CBufferedCsvFile&) = delete;

        bool Open(const std::wstring& path);
        void Append(std::string_view bytes);
        void Append(char c);
        void Close() noexcept;
        bool IsOpen() const noexcept;

    private:
        HandleGuard m_handle;
        std::vector<char> m_buffer;
        size_t m_used{};
        uint64_t m_bytesWritten{};
        uint64_t m_reservedBytes{};
        bool m_failed{};

        void Flush() noexcept;
        void WriteBytes(const char* data, size_t bytes) noexcept;
        void ReserveFor(uint64_t endOffset) noexcept;
        void ReportError(const char* operation, DWORD error) noexcept;
    };
}

#pragma managed(pop)
