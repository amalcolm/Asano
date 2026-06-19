#pragma once
#pragma managed(push, off)

#include <atomic>
#include <memory>
#include <string>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include "CBufferedCsvFile.h"
#include "CEnvelopeCsvWriter.h"
#include "CCsvSampleQueue.h"

namespace NativeCsv
{
    class CCsvSession
    {
    public:
        explicit CCsvSession(std::wstring sessionDirectory);
        ~CCsvSession();

        CCsvSession(const CCsvSession&) = delete;
        CCsvSession& operator=(const CCsvSession&) = delete;

        bool TryAdd(const CCsvSample& sample) noexcept;
        void Stop() noexcept;

    private:
        struct StateFile
        {
            std::string description;
            std::string filename;
            CBufferedCsvFile writer;
        };

        static constexpr size_t QueueCapacity = 8192;

        std::wstring m_sessionDirectory;
        CCsvSampleQueue m_queue;
        std::thread m_writerThread;
        std::atomic<bool> m_stopped{};
        std::unordered_map<uint32_t, std::unique_ptr<StateFile>> m_stateFiles;
        std::unordered_set<std::string> m_usedFilenames;
        CEnvelopeCsvWriter m_envelopes;
        std::string m_line;

        void WriterLoop() noexcept;
        void WriteStateSample(const CCsvSample& sample);
        StateFile& GetStateFile(uint32_t state);
        std::string GetFilenameForState(const std::string& stateDescription);
    };
}

#pragma managed(pop)
