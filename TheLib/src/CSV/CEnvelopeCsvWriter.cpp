#include "CEnvelopeCsvWriter.h"

#pragma managed(push, off)

#include <Windows.h>
#include <utility>
#include "CCsvFormatter.h"
#include "CCsvNames.h"
#include "CCsvStateNames.h"

namespace NativeCsv
{
    CEnvelopeCsvWriter::CEnvelopeCsvWriter(std::wstring path)
        : m_path(std::move(path))
    {
        m_discoverySamples.reserve(MaxDiscoverySamples);
        m_line.reserve(1024);
    }

    void CEnvelopeCsvWriter::Add(const CCsvSample& sample)
    {
        if (!m_headerWritten)
        {
            AddDiscoverySample(sample);
            return;
        }

        AddLockedSample(sample);
    }

    void CEnvelopeCsvWriter::Finish()
    {
        if (m_finished)
            return;

        m_finished = true;

        if (m_headerWritten && CurrentRowHasData())
            WriteRow(m_currentRow);

        m_writer.Close();
    }

    void CEnvelopeCsvWriter::AddDiscoverySample(const CCsvSample& sample)
    {
        m_discoverySamples.push_back(sample);

        if (!TryLockSequence())
            TrimDiscoverySamples();
    }

    bool CEnvelopeCsvWriter::TryLockSequence()
    {
        size_t sequenceStart = 0;
        size_t sequenceLength = 0;

        if (!TryFindRepeatedSuffix(sequenceStart, sequenceLength))
            return false;

        m_sequence.clear();
        m_sequence.reserve(sequenceLength);

        for (size_t i = 0; i < sequenceLength; ++i)
            m_sequence.push_back(m_discoverySamples[sequenceStart + i].state);

        m_writer.Open(m_path);
        WriteHeader();
        m_headerWritten = true;
        ResetCurrentRow();

        for (size_t i = sequenceStart; i < m_discoverySamples.size(); ++i)
            AddLockedSample(m_discoverySamples[i]);

        m_discoverySamples.clear();
        return true;
    }

    bool CEnvelopeCsvWriter::TryFindRepeatedSuffix(size_t& sequenceStart, size_t& sequenceLength) const
    {
        const size_t count = m_discoverySamples.size();
        if (count < RequiredSequenceRepeats + 1)
            return false;

        // The newest sample must restart the candidate sequence after three full repeats.
        const size_t repeatEnd = count - 1;
        const size_t maxLength = repeatEnd / RequiredSequenceRepeats;

        for (size_t candidateLength = 1; candidateLength <= maxLength; ++candidateLength)
        {
            const size_t start = repeatEnd - candidateLength * RequiredSequenceRepeats;
            bool matches = m_discoverySamples[count - 1].state == m_discoverySamples[start].state;

            for (size_t i = 0; matches && i < candidateLength * RequiredSequenceRepeats; ++i)
                matches = m_discoverySamples[start + i].state == m_discoverySamples[start + (i % candidateLength)].state;

            if (matches)
            {
                sequenceStart = start;
                sequenceLength = candidateLength;
                return true;
            }
        }

        return false;
    }

    void CEnvelopeCsvWriter::TrimDiscoverySamples()
    {
        if (m_discoverySamples.size() <= MaxDiscoverySamples)
            return;

        const size_t removeCount = m_discoverySamples.size() - MaxDiscoverySamples;
        m_discoverySamples.erase(m_discoverySamples.begin(), m_discoverySamples.begin() + removeCount);
    }

    void CEnvelopeCsvWriter::AddLockedSample(const CCsvSample& sample)
    {
        if (m_sequence.empty())
            return;

        size_t position = 0;
        if (!TryFindStatePosition(sample.state, m_nextStateIndex, position)
            && !TryFindStatePosition(sample.state, 0, position))
        {
            if (!m_reportedUnexpectedState)
            {
                OutputDebugStringA("NativeCsv: ignoring envelope state outside the detected sequence.\r\n");
                m_reportedUnexpectedState = true;
            }

            return;
        }

        if (position < m_nextStateIndex && CurrentRowHasData())
            WriteRow(m_currentRow);

        if (position < m_nextStateIndex || position == 0)
            ResetCurrentRow();

        m_currentRow.cells[position] = EnvelopeCell{ sample.timestamp, sample.lightEnvelope };
        m_currentRow.hasCell[position] = 1;
        m_nextStateIndex = position + 1;

        if (m_nextStateIndex >= m_sequence.size())
        {
            WriteRow(m_currentRow);
            ResetCurrentRow();
        }
    }

    bool CEnvelopeCsvWriter::TryFindStatePosition(uint32_t state, size_t start, size_t& position) const
    {
        if (start >= m_sequence.size())
            return false;

        for (size_t i = start; i < m_sequence.size(); ++i)
        {
            if (m_sequence[i] == state)
            {
                position = i;
                return true;
            }
        }

        return false;
    }

    void CEnvelopeCsvWriter::ResetCurrentRow()
    {
        m_currentRow.cells.assign(m_sequence.size(), EnvelopeCell{});
        m_currentRow.hasCell.assign(m_sequence.size(), 0);
        m_nextStateIndex = 0;
    }

    bool CEnvelopeCsvWriter::CurrentRowHasData() const
    {
        for (uint8_t hasCell : m_currentRow.hasCell)
        {
            if (hasCell != 0)
                return true;
        }

        return false;
    }

    void CEnvelopeCsvWriter::WriteHeader()
    {
        m_line.clear();

        for (size_t i = 0; i < m_sequence.size(); ++i)
        {
            if (i > 0)
                m_line.append(",,", 2);

            std::string state = CCsvNames::Sanitize(CCsvStateNames::Describe(m_sequence[i]));
            size_t duplicateIndex = 1;

            for (size_t j = 0; j < i; ++j)
            {
                if (m_sequence[j] == m_sequence[i])
                    ++duplicateIndex;
            }

            if (duplicateIndex > 1)
            {
                state.push_back('_');
                state.append(std::to_string(duplicateIndex));
            }

            m_line.append(state);
            m_line.append("_timestamp,");
            m_line.append(state);
            m_line.append("_value");
        }

        CCsvFormatter::AppendLineEnding(m_line);
        m_writer.Append(m_line);
    }

    void CEnvelopeCsvWriter::WriteRow(const EnvelopeRow& row)
    {
        m_line.clear();

        for (size_t i = 0; i < m_sequence.size(); ++i)
        {
            if (i > 0)
                m_line.append(",,", 2);

            if (i < row.hasCell.size() && row.hasCell[i] != 0)
            {
                CCsvFormatter::AppendDouble(m_line, row.cells[i].timestamp);
                m_line.push_back(',');
                CCsvFormatter::AppendDouble(m_line, row.cells[i].value);
            }
            else
            {
                m_line.push_back(',');
            }
        }

        CCsvFormatter::AppendLineEnding(m_line);
        m_writer.Append(m_line);
    }
}

#pragma managed(pop)
