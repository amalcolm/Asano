using OpenTK.Graphics.OpenGL4;
using Asano.MyGLTools.Fonts;

namespace Asano.MyGLTools.Helpers
{
    public sealed class PlotAxesRenderer
    {
        private const int MaxXTicks = 64;
        private const int MaxYTicks = 64;
        private const int VertexCapacity = (MaxXTicks + MaxYTicks) * 4 + 4;
        private const float DesiredXTickSpacing = 95.0f;
        private const float DesiredYTickSpacing = 65.0f;
        private const float TickSearchOverflow = 0.05f;
        private const float TickLength = 6.0f;
        private const float XLabelOffset = 0.0f;
        private const float XLabelBottom = -8.0f;
        public const float XAxisLineY = 28.0f;
        private const float YLabelRight = 58.0f;
        
        [Flags]
        public enum GridFlags
        {
            None            = 0,
            VerticalLines   = 1,
            HorizontalLines = 2,
            AllLines        = VerticalLines | HorizontalLines,

            YaxisLabels      = 4,
            XaxisLabels      = 8,
            AllLabels        = YaxisLabels | XaxisLabels,

            All = AllLines | AllLabels
        }

        public class _Options
        {
            public bool AxesVisible        { get => _axesVisible;      set { _axesVisible      = value; Changed = true; } }   private bool      _axesVisible      = true;
            public bool GridVisible        { get => _gridVisible;      set { _gridVisible      = value; Changed = true; } }   private bool      _gridVisible      = true;
            public bool TicksVisible       { get => _ticksVisible;     set { _ticksVisible     = value; Changed = true; } }   private bool      _ticksVisible     = true;
            public bool AxesLabelVisible   { get => _axesLabelVisible; set { _axesLabelVisible = value; Changed = true; } }   private bool      _axesLabelVisible = true;
            public float LabelPadding      { get => _labelPadding;     set { _labelPadding     = value; Changed = true; } }   private float     _labelPadding     = 60.0f;
            public float XAxisUnitScale    { get => _xAxisUnitScale;   set { _xAxisUnitScale   = value; Changed = true; } }   private float     _xAxisUnitScale   = 1.0f;
            public Color LabelColor        { get => _labelColor;       set { _labelColor       = value; Changed = true; } }   private Color     _labelColor       = Color.FromArgb(180, 32, 32, 32);
            public Color AxisColour        { get => _axisColor;        set { _axisColor        = value; Changed = true; } }   private Color     _axisColor        = Color.FromArgb(180, 32, 32, 32);
            public Color GridColour        { get => _gridColor;        set { _gridColor        = value; Changed = true; } }   private Color     _gridColor        = Color.FromArgb(8, 32, 32, 32);
            public Color TickColour        { get => _tickColor;        set { _tickColor        = value; Changed = true; } }   private Color     _tickColor        = Color.FromArgb(140, 32, 32, 32);
            public GridFlags GridSettings  { get => _gridSettings;     set { _gridSettings     = value; Changed = true; } }   private GridFlags _gridSettings     = GridFlags.All;

            public string XFormat          { get => _xFormat;          set { _xFormat          = value; Changed = true; } }   private string    _xFormat           = "HH:mm:ss";
            public string YFormat          { get => _yFormat;          set { _yFormat          = value; Changed = true; } }   private string    _yFormat           = "G5";


            private float _xAxisLabelClipRightPadding = 0.0f;
            public float XAxisLabelClipRightPadding
            {
                get => _xAxisLabelClipRightPadding;
                set { _xAxisLabelClipRightPadding = value; Changed = true; }
            }

            internal bool Changed { get; set; } = true;
            internal void ClearChanged() => Changed = false;
        };
        public _Options Options { get => _options; set { _options = value; _options.Changed = true; } }  private _Options _options = new();





        private readonly MyGLVertexBuffer _lineBuffer = new(VertexCapacity);
        private Vertex[] _vertices = new Vertex[VertexCapacity];

        private readonly TextBlock[] _xLabels = new TextBlock[MaxXTicks];
        private readonly TextBlock[] _yLabels = new TextBlock[MaxYTicks];
        private readonly float[] _xLabelTicks = new float[MaxXTicks];
        private readonly float[] _yLabelTicks = new float[MaxYTicks];
        private MyColour _AxisColour;
        private MyColour _GridColour;
        private MyColour _LineColour;

        private RectangleF _lastViewPort = RectangleF.Empty;
        private Size _lastDisplaySize = Size.Empty;
        private int _xLabelCount;
        private int _yLabelCount;
        private readonly int[] _savedScissorBox = new int[4];
        private bool _savedScissorEnabled;
        private bool _ready;

        public void Init(FontFile? font)
        {
            _lineBuffer.Init();  

            for (int i = 0; i < _xLabels.Length; i++)
                _xLabels[i] = new TextBlock("0", 0, 0, font, TextAlign.Right, Options.XFormat);

            for (int i = 0; i < _yLabels.Length; i++)
                _yLabels[i] = new TextBlock("0", 0, 0, font, TextAlign.Right, Options.YFormat);

            _ready = true;
        }

        public void Shutdown()
        {
            _ready = false;
            _lineBuffer.Dispose();

            for (int i = 0; i < _xLabels.Length; i++)
                _xLabels[i]?.Dispose();

            for (int i = 0; i < _yLabels.Length; i++)
                _yLabels[i]?.Dispose();
        }

        public void RenderLines(RectangleF viewPort, Size displaySize)
        {
            if (!_ready) return;

            if (!IsUsable(viewPort, displaySize))
            {
                _xLabelCount = 0;
                _yLabelCount = 0;
                return;
            }

            if (NeedsRebuild(viewPort, displaySize))
                Rebuild(viewPort, displaySize);

            _lineBuffer.DrawLines();
        }

        public void RenderText(FontRenderer fontRenderer)
        {
            if (!_ready || Options.AxesLabelVisible == false) return;

            if (_yLabelCount > 0)
            {
                PositionYLabels(fontRenderer.Scaling);
                fontRenderer.RenderText(_yLabels, _yLabelCount);
            }

            if (_xLabelCount <= 0) return;

            PositionXLabels(fontRenderer.Scaling);

            bool clipped = BeginXAxisLabelClip();
            fontRenderer.RenderText(_xLabels, _xLabelCount);
            if (clipped)
                EndXAxisLabelClip();
        }

        private bool NeedsRebuild(RectangleF viewPort, Size displaySize)
        {
            if (Options.Changed) return true;
            if (!_lastDisplaySize.Equals(displaySize)) return true;

            const float epsilon = 0.000001f;

            return Math.Abs(_lastViewPort.X      - viewPort.X     ) > epsilon
                || Math.Abs(_lastViewPort.Y      - viewPort.Y     ) > epsilon
                || Math.Abs(_lastViewPort.Width  - viewPort.Width ) > epsilon
                || Math.Abs(_lastViewPort.Height - viewPort.Height) > epsilon;
        }

        private void Rebuild(RectangleF viewPort, Size displaySize)
        {
            _lastViewPort = viewPort;
            _lastDisplaySize = displaySize;
            _xLabelCount = 0;
            _yLabelCount = 0;

            _AxisColour = Options.AxisColour;
            _GridColour = Options.GridColour;
            _LineColour = Options.TickColour;

            float xMin = viewPort.Left;
            float xMax = viewPort.Right;
            float yMin = viewPort.Top;
            float yMax = viewPort.Bottom;

            float xRange = xMax - xMin;
            float yRange = yMax - yMin;
            float xTickWorld = xRange * TickLength / Math.Max(1, displaySize.Width);
            float yTickWorld = yRange * TickLength / Math.Max(1, displaySize.Height);

            bool showXLabels = Options.AxesLabelVisible && DrawGridLabels(GridFlags.XaxisLabels);
            bool showYLabels = Options.AxesLabelVisible && DrawGridLabels(GridFlags.YaxisLabels);
            bool drawXAxis = Options.AxesVisible && showXLabels;
            bool drawYAxis = Options.AxesVisible && showYLabels;

            float xAxisWorldY = drawXAxis ? ScreenToWorldY(GetXAxisLineY(displaySize), yMin, yMax, displaySize.Height) : yMin;
            float yAxisWorldX = drawYAxis ? ScreenToWorldX(GetYAxisLineX(displaySize), xMin, xMax, displaySize.Width) : xMin;

            int vertexCount = 0;

            if (drawXAxis)
            {
                float xAxisLeft = drawYAxis ? yAxisWorldX : xMin;
                float xAxisRight = ScreenToWorldX(GetXAxisLineRight(displaySize), xMin, xMax, displaySize.Width);

                if (xAxisRight > xAxisLeft)
                    AddLine(ref vertexCount, xAxisLeft, xAxisWorldY, xAxisRight, xAxisWorldY, _AxisColour);
            }

            if (drawYAxis)
                AddLine(ref vertexCount, yAxisWorldX, drawXAxis ? xAxisWorldY : yMin, yAxisWorldX, yMax, _AxisColour);

            float xOverflow = xRange * TickSearchOverflow;
            float yOverflow = yRange * TickSearchOverflow;
            int desiredXTicks = GetDesiredTickCount(displaySize.Width , DesiredXTickSpacing, MaxXTicks - 2);
            int desiredYTicks = GetDesiredTickCount(displaySize.Height, DesiredYTickSpacing, MaxYTicks - 2);

            BuildXTicks(ref vertexCount, xMin - xOverflow, xMax + xOverflow, xMin, xMax, yMin, yMax, yTickWorld, xAxisWorldY, desiredXTicks, showXLabels, displaySize);
            BuildYTicks(ref vertexCount, yMin - yOverflow, yMax + yOverflow, xMin, xMax, yMin, yMax, xTickWorld, yAxisWorldX, drawYAxis, desiredYTicks, showYLabels, displaySize);

            _lineBuffer.Set(ref _vertices, vertexCount);

            Options.ClearChanged();
        }

        private void BuildXTicks(ref int vertexCount, float tickMin, float tickMax, float xMin, float xMax, float yMin, float yMax, float tickWorld, float axisWorldY, int desiredTicks, bool showLabels, Size displaySize)
        {

            float step = NiceStep(xMax - xMin, desiredTicks);
            if (!float.IsFinite(step) || step <= 0.0f) return;


            float first = MathF.Ceiling(tickMin / step) * step;
            int tickCount = 0;

            bool isTime = Options.XFormat.Contains(":") && Options.XAxisUnitScale == 1.0;
            for (float x = first; x <= tickMax && tickCount < MaxXTicks; x += step)
            {
                if (DrawGridLine(GridFlags.VerticalLines))
                    AddLine(ref vertexCount, x, yMin, x, yMax, _GridColour);

                if (Options.TicksVisible)
                    AddLine(ref vertexCount, x, axisWorldY - tickWorld, x, axisWorldY, _LineColour);

                if (showLabels)
                {
                    TextBlock label = _xLabels[tickCount];
                    float tickScreenX = WorldToScreenX(x, xMin, xMax, displaySize.Width) + XLabelOffset;
                    label.X = tickScreenX;
                    label.Y = XLabelBottom;

                    if (isTime)
                        label.SetAsTime(x, Options.XFormat);
                    else
                        label.SetValue(GetXAxisLabelValue(x), Options.XFormat);

                    _xLabelTicks[tickCount] = tickScreenX;
                    _xLabelCount++;
                }

                tickCount++;
            }
        }

        private void BuildYTicks(ref int vertexCount, float tickMin, float tickMax, float xMin, float xMax, float yMin, float yMax, float tickWorld, float axisWorldX, bool drawAxis, int desiredTicks, bool showLabels, Size displaySize)
        {
            float step = NiceStep(yMax - yMin, desiredTicks);
            if (!float.IsFinite(step) || step <= 0.0f) return;


            float first = MathF.Ceiling(tickMin / step) * step;
            int tickCount = 0;

            for (float y = first; y <= tickMax && tickCount < MaxYTicks; y += step)
            {
                if (DrawGridLine(GridFlags.HorizontalLines))
                    AddLine(ref vertexCount, xMin, y, xMax, y, _GridColour);

                if (Options.TicksVisible)
                {
                    if (drawAxis)
                        AddLine(ref vertexCount, axisWorldX - tickWorld, y, axisWorldX, y, _LineColour);
                    else
                        AddLine(ref vertexCount, axisWorldX, y, axisWorldX + tickWorld, y, _LineColour);
                }

                if (showLabels)
                {
                    TextBlock label = _yLabels[tickCount];
                    label.X = YLabelRight;
                    float tickScreenY = WorldToScreenY(y, yMin, yMax, displaySize.Height);
                    label.Y = tickScreenY;
                    label.SetValue(NormalizeLabelValue(y), Options.YFormat);
                    _yLabelTicks[tickCount] = tickScreenY;
                    _yLabelCount++;
                }

                tickCount++;
            }
        }

        private bool DrawGridLine(GridFlags flag)
            => Options.GridVisible && (Options.GridSettings & flag) != 0;

        private bool DrawGridLabels(GridFlags flag)
            => (Options.GridSettings & flag) != 0;

        private void PositionXLabels(float scaling)
        {
            for (int i = 0; i < _xLabelCount; i++)
            {
                TextBlock label = _xLabels[i];
                float tickX = _xLabelTicks[i];

                label.X = tickX;
                label.Y = XLabelBottom;
                label.GetVertices(scaling);

                if (label.Bounds.Width > 0.0f)
                    label.X += tickX - (label.Bounds.Left + label.Bounds.Width * 0.5f);
            }
        }

        private void PositionYLabels(float scaling)
        {
            for (int i = 0; i < _yLabelCount; i++)
            {
                TextBlock label = _yLabels[i];
                float tickY = _yLabelTicks[i];

                label.X = YLabelRight;
                label.Y = tickY;
                label.GetVertices(scaling);

                if (label.Bounds.Height > 0.0f)
                    label.Y += tickY - (label.Bounds.Top + label.Bounds.Height * 0.5f);
            }
        }

        private bool BeginXAxisLabelClip()
        {
            int width = GetXAxisLineRight(_lastDisplaySize);
            if (width >= _lastDisplaySize.Width || width <= 0 || _lastDisplaySize.Height <= 0) return false;

            _savedScissorEnabled = GL.IsEnabled(EnableCap.ScissorTest);
            GL.GetInteger(GetPName.ScissorBox, _savedScissorBox);
            GL.Scissor(0, 0, width, _lastDisplaySize.Height);
            GL.Enable(EnableCap.ScissorTest);
            return true;
        }

        private void EndXAxisLabelClip()
        {
            if (_savedScissorEnabled)
                GL.Scissor(_savedScissorBox[0], _savedScissorBox[1], _savedScissorBox[2], _savedScissorBox[3]);
            else
                GL.Disable(EnableCap.ScissorTest);
        }

        private float GetXAxisLabelValue(float x)
        {
            float scale = Options.XAxisUnitScale;
            if (!float.IsFinite(scale) || scale == 0.0f) return NormalizeLabelValue(x);

            return NormalizeLabelValue(x / scale);
        }

        private static float NormalizeLabelValue(float value)
        {
            if (value == 0.0f || Math.Abs(value) < 0.000001f) return 0.0f;
            return value;
        }

        private static float GetXAxisLineY(Size displaySize)
            => Math.Clamp(XAxisLineY, 0.0f, Math.Max(0.0f, displaySize.Height));

        private static float GetYAxisLineX(Size displaySize)
            => Math.Clamp(YLabelRight + TickLength, 0.0f, Math.Max(0.0f, displaySize.Width));

        private int GetXAxisLineRight(Size displaySize)
        {
            float padding = Options.XAxisLabelClipRightPadding;
            if (!float.IsFinite(padding) || padding <= 0.0f) return displaySize.Width;

            return Math.Clamp((int)MathF.Floor(displaySize.Width - padding), 0, displaySize.Width);
        }

        private void AddLine(ref int count, float x1, float y1, float x2, float y2, MyColour colour)
        {
            if (count + 2 > _vertices.Length) return;

            _vertices[count++] = new Vertex(x1, y1, 0.0f, colour);
            _vertices[count++] = new Vertex(x2, y2, 0.0f, colour);
        }

        private static float NiceStep(float range, int desiredTicks)
        {
            if (!float.IsFinite(range) || range <= 0.0f) return 0.0f;

            float rawStep = range / Math.Max(1, desiredTicks - 1);
            float exponent = MathF.Floor(MathF.Log10(rawStep));
            float magnitude = MathF.Pow(10.0f, exponent);
            float fraction = rawStep / magnitude;

            float niceFraction =
                fraction <= 1.0f ? 1.0f :
                fraction <= 2.0f ? 2.0f :
                fraction <= 5.0f ? 5.0f : 10.0f;

            return niceFraction * magnitude;
        }

        private static int GetDesiredTickCount(int pixels, float desiredSpacing, int maxTicks)
        {
            if (pixels <= 0 || desiredSpacing <= 0.0f) return 2;

            int ticks = (int)MathF.Round(pixels / desiredSpacing);
            return Math.Clamp(ticks, 2, maxTicks);
        }

        private static bool IsUsable(RectangleF viewPort, Size displaySize)
            => displaySize.Width > 0
            && displaySize.Height > 0
            && float.IsFinite(viewPort.Left)
            && float.IsFinite(viewPort.Right)
            && float.IsFinite(viewPort.Top)
            && float.IsFinite(viewPort.Bottom)
            && viewPort.Width > 0.0f
            && viewPort.Height > 0.0f;

        public static RectangleF AddLabelPadding(RectangleF viewPort, Size displaySize, float padding)
        {
            if (padding <= 0.0f || displaySize.Width <= 1 || viewPort.Width <= 0.0f)
                return viewPort;

            float usableWidth = displaySize.Width - padding;
            if (usableWidth <= 1.0f)
                return viewPort;

            float width = viewPort.Width * displaySize.Width / usableWidth;
            float left = viewPort.Right - width;

            return new RectangleF(left, viewPort.Top, width, viewPort.Height);
        }

        public static RectangleF RemoveLabelPadding(RectangleF viewPort, Size displaySize, float padding)
        {
            if (padding <= 0.0f || displaySize.Width <= 1 || viewPort.Width <= 0.0f)
                return viewPort;

            float usableWidth = displaySize.Width - padding;
            if (usableWidth <= 1.0f)
                return viewPort;

            float width = viewPort.Width * usableWidth / displaySize.Width;
            float left = viewPort.Right - width;

            return new RectangleF(left, viewPort.Top, width, viewPort.Height);
        }

        private static float WorldToScreenX(float x, float xMin, float xMax, int width)
            => (x - xMin) * width / (xMax - xMin);

        private static float WorldToScreenY(float y, float yMin, float yMax, int height)
            => (y - yMin) * height / (yMax - yMin);

        private static float ScreenToWorldX(float x, float xMin, float xMax, int width)
            => xMin + x * (xMax - xMin) / Math.Max(1, width);

        private static float ScreenToWorldY(float y, float yMin, float yMax, int height)
            => yMin + y * (yMax - yMin) / Math.Max(1, height);
    }
}
