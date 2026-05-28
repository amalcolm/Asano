using TheLib;
using System.Globalization;
using System.Text;
using Asano.MyGLTools.Fonts;
using Asano.MyGLTools.Helpers;
using Asano.MyGLTools.UserControls;

namespace Asano.DataTools.Controls
{
    public partial class SignalViewer : MyInteractivePlotterBase
    {
        private const int MAX_SAMPLES = 4096;
        private const int VERTICES_PER_SAMPLE = 6;
        private const int MAX_VERTICES = MAX_SAMPLES * VERTICES_PER_SAMPLE;
        private const string XAxisUnit = "mS";
        private const float XAxisUnitRightMargin = 8.0f;
        private const float XAxisUnitBottomMargin = -8.0f;
        private const float XAxisUnitClipPadding = 40.0f;
        private const float XAxisUnitScale = 0.001f;
        private const string NoiseRangeLabel = ": Range";
        private const string NoiseRangeFormat = "F0";
        private const float NoiseRangeRightMargin = 8.0f;
        private const float NoiseRangeTopMargin = 22.0f;
        private const float NoiseRangeLabelGap = 4.0f;
        private const string NoiseSampleFileName = "Asano_NoiseSample.csv";

        private static readonly CultureInfo CsvCulture = CultureInfo.InvariantCulture;

        private static TeensySerial SP => Program.serialPort ?? throw new InvalidOperationException("Serial port is not initialized.");

        private bool IsRunning => !_disposed && _ready;

        private readonly object _lock = new();
        private TextBlock? _xAxisUnitLabel;
        private TextBlock? _noiseRangeLabel;
        private TextBlock? _noiseRangeValueLabel;
        private TextBlock[] _noiseRangeBlocks = [];
        private float _noiseRange = 0.0f;
        private DataPacket _latestHardware = DataPacket.Rent();
        private NoiseSnapshot _latestNoise = NoiseSnapshot.Empty;

        public SignalViewer()
        {
            InitializeComponent();

            if (Program.IsRunning == false) { ShowDesignView(); return; }

            cmStrip.Closed += cmStrip_Closed;

            BackColor = Color.MistyRose;
            Setup(initAction: Init, shutdownAction: Shutdown);
            SP.DataReceived += SP_DataReceived;

            AxesOptions = new()
            {
                AxesVisible = true,
                GridVisible = false,
                LabelPadding = 70.0f,
                XAxisUnitScale = XAxisUnitScale,
                XAxisLabelClipRightPadding = XAxisUnitClipPadding
            };
        }


        static readonly float ticksToSeconds = 1.0f / 600_000_000f;
        private void SP_DataReceived(IPacket packet)
        {
            if (IsRunning == false) return;

            if (packet is BlockPacket blockPacket)
            {
                StoreHardwareSnapshot(blockPacket);
                return;
            }

            if (packet is not DebugPacket dbg) return; if (dbg.Count <= 0) return;

            if (base.requestHold) return;

            int max = Math.Min(dbg.Count, MAX_SAMPLES);

            double total = 0.0;
            for (int i = 0; i < max; i++)
                total += dbg.Data[i].Sample;

            float mean = (float)(total / max);
            List<NoiseSampleSnapshot> samples = new(max);

            float minY = float.MaxValue, maxY = float.MinValue;
            float lastX = 0.0f;
            int verts = 0;
            for (int i = 0; i < max; i++)
            {
                float y = dbg.Data[i].Sample;
                if (float.IsFinite(y) == false) continue;

                float x1 = dbg.Data[i].StartTick * ticksToSeconds;
                float x2 = dbg.Data[i].EndTick * ticksToSeconds;
                samples.Add(new NoiseSampleSnapshot(x1, x2, dbg.Data[i].Sample));

                float y1 = MathF.Min(mean, y);
                float y2 = MathF.Max(mean, y);

                vertices[verts].Position.X = x1; vertices[verts].Position.Y = y1; verts++;
                vertices[verts].Position.X = x2; vertices[verts].Position.Y = y1; verts++;
                vertices[verts].Position.X = x2; vertices[verts].Position.Y = y2; verts++;

                vertices[verts].Position.X = x1; vertices[verts].Position.Y = y1; verts++;
                vertices[verts].Position.X = x2; vertices[verts].Position.Y = y2; verts++;
                vertices[verts].Position.X = x1; vertices[verts].Position.Y = y2; verts++;

                lastX = x2;

                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            vertexCount = verts;

            if (vertexCount == 0 || !float.IsFinite(minY) || !float.IsFinite(maxY) || lastX <= 0.0f)
                return;

            float noiseRange = Math.Max(0.0f, maxY - minY);
            float midY = mean;
            float midRatio = GetMidYScreenRatio();
            float height = GetAnchoredViewHeight(midY, minY, maxY, midRatio);
            float topY = midY - height * midRatio;

            lock (_lock)
            {
                _noiseRange = noiseRange;
                _latestNoise = new NoiseSnapshot(dbg.TimeStamp, dbg.State, _latestHardware, samples);
                _vertexBuffer.Set(ref vertices, vertexCount);
                SetAutomaticViewPort(new RectangleF(0.0f, topY, lastX, height));
            }
        }

        private void StoreHardwareSnapshot(BlockPacket blockPacket)
        {
            if (base.requestHold || blockPacket.Count <= 0) return;

            DataPacket dataPacket = blockPacket.BlockData[blockPacket.Count - 1];

            lock (_lock)
                _latestHardware.CopyFrom(dataPacket);
        }

        private readonly MyGLVertexBuffer _vertexBuffer = new(MAX_VERTICES);
        private Vertex[] vertices = new Vertex[MAX_VERTICES];
        private int vertexCount = 0;

        private bool _ready = false;
        private bool _disposed = false;
        protected override void Init()
        {
            base.Init();
            _vertexBuffer.Init();
            _xAxisUnitLabel = new TextBlock(XAxisUnit, 0, 0, font, TextAlign.Right);
            _noiseRangeLabel = new TextBlock(NoiseRangeLabel, 0, 0, font, TextAlign.Right);
            _noiseRangeValueLabel = new TextBlock("0", 0, 0, font, TextAlign.Right, NoiseRangeFormat);
            _noiseRangeBlocks = [_noiseRangeValueLabel, _noiseRangeLabel];

            _vertexBuffer.Set(ref vertices, vertexCount);

            SetAutomaticViewPort(new RectangleF(-0.5f, -0.5f, MAX_SAMPLES - 0.5f, 1000 - 0.5f));
            MyColour myColour = MyColour.Black;

            for (int i = 0; i < vertices.Length; i++)
            {
                vertices[i].Position.X = i;
                vertices[i].Position.Y = Random.Shared.Next(0, 1000);
                vertices[i].Colour = myColour;
            }
            vertexCount = vertices.Length;
            _vertexBuffer.Set(ref vertices, vertexCount);  // no lock as ready is not yet set.
            _ready = true;
        }

        protected override void Shutdown()
        {
            _ready = false;
            cmStrip.Closed -= cmStrip_Closed;

            Program.serialPort!.DataReceived -= SP_DataReceived;
            _xAxisUnitLabel?.Dispose();
            _noiseRangeLabel?.Dispose();
            _noiseRangeValueLabel?.Dispose();
            _xAxisUnitLabel = null;
            _noiseRangeLabel = null;
            _noiseRangeValueLabel = null;
            _noiseRangeBlocks = [];
            _vertexBuffer.Dispose();
            base.Shutdown();
            _disposed = true;
        }

        protected override void DrawPlots()
        {
            lock (_lock)
                _vertexBuffer.DrawTriangles();
        }

        protected override void DrawPlotOverlays()
        {
            lock (_lock)
                base.DrawPlotOverlays();
        }

        protected override void DrawText()
        {
            base.DrawText();

            if (_xAxisUnitLabel == null && _noiseRangeBlocks.Length == 0) return;

            Color? oldColour = null;
            if (TextColour != AxesOptions.LabelColor)
            {
                oldColour = TextColour;
                TextColour = AxesOptions.LabelColor;
            }

            DrawNoiseRangeText();
            DrawXAxisUnitText();

            if (oldColour.HasValue)
                TextColour = oldColour.Value;
        }

        private void DrawXAxisUnitText()
        {
            if (_xAxisUnitLabel == null) return;

            _xAxisUnitLabel.X = GLClientSize.Width - XAxisUnitRightMargin;
            _xAxisUnitLabel.Y = XAxisUnitBottomMargin;
            fontRenderer.RenderText(_xAxisUnitLabel);
        }

        private void DrawNoiseRangeText()
        {
            if (_noiseRangeLabel == null || _noiseRangeValueLabel == null || _noiseRangeBlocks.Length != 2) return;

            float noiseRange;
            lock (_lock)
                noiseRange = _noiseRange;

            _noiseRangeValueLabel.SetValue(noiseRange, NoiseRangeFormat);

            _noiseRangeLabel.X = GLClientSize.Width - NoiseRangeRightMargin;
            _noiseRangeLabel.Y = GLClientSize.Height - NoiseRangeTopMargin;
            _noiseRangeLabel.GetVertices(fontRenderer.Scaling);

            if (!_noiseRangeLabel.Bounds.IsEmpty)
            {
                float top = GLClientSize.Height - NoiseRangeTopMargin;
                _noiseRangeLabel.Y += top - _noiseRangeLabel.Bounds.Top;
                _noiseRangeLabel.GetVertices(fontRenderer.Scaling);
                _noiseRangeValueLabel.X = _noiseRangeLabel.Bounds.Left - NoiseRangeLabelGap;
            }
            else
            {
                _noiseRangeValueLabel.X = _noiseRangeLabel.X - NoiseRangeLabelGap;
            }

            _noiseRangeValueLabel.Y = _noiseRangeLabel.Y + 0.01f;
            fontRenderer.RenderText(_noiseRangeBlocks, _noiseRangeBlocks.Length);
        }

        private float GetMidYScreenRatio()
        {
            float clientHeight = Math.Max(1.0f, Height);
            float axisY = Math.Clamp(PlotAxesRenderer.XAxisLineY, 0.0f, clientHeight);
            float midY = axisY + (clientHeight - axisY) * 0.5f;

            return Math.Clamp(midY / clientHeight, 0.05f, 0.95f);
        }

        private float GetAnchoredViewHeight(float midY, float minY, float maxY, float midRatio)
        {
            float minHeight = Math.Max(1.0f, Height);
            float lowerHeight = (midY - minY) / midRatio;
            float upperHeight = (maxY - midY) / (1.0f - midRatio);

            return Math.Max(minHeight, Math.Max(lowerHeight, upperHeight));
        }

        private void miExport_Click(object sender, EventArgs e)
        {
            try
            {
                NoiseSnapshot snapshot;
                lock (_lock)
                    snapshot = _latestNoise;

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
