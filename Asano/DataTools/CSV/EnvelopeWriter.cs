using System.Diagnostics;

namespace Asano.DataTools.Csv
{
    public class EnvelopeCsvWriter(string path)
    {
        private const int HeaderWarmupRows = 3;

        private readonly string _path = path;
        private readonly Dictionary<string, int> _stateIndexes = new(StringComparer.Ordinal);
        private readonly Dictionary<string, EnvelopeCell> _current = new(StringComparer.Ordinal);
        private readonly HashSet<string> _lateStates = new(StringComparer.Ordinal);
        private readonly List<string> _states = [];
        private readonly List<EnvelopeRow> _pendingRows = [];

        private StreamWriter? _writer;
        private bool _headerWritten;
        private bool _finished;

        public void Add(CsvSample sample)
        {
            if (!EnsureState(sample.StateDescription))
                return;

            if (_current.ContainsKey(sample.StateDescription))
            {
                EmitCurrentRow();
                _current.Clear();
            }

            _current[sample.StateDescription] = new EnvelopeCell(sample.Timestamp, sample.LightEnvelope);
        }

        public void Finish()
        {
            if (_finished)
                return;

            _finished = true;
            EmitCurrentRow();

            if (!_headerWritten && _pendingRows.Count > 0)
                WriteHeaderAndPendingRows();

            _writer?.Dispose();
            _writer = null;
        }

        private bool EnsureState(string stateDescription)
        {
            if (_stateIndexes.ContainsKey(stateDescription))
                return true;

            if (_headerWritten)
            {
                if (_lateStates.Add(stateDescription))
                    Debug.WriteLine($"CsvSessionWriter: ignoring late envelope state '{stateDescription}' after envelopes.csv header was written.");

                return false;
            }

            _stateIndexes[stateDescription] = _states.Count;
            _states.Add(stateDescription);
            return true;
        }

        private void EmitCurrentRow()
        {
            if (_current.Count == 0)
                return;

            EnvelopeRow row = new(_current);

            if (_headerWritten)
            {
                WriteRow(row);
                return;
            }

            _pendingRows.Add(row);
            if (_pendingRows.Count >= HeaderWarmupRows)
                WriteHeaderAndPendingRows();
        }

        private void WriteHeaderAndPendingRows()
        {
            if (_headerWritten)
                return;

            _writer = SessionWriter.CreateWriter(_path);
            WriteHeader();
            _headerWritten = true;

            foreach (EnvelopeRow row in _pendingRows)
                WriteRow(row);

            _pendingRows.Clear();
        }

        private void WriteHeader()
        {
            if (_writer == null)
                return;

            for (int i = 0; i < _states.Count; i++)
            {
                if (i > 0)
                    _writer.Write(",,");

                string state = CsvNames.Sanitize(_states[i]);
                _writer.Write(state);
                _writer.Write("_timestamp,");
                _writer.Write(state);
                _writer.Write("_value");
            }

            _writer.WriteLine();
        }

        private void WriteRow(EnvelopeRow row)
        {
            if (_writer == null)
                return;

            for (int i = 0; i < _states.Count; i++)
            {
                if (i > 0)
                    _writer.Write(",,");

                if (row.Cells.TryGetValue(_states[i], out EnvelopeCell cell))
                {
                    CsvFormat.WriteValue(_writer, cell.Timestamp);
                    _writer.Write(',');
                    CsvFormat.WriteValue(_writer, cell.Value);
                }
                else
                {
                    _writer.Write(',');
                }
            }

            _writer.WriteLine();
        }

        private readonly record struct EnvelopeCell(double Timestamp, double Value);

        private sealed class EnvelopeRow
        {
            public EnvelopeRow(Dictionary<string, EnvelopeCell> cells)
            {
                Cells = new Dictionary<string, EnvelopeCell>(cells, StringComparer.Ordinal);
            }

            public Dictionary<string, EnvelopeCell> Cells { get; }
        }
    }
}
