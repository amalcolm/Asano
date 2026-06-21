using System.Globalization;
using System.Text;
using TheLib;

namespace Asano.DataTools.Controls
{
    public partial class SignalViewer
    {
        private const string NoiseSampleFileName = "Asano_NoiseSample.csv";
        private static readonly CultureInfo CsvCulture = CultureInfo.InvariantCulture;

        private static NoiseSnapshot CreateNoiseSnapshot(RawSignalSnapshot signal, DataPacket hardware)
        {
            List<NoiseSampleSnapshot> samples = new(signal.Count);

            for (int i = 0; i < signal.Count; i++)
            {
                SignalData sample = signal.Samples[i];
                samples.Add(new NoiseSampleSnapshot(
                    sample.StartTick * ticksToSeconds,
                    sample.EndTick * ticksToSeconds,
                    sample.Sample));
            }

            return new NoiseSnapshot(signal.Timestamp, signal.State, hardware, samples);
        }

        private void miExport_Click(object sender, EventArgs e)
        {
            try
            {
                NoiseSnapshot snapshot;
                lock (_state.Lock)
                    snapshot = _state.LatestNoise;

                string path = GetNoiseSamplePath();
                WriteNoiseSampleCsv(path, snapshot);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    this,
                    $"Could not write {NoiseSampleFileName}.\r\n\r\n{ex.Message}",
                    "Signal Viewer",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private void cmStrip_Closed(object? sender, ToolStripDropDownClosedEventArgs e)
        {
            base.requestHold = false;
        }

        private static string GetNoiseSamplePath()
        {
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

            if (string.IsNullOrWhiteSpace(desktop))
                desktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Desktop");

            return Path.Combine(desktop, NoiseSampleFileName);
        }

        private static void WriteNoiseSampleCsv(string path, NoiseSnapshot snapshot)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path) ?? ".");

            using StreamWriter writer = new(path, append: false, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            writer.WriteLine("index,time_s,start_s,end_s,raw_value,debug_timestamp_s,debug_state,debug_state_value,hardware_timestamp_s,state_time_s,hardware_state,top,bot,mid,offset,gain,sequence,raw_sensor1,raw_sensor2,sensor1,sensor2");

            DataPacket? hardware = snapshot.Hardware;
            for (int i = 0; i < snapshot.Samples.Count; i++)
            {
                NoiseSampleSnapshot sample = snapshot.Samples[i];
                float time = (sample.StartSeconds + sample.EndSeconds) * 0.5f;

                writer.Write(i.ToString(CsvCulture));
                WriteCsvValue(writer, time);
                WriteCsvValue(writer, sample.StartSeconds);
                WriteCsvValue(writer, sample.EndSeconds);
                WriteCsvValue(writer, sample.RawValue);
                WriteCsvValue(writer, snapshot.DebugTimestamp);
                WriteCsvValue(writer, snapshot.DebugState.ToString());
                WriteCsvValue(writer, Convert.ToUInt32(snapshot.DebugState, CsvCulture));

                if (hardware != null)
                    WriteHardwareCsvValues(writer, hardware);
                else
                    WriteEmptyCsvValues(writer, count: 13);

                writer.WriteLine();
            }
        }

        private static void WriteHardwareCsvValues(StreamWriter writer, DataPacket hardware)
        {
            WriteCsvValue(writer, hardware.TimeStamp);
            WriteCsvValue(writer, hardware.StateTime);
            WriteCsvValue(writer, hardware.State.ToString());
            WriteCsvValue(writer, hardware.Top);
            WriteCsvValue(writer, hardware.Bot);
            WriteCsvValue(writer, hardware.Mid);
            WriteCsvValue(writer, hardware.Offset);
            WriteCsvValue(writer, hardware.Gain);
            WriteCsvValue(writer, hardware.SequenceNumber);
            WriteCsvValue(writer, hardware.RawSensor1);
            WriteCsvValue(writer, hardware.RawSensor2);
            WriteCsvValue(writer, hardware.Sensor1);
            WriteCsvValue(writer, hardware.Sensor2);
        }

        private static void WriteCsvValue(StreamWriter writer, string value)
        {
            writer.Write(',');
            writer.Write('"');
            writer.Write(value.Replace("\"", "\"\""));
            writer.Write('"');
        }

        private static void WriteCsvValue(StreamWriter writer, double value)
        {
            writer.Write(',');
            writer.Write(value.ToString("G17", CsvCulture));
        }

        private static void WriteCsvValue(StreamWriter writer, float value)
        {
            writer.Write(',');
            writer.Write(value.ToString("G9", CsvCulture));
        }

        private static void WriteCsvValue(StreamWriter writer, int value)
        {
            writer.Write(',');
            writer.Write(value.ToString(CsvCulture));
        }

        private static void WriteCsvValue(StreamWriter writer, uint value)
        {
            writer.Write(',');
            writer.Write(value.ToString(CsvCulture));
        }

        private static void WriteEmptyCsvValues(StreamWriter writer, int count)
        {
            for (int i = 0; i < count; i++)
                writer.Write(',');
        }

        private sealed record NoiseSnapshot(
            double DebugTimestamp,
            HeadState DebugState,
            DataPacket Hardware,
            List<NoiseSampleSnapshot> Samples)
        {
            public static NoiseSnapshot Empty { get; } = new(0.0, HeadState.None, DataPacket.Rent(), []);
        }

        private readonly record struct NoiseSampleSnapshot(float StartSeconds, float EndSeconds, int RawValue);
    }
}
