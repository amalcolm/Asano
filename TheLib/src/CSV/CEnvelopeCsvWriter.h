#pragma once
#pragma managed(push, off)

#include <cstdint>
#include <string>
#include <unordered_map>
#include <unordered_set>
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

        static constexpr size_t HeaderWarmupRows = 3;

        std::wstring m_path;
        std::unordered_map<uint32_t, size_t> m_stateIndexes;
        std::unordered_map<uint32_t, EnvelopeCell> m_current;
        std::unordered_set<uint32_t> m_lateStates;
        std::vector<uint32_t> m_states;
        std::vector<EnvelopeRow> m_pendingRows;
        CBufferedCsvFile m_writer;
        std::string m_line;
        bool m_headerWritten{};
        bool m_finished{};

        bool EnsureState(uint32_t state);
        void EmitCurrentRow();
        void WriteHeaderAndPendingRows();
        void WriteHeader();
        void WriteRow(const EnvelopeRow& row);
    };
}

#pragma managed(pop)
