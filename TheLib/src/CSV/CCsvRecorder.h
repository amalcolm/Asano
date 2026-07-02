#pragma once
#pragma managed(push, off)

#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <vector>
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
        void SetTestName(std::wstring testName) noexcept;

    private:
        static constexpr size_t RequiredSequenceRepeats = 3;
        static constexpr size_t MaxDiscoveryStates = 1024;

        std::mutex m_mutex;
        std::unique_ptr<CCsvSession> m_session;
        std::wstring m_testName{ L"_Startup" };
        std::vector<uint32_t> m_discoveryStates;
        uint64_t m_droppedSamples{};

        void QueueSamples(CCsvSession& session, const CCsvSample* samples, size_t count) noexcept;
        bool ObserveDiscoveryState(uint32_t state);
        bool TryFindRepeatedSuffix(size_t& sequenceStart, size_t& sequenceLength) const;
        void TrimDiscoveryStates();
        void ClearDiscovery() noexcept;
        void ReportDroppedSample() noexcept;
    };
}

#pragma managed(pop)
