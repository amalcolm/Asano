#include "CCsvSession.h"

#pragma managed(push, off)

#include <Windows.h>
#include <filesystem>
#include <utility>
#include "CCsvFormatter.h"
#include "CCsvNames.h"
#include "CCsvStateNames.h"

namespace NativeCsv
{
    CCsvSession::CCsvSession(std::wstring sessionDirectory)
        : m_sessionDirectory(std::move(sessionDirectory))
        , m_queue(QueueCapacity)
        , m_envelopes((std::filesystem::path(m_sessionDirectory) / L"envelopes.csv").wstring())
    {
        m_line.reserve(256);
        m_writerThread = std::thread(&CCsvSession::WriterLoop, this);
    }

    CCsvSession::~CCsvSession()
    {
        Stop();
    }

    bool CCsvSession::TryAdd(const CCsvSample& sample) noexcept
    {
        if (m_stopped.load(std::memory_order_acquire))
            return false;

        return m_queue.TryPush(sample);
    }

    void CCsvSession::Stop() noexcept
    {
        bool expected = false;
        if (!m_stopped.compare_exchange_strong(expected, true, std::memory_order_acq_rel))
            return;

        m_queue.Complete();

        if (m_writerThread.joinable())
            m_writerThread.join();
    }

    void CCsvSession::WriterLoop() noexcept
    {
        CCsvSample sample;
        while (m_queue.WaitPop(sample))
        {
            try
            {
                WriteStateSample(sample);

                if (sample.includeInEnvelope)
                    m_envelopes.Add(sample);
            }
            catch (...)
            {
                OutputDebugStringA("NativeCsv: exception while writing sample.\r\n");
            }
        }

        try
        {
            m_envelopes.Finish();
            m_stateFiles.clear();
        }
        catch (...)
        {
            OutputDebugStringA("NativeCsv: exception while closing session.\r\n");
        }
    }

    void CCsvSession::WriteStateSample(const CCsvSample& sample)
    {
        StateFile& stateFile = GetStateFile(sample.state);

        m_line.clear();
        CCsvFormatter::AppendStateRow(m_line, sample, stateFile.description);
        stateFile.writer.Append(m_line);
    }

    CCsvSession::StateFile& CCsvSession::GetStateFile(uint32_t state)
    {
        auto existing = m_stateFiles.find(state);
        if (existing != m_stateFiles.end())
            return *existing->second;

        auto stateFile = std::make_unique<StateFile>();
        stateFile->description = CCsvStateNames::Describe(state);
        stateFile->filename = GetFilenameForState(stateFile->description);

        std::filesystem::path path = std::filesystem::path(m_sessionDirectory) / (std::wstring(stateFile->filename.begin(), stateFile->filename.end()) + L".csv");
        stateFile->writer.Open(path.wstring());
        stateFile->writer.Append("timestamp,state,top,bot,mid,offset,gain,sensor1,sensor2\r\n");

        StateFile& result = *stateFile;
        m_stateFiles.emplace(state, std::move(stateFile));

        return result;
    }

    std::string CCsvSession::GetFilenameForState(const std::string& stateDescription)
    {
        std::string baseName = CCsvNames::Sanitize(stateDescription);
        std::string candidate = baseName;
        int suffix = 2;

        while (!m_usedFilenames.insert(CCsvNames::LowerAscii(candidate)).second)
            candidate = baseName + "_" + std::to_string(suffix++);

        return candidate;
    }
}

#pragma managed(pop)
