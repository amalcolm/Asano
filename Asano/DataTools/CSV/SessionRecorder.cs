using Asano.MyGLTools.Helpers;
using OpenTK.Windowing.Common.Input;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using TheLib;
using Windows.Foundation.Diagnostics;

namespace Asano.DataTools.Csv
{
    public class SessionRecorder : IDisposable
    {
        private readonly MySerialPort SP;
        private readonly MyPool<CsvSample> _samplePool = new(8192, () => new CsvSample(), sample => sample.Reset());
        private readonly object _lock = new();

        private SessionWriter? _session;
        private bool _disposed;

        public SessionRecorder(MySerialPort serialPort)
        {
            SP = serialPort;
            SP.BlockPacketReceived += SerialPort_BlockPacketReceived;
            SP.ConnectionChanged += SerialPort_ConnectionChanged;
        }

        private void SerialPort_BlockPacketReceived(BlockPacket blockPacket)
        {
            if (blockPacket.Count <= 0) return;

            DataPacket data = blockPacket.BlockData[blockPacket.Count - 1];

            CsvSample sample = _samplePool.Rent();
            sample.CopyFrom(blockPacket, data);

            SessionWriter? session;
            lock (_lock)
            {
                if (_disposed)
                {
                    _samplePool.Return(sample);
                    return;
                }

                _session ??= new SessionWriter(CreateSessionDirectory(), _samplePool);
                session = _session;
            }

            if (!session.TryAdd(sample))
                _samplePool.Return(sample);
        }

        private void SerialPort_ConnectionChanged(ConnectionState state)
        {
            if (state == ConnectionState.Disconnected)
                CloseCurrentSession();
        }

        private void CloseCurrentSession()
        {
            SessionWriter? session;

            lock (_lock)
            {
                session = _session;
                _session = null;
            }

            session?.Dispose();
        }

        public void Dispose()
        {
            lock (_lock)
            {
                if (_disposed)
                    return;

                _disposed = true;
                SP.BlockPacketReceived -= SerialPort_BlockPacketReceived;
                SP.ConnectionChanged -= SerialPort_ConnectionChanged;
            }

            CloseCurrentSession();
            GC.SuppressFinalize(this);
        }

        private static readonly bool testing = Environment.MachineName == "BOX";

        private static string CreateSessionDirectory()
        {
            var directory = testing 
                ? Environment.SpecialFolder.DesktopDirectory
                : Environment.SpecialFolder.MyDocuments;

            string asanoRoot = Path.Combine(Environment.GetFolderPath(directory), "Asano");

            return testing
                ? PrepareTestingDirectory(asanoRoot)
                : CreateClinicalSessionDirectory(asanoRoot);
        }


        private static string PrepareTestingDirectory(string asanoRoot)
        {
            var diCurrent = Directory.CreateDirectory(Path.Combine(asanoRoot, "!!Testing"));
            var diLastRun = diCurrent.CreateSubdirectory("!!LastRun");

            foreach (var file in diLastRun.GetFiles())
                file.Delete();

            foreach (var file in diCurrent.GetFiles())
                file.MoveTo(Path.Combine(diLastRun.FullName, file.Name), overwrite: true);

            return diCurrent.FullName;
        }


        private static string CreateClinicalSessionDirectory(string asanoRoot)
        {
            string stamp = DateTime.Now.ToString("yyyy-MM-dd_HHmmss", CultureInfo.InvariantCulture);
            return Path.Combine(asanoRoot, "CsvSessions", stamp);
        }

    }


}
