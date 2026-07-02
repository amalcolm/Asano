#pragma once
#pragma managed(push, off)

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>
#include "CBufferedCsvFile.h"
#include "CCsvSample.h"

namespace NativeCsv
{
    class CEnvelopeCsvWriter
    {
    public:
        explicit CEnvelopeCsvWriter(std::wstring path);

        CEnvelopeCsvWriter(const CEnvelopeCsvWriter&) = delete;
        CEnvelopeCsvWriter& operator=(const CEnvelopeCsvWriter&) = delete;

        void Add(const CCsvSample& sample);
        void Finish();

    private:
        struct EnvelopeCell
        {
            double timestamp{};
            double value{};
        };

        struct EnvelopeRow
        {
            std::vector<EnvelopeCell> cells;
            std::vector<uint8_t> hasCell;
        };

        static constexpr size_t RequiredSequenceRepeats = 3;
        static constexpr size_t MaxDiscoverySamples = 1024;

        std::wstring m_path;
        std::vector<uint32_t> m_sequence;
        std::vector<CCsvSample> m_discoverySamples;
        EnvelopeRow m_currentRow;
        CBufferedCsvFile m_writer;
        std::string m_line;
        size_t m_nextStateIndex{};
        bool m_headerWritten{};
        bool m_finished{};
        bool m_reportedUnexpectedState{};

        void AddDiscoverySample(const CCsvSample& sample);
        bool TryLockSequence();
        bool TryFindRepeatedSuffix(size_t& sequenceStart, size_t& sequenceLength) const;
        void TrimDiscoverySamples();
        void AddLockedSample(const CCsvSample& sample);
        bool TryFindStatePosition(uint32_t state, size_t start, size_t& position) const;
        void ResetCurrentRow();
        bool CurrentRowHasData() const;
        void WriteHeader();
        void WriteRow(const EnvelopeRow& row);
    };
}

#pragma managed(pop)
