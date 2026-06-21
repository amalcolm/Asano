#include "CCsvRecorder.h"

#pragma managed(push, off)

#include <Windows.h>
#include <utility>
#include "CCsvSessionPaths.h"

namespace NativeCsv
{
    CCsvRecorder::~CCsvRecorder()
    {
        CloseCurrentSession();
    }

    void CCsvRecorder::OnDecodedPacket(const CDecodedPacket& packet) noexcept
    {
        if (packet.kind != PacketKind::Block)
            return;

        CCsvSample sample;
        if (!CCsvSample::TryCopyLastFromBlock(packet.block, sample))
            return;

        try
        {
            std::lock_guard<std::mutex> lock(m_mutex);

            if (!m_session)
                m_session = std::make_unique<CCsvSession>(CCsvSessionPaths::CreateSessionDirectory(m_testName));

            if (!m_session->TryAdd(sample))
                ReportDroppedSample();
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
        }

        if (session)
            session->Stop();
    }

    void CCsvRecorder::ReportDroppedSample() noexcept
    {
        ++m_droppedSamples;

        if ((m_droppedSamples & 0x3FFull) == 1)
            OutputDebugStringA("NativeCsv: CSV writer queue is full; dropping samples.\r\n");
    }
}

#pragma managed(pop)
