using TheLib;
using System.Windows.Forms;
using Asano.MyGLTools.Fonts;
using Asano.MyGLTools.Helpers;
using Asano.MyGLTools.UserControls;

namespace Asano.DataTools.Controls
{
    public partial class NoiseViewer : MyInteractivePlotterBase
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

        private static TeensySerial SP => Program.serialPort ?? throw new InvalidOperationException("Serial port is not initialized.");

        private bool IsRunning => !_disposed && _ready;

        private readonly object _lock = new();
        private TextBlock? _xAxisUnitLabel;
        private TextBlock? _noiseRangeLabel;
        private TextBlock? _noiseRangeValueLabel;
        private TextBlock[] _noiseRangeBlocks = [];
        private float _noiseRange = 0.0f;

        public NoiseViewer()
        {
            BackColor = Color.MistyRose;
            Setup(initAction: Init, shutdownAction: Shutdown);
            SP.DataReceived += SP_DataReceived;

            AxesOptions = new() {
                AxesVisible    = true,
                GridVisible    = false,
                LabelPadding   = 70.0f,
                XAxisUnitScale = XAxisUnitScale,
                XAxisLabelClipRightPadding = XAxisUnitClipPadding
            };
        }


        static readonly float ticksToSeconds = 1.0f / 600_000_000f;
        private void SP_DataReceived(IPacket packet)
        {
            if (IsRunning == false || packet is not DebugPacket dbg) return; if (dbg.Count <= 0) return;

            if (base.requestHold) return;

            int max = Math.Min(dbg.Count, MAX_SAMPLES);

            double total = 0.0;
            for (int i = 0; i < max; i++)
                total += dbg.Data[i].Sample;

            float mean = (float)(total / max);

            float minY = float.MaxValue, maxY = float.MinValue;
            float lastX = 0.0f;
            int verts = 0;
            for (int i = 0; i < max; i++)
            {
                float y = dbg.Data[i].Sample;
                if (float.IsFinite(y) == false) continue;

                float x1 = dbg.Data[i].StartTick * ticksToSeconds;
                float x2 = dbg.Data[i].EndTick   * ticksToSeconds;

                float y1 = MathF.Min(mean, y);
                float y2 = MathF.Max(mean, y);

                vertices[verts].Position.X = x1;  vertices[verts].Position.Y = y1;  verts++;
                vertices[verts].Position.X = x2;  vertices[verts].Position.Y = y1;  verts++;
                vertices[verts].Position.X = x2;  vertices[verts].Position.Y = y2;  verts++;

                vertices[verts].Position.X = x1;  vertices[verts].Position.Y = y1;  verts++;
                vertices[verts].Position.X = x2;  vertices[verts].Position.Y = y2;  verts++;
                vertices[verts].Position.X = x1;  vertices[verts].Position.Y = y2;  verts++;

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
                _vertexBuffer.Set(ref vertices, vertexCount);
                SetAutomaticViewPort(new RectangleF(0.0f, topY, lastX, height));
            }
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

            _xAxisUnitLabel.X = DisplayRectangle.Width - XAxisUnitRightMargin;
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

            _noiseRangeLabel.X = DisplayRectangle.Width - NoiseRangeRightMargin;
            _noiseRangeLabel.Y = DisplayRectangle.Height - NoiseRangeTopMargin;
            _noiseRangeLabel.GetVertices(fontRenderer.Scaling);

            if (!_noiseRangeLabel.Bounds.IsEmpty)
            {
                float top = DisplayRectangle.Height - NoiseRangeTopMargin;
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
    }
}
