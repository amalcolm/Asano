using TheLib;
using Asano.MyGLTools.Fonts;
using Asano.MyGLTools.Helpers;
using Asano.MyGLTools.UserControls;

namespace Asano.DataTools.Controls
{
    public partial class SignalViewer : MyInteractivePlotterBase
    {
        #region Constants

        private const int VERTICES_PER_SAMPLE = 6;
        private const string XAxisUnit = "mS";
        private const float XAxisUnitRightMargin = 8.0f;
        private const float XAxisUnitBottomMargin = -8.0f;
        private const string NoiseRangeLabel = ": Range";
        private const string NoiseRangeFormat = "F0";
        private const float NoiseRangeRightMargin = 8.0f;
        private const float NoiseRangeTopMargin = 22.0f;
        private const float NoiseRangeLabelGap = 4.0f;

        private static readonly int MAX_SAMPLES = RawSignalPacket.MAX_SAMPLES;
        private static readonly int MAX_VERTICES = MAX_SAMPLES * VERTICES_PER_SAMPLE;
        private static readonly float ticksToSeconds = 1.0f / 600_000_000f;
        private static readonly float uS_to_ticks = 600.0f;

        #endregion

        private static MySerialPort SP => Program.SerialPort ?? throw new InvalidOperationException("Serial port is not initialized.");

        private bool IsRunning => !_state.Disposed && _state.Ready;

        private readonly ViewerState _state = new();

        public SignalViewer()
        {
            InitializeComponent();

            if (Program.IsRunning == false) { ShowDesignView(); return; }

            cmStrip.Closed += cmStrip_Closed;

            BackColor = Color.MistyRose;
            Setup(initAction: Init, shutdownAction: Shutdown);
            SP.BlockPacketReceived += SP_BlockPacketReceived;
            SP.RawSignalPacketReceived += SP_RawSignalPacketReceived;
        }

        private void SP_BlockPacketReceived(BlockPacket blockPacket)
        {
            if (IsRunning == false) return;

            StoreHardwareSnapshot(blockPacket);
        }

        private void Clear()
        {
            lock (_state.Lock)
            {
                _state.VertexCount = 0;
                _state.LatestSignal = RawSignalSnapshot.Empty;
                _state.LatestNoise = NoiseSnapshot.Empty;
                _state.NoiseRange = 0.0f;
                _state.VerticesDirty = true;
                _state.LastVertexPlotViewPort = RectangleF.Empty;
                _state.LastVertexDisplaySize = Size.Empty;
                GLThread?.Enqueue(() => _state.VertexBuffer.Set(ref _state.Vertices, _state.VertexCount));
            }
        }

        private static RawSignalSnapshot CreateSignalSnapshot(RawSignalPacket packet)
        {
            int count = Math.Min(packet.Count, MAX_SAMPLES);
            if (count <= 0) return RawSignalSnapshot.Empty;

            SignalData[] samples = new SignalData[count];
            Array.Copy(packet.Data, samples, count);

            int settleTick = (int)(Config.HEAD_SETTLE_TIME_uS * uS_to_ticks);
            int lo = 0;
            int hi = count;

            while (lo < hi)
            {
                int mid = lo + ((hi - lo) >> 1);

                if (packet.Data[mid].StartTick <= settleTick)
                    lo = mid + 1;
                else
                    hi = mid;
            }

            int cutIndex = lo;
            if (cutIndex >= count) return RawSignalSnapshot.Empty;

            double total = 0.0;
            float minY = float.MaxValue;
            float maxY = float.MinValue;

            for (int i = cutIndex; i < count; i++)
            {
                float y = samples[i].Sample;
                if (!float.IsFinite(y)) continue;

                total += y;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }

            if (!float.IsFinite(minY) || !float.IsFinite(maxY)) return RawSignalSnapshot.Empty;

            float mean = (float)(total / (count - cutIndex));
            float lastX = samples[count - 1].EndTick * ticksToSeconds;

            int msMax = (int)(lastX * 1000.0f + 0.05f);
            float remainder = (lastX * 1000.0f) - msMax;

            if (remainder < 0.1f)
                lastX = msMax * 0.001f + 0.0002f;

            return new RawSignalSnapshot(
                packet.TimeStamp,
                packet.State,
                samples,
                count,
                cutIndex,
                mean,
                minY,
                maxY,
                lastX,
                Math.Max(0.0f, maxY - minY));
        }

        private void SP_RawSignalPacketReceived(RawSignalPacket packet)
        {
            if (base.requestHold) return;
            if (!IsActiveChartState(packet.State)) return;

            RawSignalSnapshot signal = CreateSignalSnapshot(packet);
            if (!signal.IsValid) { Clear(); return; }

            lock (_state.Lock)
            {
                _state.LatestSignal = signal;
                _state.LatestNoise = CreateNoiseSnapshot(signal, _state.LatestHardware);
                _state.NoiseRange = signal.NoiseRange;
                _state.VerticesDirty = true;
            }
        }

        private void StoreHardwareSnapshot(BlockPacket blockPacket)
        {
            if (base.requestHold || blockPacket.Count <= 0) return;

            DataPacket dataPacket = blockPacket.BlockData[blockPacket.Count - 1];

            lock (_state.Lock)
                _state.LatestHardware.CopyFrom(dataPacket);
        }

        private static bool IsActiveChartState(HeadState state)
        {
            HeadState? activeState = MyChart.ActiveChart?.ChartState;
            return !activeState.HasValue || activeState.Value == state;
        }

        protected override void Init()
        {
            base.Init();
            _state.VertexBuffer.Init();
            _state.XAxisUnitLabel       = new TextBlock(XAxisUnit, 0, 0, font, TextAlign.Right);
            _state.NoiseRangeLabel      = new TextBlock(NoiseRangeLabel, 0, 0, font, TextAlign.Right);
            _state.NoiseRangeValueLabel = new TextBlock("0", 0, 0, font, TextAlign.Right, NoiseRangeFormat);
            _state.NoiseRangeBlocks     = [_state.NoiseRangeValueLabel, _state.NoiseRangeLabel];
            AttachSignalHoldHandlers();

            _state.VertexBuffer.Set(ref _state.Vertices, _state.VertexCount);

            SetAutomaticViewPort(new RectangleF(-0.5f, -0.5f, MAX_SAMPLES - 0.5f, 1000 - 0.5f));
            MyColour myColour = Color.SeaShell;

            for (int i = 0; i < _state.Vertices.Length; i++)
            {
                _state.Vertices[i].Position.X = i * 0.001f;
                _state.Vertices[i].Position.Y = 0;
                _state.Vertices[i].Colour = myColour;
            }
            _state.VertexCount = _state.Vertices.Length;
            _state.VertexBuffer.Set(ref _state.Vertices, _state.VertexCount);  // no lock as ready is not yet set.
            _state.Ready = true;
        }

        protected override void Shutdown()
        {
            _state.Ready = false;
            cmStrip.Closed -= cmStrip_Closed;

            SP.BlockPacketReceived -= SP_BlockPacketReceived;
            SP.RawSignalPacketReceived -= SP_RawSignalPacketReceived;
            DetachSignalHoldHandlers();

            _state.XAxisUnitLabel?.Dispose();
            _state.NoiseRangeLabel?.Dispose();
            _state.NoiseRangeValueLabel?.Dispose();
            _state.XAxisUnitLabel = null;
            _state.NoiseRangeLabel = null;
            _state.NoiseRangeValueLabel = null;
            _state.NoiseRangeBlocks = [];
            _state.VertexBuffer.Dispose();
            base.Shutdown();
            _state.Disposed = true;
        }

        #region State

        private sealed class ViewerState
        {
            public readonly object Lock = new();
            public TextBlock? XAxisUnitLabel;
            public TextBlock? NoiseRangeLabel;
            public TextBlock? NoiseRangeValueLabel;
            public TextBlock[] NoiseRangeBlocks = [];
            public float NoiseRange = 0.0f;
            public DataPacket LatestHardware = DataPacket.Rent();
            public NoiseSnapshot LatestNoise = NoiseSnapshot.Empty;
            public RawSignalSnapshot LatestSignal = RawSignalSnapshot.Empty;
            public bool VerticesDirty = true;
            public RectangleF LastVertexPlotViewPort = RectangleF.Empty;
            public Size LastVertexDisplaySize = Size.Empty;
            public bool SignalPointerDown;
            public bool SignalPointerMoved;
            public Point SignalPointerDownAt;
            public readonly MyGLVertexBuffer VertexBuffer = new(MAX_VERTICES);
            public Vertex[] Vertices = new Vertex[MAX_VERTICES];
            public int VertexCount = 0;
            public bool Ready = false;
            public bool Disposed = false;
        }

        private sealed record RawSignalSnapshot(
            double Timestamp,
            HeadState State,
            SignalData[] Samples,
            int Count,
            int CutIndex,
            float Mean,
            float MinY,
            float MaxY,
            float LastX,
            float NoiseRange)
        {
            public bool IsValid => Count > 0
                && Samples.Length >= Count
                && float.IsFinite(Mean)
                && float.IsFinite(MinY)
                && float.IsFinite(MaxY)
                && LastX > 0.0f;

            public static RawSignalSnapshot Empty { get; } = new(
                0.0,
                HeadState.None,
                [],
                0,
                0,
                float.NaN,
                float.NaN,
                float.NaN,
                0.0f,
                0.0f);
        }

        #endregion
    }
}
