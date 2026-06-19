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
        m_pendingRows.reserve(HeaderWarmupRows);
        m_line.reserve(1024);
    }

    void CEnvelopeCsvWriter::Add(const CCsvSample& sample)
    {
        if (!EnsureState(sample.state))
            return;

        if (m_current.find(sample.state) != m_current.end())
        {
            EmitCurrentRow();
            m_current.clear();
        }

        m_current[sample.state] = EnvelopeCell{ sample.timestamp, sample.lightEnvelope };
    }

    void CEnvelopeCsvWriter::Finish()
    {
        if (m_finished)
            return;

        m_finished = true;
        EmitCurrentRow();

        if (!m_headerWritten && !m_pendingRows.empty())
            WriteHeaderAndPendingRows();

        m_writer.Close();
    }

    bool CEnvelopeCsvWriter::EnsureState(uint32_t state)
    {
        if (m_stateIndexes.find(state) != m_stateIndexes.end())
            return true;

        if (m_headerWritten)
        {
            if (m_lateStates.insert(state).second)
                OutputDebugStringA("NativeCsv: ignoring late envelope state after header was written.\r\n");

            return false;
        }

        m_stateIndexes[state] = m_states.size();
        m_states.push_back(state);

        return true;
    }

    void CEnvelopeCsvWriter::EmitCurrentRow()
    {
        if (m_current.empty())
            return;

        EnvelopeRow row;
        row.cells.resize(m_states.size());
        row.hasCell.resize(m_states.size());

        for (const auto& pair : m_current)
        {
            auto it = m_stateIndexes.find(pair.first);
            if (it == m_stateIndexes.end())
                continue;

            row.cells[it->second] = pair.second;
            row.hasCell[it->second] = 1;
        }

        if (m_headerWritten)
        {
            WriteRow(row);
            return;
        }

        m_pendingRows.push_back(std::move(row));
        if (m_pendingRows.size() >= HeaderWarmupRows)
            WriteHeaderAndPendingRows();
    }

    void CEnvelopeCsvWriter::WriteHeaderAndPendingRows()
    {
        if (m_headerWritten)
            return;

        m_writer.Open(m_path);
        WriteHeader();
        m_headerWritten = true;

        for (const EnvelopeRow& row : m_pendingRows)
            WriteRow(row);

        m_pendingRows.clear();
    }

    void CEnvelopeCsvWriter::WriteHeader()
    {
        m_line.clear();

        for (size_t i = 0; i < m_states.size(); ++i)
        {
            if (i > 0)
                m_line.append(",,", 2);

            std::string state = CCsvNames::Sanitize(CCsvStateNames::Describe(m_states[i]));
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

        for (size_t i = 0; i < m_states.size(); ++i)
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
