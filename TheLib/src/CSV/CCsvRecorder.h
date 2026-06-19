#pragma once
#pragma managed(push, off)

#include <cstdint>
#include <memory>
#include <mutex>
#include "../Packets/CPackets.h"
#include "CCsvSession.h"

namespace NativeCsv
{
    class CCsvRecorder
    {
    public:
        CCsvRecorder() = default;
        ~CCsvRecorder();

        CCsvRecorder(const CCsvRecorder&) = delete;
        CCsvRecorder& operator=(const CCsvRecorder&) = delete;

        void OnDecodedPacket(const CDecodedPacket& packet) noexcept;
        void CloseCurrentSession() noexcept;

    private:
        std::mutex m_mutex;
        std::unique_ptr<CCsvSession> m_session;
        uint64_t m_droppedSamples{};

        void ReportDroppedSample() noexcept;
    };
}

#pragma managed(pop)
