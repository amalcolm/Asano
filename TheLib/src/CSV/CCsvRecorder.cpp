#include "CCsvRecorder.h"

#pragma managed(push, off)

#include <array>
#include <Windows.h>
#include <utility>
#include "CCsvSessionPaths.h"

namespace NativeCsv
{
    namespace
    {
        size_t CopyBlockSamples(const CBlockPacket& block, std::array<CCsvSample, CBlockPacket::MAX_BLOCK_SIZE>& samples) noexcept
        {
            size_t count = block.count;
            if (count > CBlockPacket::MAX_BLOCK_SIZE)
                count = CBlockPacket::MAX_BLOCK_SIZE;

            size_t copied = 0;
            for (size_t i = 0; i < count; ++i)
            {
                CCsvSample sample;
                if (!CCsvSample::TryCopyFromBlockAt(block, i, i + 1 == count, sample))
                    continue;

                samples[copied++] = sample;
            }

            return copied;
        }
    }

    CCsvRecorder::~CCsvRecorder()
    {
        CloseCurrentSession();
    }

    void CCsvRecorder::OnDecodedPacket(const CDecodedPacket& packet) noexcept
    {
        if (packet.kind != PacketKind::Block)
            return;

        try
        {
            std::array<CCsvSample, CBlockPacket::MAX_BLOCK_SIZE> samples{};
            size_t sampleCount = CopyBlockSamples(packet.block, samples);
            if (sampleCount == 0)
                return;

            std::lock_guard<std::mutex> lock(m_mutex);

            if (!m_session)
            {
                // Drop discovery blocks so old sequence tails do not enter the newly named session.
                if (!ObserveDiscoveryState(samples[sampleCount - 1].state))
                    return;

                m_session = std::make_unique<CCsvSession>(CCsvSessionPaths::CreateSessionDirectory(m_testName));
            }

            QueueSamples(*m_session, samples.data(), sampleCount);
        }
        catch (...)
        {
            OutputDebugStringA("NativeCsv: failed to queue sample.\r\n");
        }
    }

    void CCsvRecorder::CloseCurrentSession() noexcept
    {
        std::unique_ptr<CCsvSession> session;

        {
            std::lock_guard<std::mutex> lock(m_mutex);
            session = std::move(m_session);
            ClearDiscovery();
        }

        if (session)
            session->Stop();
    }

    void CCsvRecorder::SetTestName(std::wstring testName) noexcept
    {
        std::unique_ptr<CCsvSession> session;

        {
            std::lock_guard<std::mutex> lock(m_mutex);
            m_testName = testName.empty() ? L"_Startup" : std::move(testName);
            session = std::move(m_session);
            ClearDiscovery();
        }

        if (session)
            session->Stop();
    }

    void CCsvRecorder::QueueSamples(CCsvSession& session, const CCsvSample* samples, size_t count) noexcept
    {
        for (size_t i = 0; i < count; ++i)
        {
            if (!session.TryAdd(samples[i]))
                ReportDroppedSample();
        }
    }

    bool CCsvRecorder::ObserveDiscoveryState(uint32_t state)
    {
        m_discoveryStates.push_back(state);

        size_t sequenceStart = 0;
        size_t sequenceLength = 0;
        if (TryFindRepeatedSuffix(sequenceStart, sequenceLength))
        {
            ClearDiscovery();
            return true;
        }

        TrimDiscoveryStates();
        return false;
    }

    bool CCsvRecorder::TryFindRepeatedSuffix(size_t& sequenceStart, size_t& sequenceLength) const
    {
        const size_t count = m_discoveryStates.size();
        if (count < RequiredSequenceRepeats + 1)
            return false;

        const size_t repeatEnd = count - 1;
        const size_t maxLength = repeatEnd / RequiredSequenceRepeats;

        for (size_t candidateLength = 1; candidateLength <= maxLength; ++candidateLength)
        {
            const size_t start = repeatEnd - candidateLength * RequiredSequenceRepeats;
            bool matches = m_discoveryStates[count - 1] == m_discoveryStates[start];

            for (size_t i = 0; matches && i < candidateLength * RequiredSequenceRepeats; ++i)
                matches = m_discoveryStates[start + i] == m_discoveryStates[start + (i % candidateLength)];

            if (matches)
            {
                sequenceStart = start;
                sequenceLength = candidateLength;
                return true;
            }
        }

        return false;
    }

    void CCsvRecorder::TrimDiscoveryStates()
    {
        if (m_discoveryStates.size() <= MaxDiscoveryStates)
            return;

        const size_t removeCount = m_discoveryStates.size() - MaxDiscoveryStates;
        m_discoveryStates.erase(m_discoveryStates.begin(), m_discoveryStates.begin() + removeCount);
    }

    void CCsvRecorder::ClearDiscovery() noexcept
    {
        m_discoveryStates.clear();
    }

    void CCsvRecorder::ReportDroppedSample() noexcept
    {
        ++m_droppedSamples;

        if ((m_droppedSamples & 0x3FFull) == 1)
            OutputDebugStringA("NativeCsv: CSV writer queue is full; dropping samples.\r\n");
    }
}

#pragma managed(pop)
