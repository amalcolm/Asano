
using Asano.MyGLTools.Helpers;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace Asano.DataTools.Csv
{
    internal sealed class SessionWriter : IDisposable
    {
        private const int FileBufferSize = 64 * 1024;

        private readonly BlockingCollection<CsvSample> _queue = new(new ConcurrentQueue<CsvSample>());
        private readonly MyPool<CsvSample> _samplePool;
        private readonly string _sessionDirectory;
        private readonly Task _writerTask;
        private readonly Dictionary<string, StreamWriter> _stateWriters = new(StringComparer.Ordinal);
        private readonly Dictionary<string, string> _filenamesByState = new(StringComparer.Ordinal);
        private readonly HashSet<string> _usedFilenames = new(StringComparer.OrdinalIgnoreCase);
        private readonly EnvelopeCsvWriter _envelopes;

        private bool _disposed;

        public SessionWriter(string sessionDirectory, MyPool<CsvSample> samplePool)
        {
            _sessionDirectory = sessionDirectory;
            _samplePool = samplePool;
            _envelopes = new EnvelopeCsvWriter(Path.Combine(sessionDirectory, "envelopes.csv"));
            _writerTask = Task.Run(WriterLoop);
        }

        public bool TryAdd(CsvSample sample)
        {
            if (_disposed || _queue.IsAddingCompleted)
                return false;

            try
            {
                _queue.Add(sample);
                return true;
            }
            catch (InvalidOperationException)
            {
                return false;
            }
        }

        private void WriterLoop()
        {
            try
            {
                Directory.CreateDirectory(_sessionDirectory);

                foreach (CsvSample sample in _queue.GetConsumingEnumerable())
                {
                    try
                    {
                        WriteStateSample(sample);
                        _envelopes.Add(sample);
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine("CsvSessionWriter: " + ex);
                    }
                    finally
                    {
                        _samplePool.Return(sample);
                    }
                }

                _envelopes.Finish();
            }
            finally
            {
                foreach (StreamWriter writer in _stateWriters.Values)
                    writer.Dispose();

                _stateWriters.Clear();
            }
        }

        private void WriteStateSample(CsvSample sample)
        {
            StreamWriter writer = GetStateWriter(sample.StateDescription);

            CsvFormat.WriteValue(writer, sample.Timestamp);
            writer.Write(',');
            CsvFormat.WriteValue(writer, sample.StateDescription);
            writer.Write(',');
            CsvFormat.WriteValue(writer, sample.Top);
            writer.Write(',');
            CsvFormat.WriteValue(writer, sample.Bot);
            writer.Write(',');
            CsvFormat.WriteValue(writer, sample.Mid);
            writer.Write(',');
            CsvFormat.WriteValue(writer, sample.Offset);
            writer.Write(',');
            CsvFormat.WriteValue(writer, sample.Gain);
            writer.Write(',');
            CsvFormat.WriteValue(writer, sample.Sensor1);
            writer.Write(',');
            CsvFormat.WriteValue(writer, sample.Sensor2);
            writer.WriteLine();
        }

        private StreamWriter GetStateWriter(string stateDescription)
        {
            if (_stateWriters.TryGetValue(stateDescription, out StreamWriter? writer))
                return writer;

            string filename = GetFilenameForState(stateDescription);
            writer = CreateWriter(Path.Combine(_sessionDirectory, filename + ".csv"));
            writer.WriteLine("timestamp,state,top,bot,mid,offset,gain,sensor1,sensor2");
            _stateWriters[stateDescription] = writer;

            return writer;
        }

        private string GetFilenameForState(string stateDescription)
        {
            if (_filenamesByState.TryGetValue(stateDescription, out string? filename))
                return filename;

            string baseName = CsvNames.Sanitize(stateDescription);
            string candidate = baseName;
            int suffix = 2;

            while (!_usedFilenames.Add(candidate))
                candidate = $"{baseName}_{suffix++}";

            _filenamesByState[stateDescription] = candidate;
            return candidate;
        }

        internal static StreamWriter CreateWriter(string path)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path) ?? ".");

            FileStream stream = new(
                path,
                FileMode.Create,
                FileAccess.Write,
                FileShare.Read,
                FileBufferSize,
                FileOptions.SequentialScan);

            return new StreamWriter(stream, CsvFormat.Encoding, FileBufferSize);
        }

        public void Dispose()
        {
            if (_disposed)
                return;

            _disposed = true;
            _queue.CompleteAdding();

            try
            {
                _writerTask.Wait();
            }
            catch (AggregateException ex)
            {
                Debug.WriteLine("CsvSessionWriter shutdown: " + ex.Flatten());
            }

            _queue.Dispose();
        }
    }
}
