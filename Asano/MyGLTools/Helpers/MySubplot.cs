using OpenTK.Mathematics;
using TheLib;
using Asano.MyGLTools.Fonts;
using Asano.MyGLTools.UserControls;

namespace Asano.MyGLTools.Helpers
{
    class MySubplot : MyGLViewport
    {
        private readonly MyGLVertexBuffer _waveBuffer_C0 = new(4096);
        private readonly MyGLVertexBuffer _waveBuffer_PG = new(4096);
        private readonly MyGLVertexBuffer _waveBuffer_EV = new(4096);
        private readonly MyGLVertexBuffer _waveBuffer_TMP= new(4096);

        private readonly double _C0_Scale = Config.C0to1024;
        private readonly double _PG_Scale = 1.0;

        private readonly MyGLVertexBuffer _gridBuffer = new(8192);
        private bool _gridDirty = true;
        private readonly MyMeasure _stateDurationMeasure = new();
        private readonly MyMeasure _firstMeasurementMeasure = new();
        private readonly MyMeasure _sampleIntervalMeasure = new();
        private readonly MyMeasure _lastIntervalMeasure = new();
        private const float MinGoodDataIntervalSeconds = 0.000_001f;
        private float _firstMeasurementX = float.NaN;
        private float _secondMeasurementX = float.NaN;
        private float _lastIntervalStartX = float.NaN;
        private float _lastIntervalEndX = float.NaN;
        
        
        public int GridDivisions { get; set; } = (int)Math.Round(Config.STATE_DURATION_uS * 0.000_001f);
        public bool UniformGrid { get; set; } = false;

        public MySubplot(MyPlotterBase myPlotter) : base(myPlotter)
        {
            base.Margin = 40;
            base.InRect = new RectangleF(0f, 0f, 0.5f, 0.35f);
            this.OutRect = new RectangleF(0f, -10f, Config.STATE_DURATION_uS * 0.000_001f, 1050f);
        }

        public override void Init()
        {
            base.Init();

            _waveBuffer_C0.Init();
            _waveBuffer_PG.Init();
            _waveBuffer_EV.Init();
            
            _waveBuffer_TMP.Init();

            _gridBuffer.Init();
            _stateDurationMeasure.Init();
            _firstMeasurementMeasure.Init();
            _sampleIntervalMeasure.Init();
            _lastIntervalMeasure.Init();
            UpdateStateDurationMeasure();
            UpdateDataMeasures();
        }

        public override void Shutdown()
        {
            base.Shutdown();
            _gridBuffer.Dispose();
            _waveBuffer_C0.Dispose();
            _waveBuffer_PG.Dispose();
            _waveBuffer_EV.Dispose();

            _waveBuffer_TMP.Dispose();
            _stateDurationMeasure.Dispose();
            _firstMeasurementMeasure.Dispose();
            _sampleIntervalMeasure.Dispose();
            _lastIntervalMeasure.Dispose();
        }

        /// <summary>
        /// Overrides base OutRect to auto-invalidate grid when data range changes.
        /// </summary>
        public new RectangleF OutRect
        {
            get => base.OutRect;
            set
            {
                if (!value.Equals(base.OutRect))
                {
                    base.OutRect = value;
                    _gridDirty = true;
                    UpdateStateDurationMeasure();
                    UpdateDataMeasures();
                }
            }
        }

        public void SetBlock(BlockPacket block)
        {
            _waveBuffer_C0 .SetSubPlotData(block, FieldEnum.C0     , _C0_Scale);
            _waveBuffer_PG .SetSubPlotData(block, FieldEnum.Sensor2, _PG_Scale);
            _waveBuffer_EV .SetSubPlotData(block, FieldEnum.Events , 1.0);

            _waveBuffer_TMP.SetSubPlotData(block, FieldEnum.Sensor1, 1.0);

            SetDataMeasures(block);
        }

        public void Render()
        {
            if (_waveBuffer_C0.VertexCount <= 0) return;

            if (!SetupViewport()) return;  // viewport, scissor, ortho projection from OutRect

            if (_gridDirty)
                if (UniformGrid)
                    BuildGrid();
                else
                    BuildGrid(_waveBuffer_C0);
            
            _gridBuffer.DrawLines();

//            _waveBuffer_C0 .DrawLineStrip();
            _waveBuffer_PG .DrawLineStrip();
            _waveBuffer_TMP.DrawLineStrip();

            // Draw events as vertical lines
            _waveBuffer_EV.DrawLines();

            _firstMeasurementMeasure.Render(ViewportRect, OutRect);
            _sampleIntervalMeasure.Render(ViewportRect, OutRect);
            _lastIntervalMeasure.Render(ViewportRect, OutRect);

            ResetViewport(CreateParentPixelTransform());

            _stateDurationMeasure.RenderOverlay(ViewportRect, OutRect);

            ResetViewport(_myPlotter.getPlotTransform());  // clean restore to parent viewport
        }

        public void RenderText(FontRenderer fontRenderer)
        {
            if (_waveBuffer_C0.VertexCount <= 0) return;

            _stateDurationMeasure.RenderText(fontRenderer, ViewportRect, OutRect);
            _firstMeasurementMeasure.RenderText(fontRenderer, ViewportRect, OutRect);
            _sampleIntervalMeasure.RenderText(fontRenderer, ViewportRect, OutRect);
            _lastIntervalMeasure.RenderText(fontRenderer, ViewportRect, OutRect);
        }

        private void UpdateStateDurationMeasure()
        {
            RectangleF r = OutRect;
            float y = r.Bottom + Math.Max(20.0f, r.Height * 0.035f);

            _stateDurationMeasure.SetRange(r.Left, r.Right, y);
            _stateDurationMeasure.SetValue((r.Right - r.Left) * 1000.0, "ms");
        }

        private void SetDataMeasures(BlockPacket block)
        {
            if (block.Count <= 0)
            {
                _firstMeasurementX = float.NaN;
                _secondMeasurementX = float.NaN;
                _lastIntervalStartX = float.NaN;
                _lastIntervalEndX = float.NaN;
                UpdateDataMeasures();
                return;
            }

            _firstMeasurementX = (float)block.BlockData[0].StateTime;
            _secondMeasurementX = block.Count >= 2
                ? (float)block.BlockData[1].StateTime
                : float.NaN;

            if (TryGetLastDataInterval(block, out float lastIntervalStartX, out float lastIntervalEndX))
            {
                _lastIntervalStartX = lastIntervalStartX;
                _lastIntervalEndX = lastIntervalEndX;
            }
            else
            {
                _lastIntervalStartX = float.NaN;
                _lastIntervalEndX = float.NaN;
            }

            UpdateDataMeasures();
        }

        private void UpdateDataMeasures()
        {
            RectangleF r = OutRect;
            float bottomY = r.Top + Math.Max(20.0f, r.Height * 0.035f);
            float topY = r.Bottom - Math.Max(20.0f, r.Height * 0.035f);

            if (float.IsFinite(_firstMeasurementX))
            {
                float x = Math.Clamp(_firstMeasurementX, r.Left, r.Right);
                _firstMeasurementMeasure.Visible = x > r.Left + 0.000001f;

                if (_firstMeasurementMeasure.Visible)
                {
                    _firstMeasurementMeasure.SetRange(r.Left, x, bottomY);
                    _firstMeasurementMeasure.SetValue((x - r.Left) * 1000.0, "ms");
                }
            }
            else
            {
                _firstMeasurementMeasure.Visible = false;
            }

            _sampleIntervalMeasure.Visible = float.IsFinite(_firstMeasurementX) && float.IsFinite(_secondMeasurementX);
            if (_sampleIntervalMeasure.Visible)
            {
                _sampleIntervalMeasure.SetRange(_firstMeasurementX, _secondMeasurementX, topY);
                _sampleIntervalMeasure.SetValue(Math.Abs(_secondMeasurementX - _firstMeasurementX) * 1000.0, "ms");
            }

            _lastIntervalMeasure.Visible = float.IsFinite(_lastIntervalStartX)
                && float.IsFinite(_lastIntervalEndX)
                && (_lastIntervalStartX != _firstMeasurementX || _lastIntervalEndX != _secondMeasurementX);

            if (!_lastIntervalMeasure.Visible) return;

            _lastIntervalMeasure.SetRange(_lastIntervalStartX, _lastIntervalEndX, topY);
            _lastIntervalMeasure.SetValue(Math.Abs(_lastIntervalEndX - _lastIntervalStartX) * 1000.0, "ms");
        }

        private static bool TryGetLastDataInterval(BlockPacket block, out float startX, out float endX)
        {
            startX = float.NaN;
            endX = float.NaN;

            for (int endIndex = block.Count - 1; endIndex >= 1; endIndex--)
            {
                double start = block.BlockData[endIndex - 1].StateTime;
                double end = block.BlockData[endIndex].StateTime;

                if (Math.Abs(end - start) < MinGoodDataIntervalSeconds) continue;

                startX = (float)start;
                endX = (float)end;
                return true;
            }

            return false;
        }

        private Matrix4 CreateParentPixelTransform()
        {
            int width = Math.Max(1, ParentViewportRect.Width);
            int height = Math.Max(1, ParentViewportRect.Height);

            return Matrix4.CreateOrthographicOffCenter(0.0f, width, 0.0f, height, -1.0f, 1.0f);
        }





        #region Build Grid Methods
        readonly Color _gridColor = Color.FromArgb(80, 255, 255, 255);
        float[] xs = new float[160];
        Vertex[] grid = new Vertex[1024];

        private void BuildGrid(MyGLVertexBuffer? waveBuffer = null)
        {
            var r = OutRect;
            float xMin = r.Left, xMax = r.Right, yMin = r.Top, yMax = r.Bottom; // note: Y inverted in GL coords
            int numVerticalLines;

            // Get the X positions for vertical lines
            if (waveBuffer is null)
            {
                int div = Math.Max(1, GridDivisions);
                numVerticalLines = div + 1;
                if (xs.Length < numVerticalLines)
                    xs = new float[numVerticalLines];

                float step = (xMax - xMin) / div;
                for (int i = 0; i <= div; i++)
                    xs[i] = xMin + i * step;


                _gridDirty = false;  // only when uniform grid
            }
            else
            {
                var span = waveBuffer.GetLatestX();
                numVerticalLines= span.Length + 2; 
                if (xs.Length < numVerticalLines)
                    xs = new float[numVerticalLines];

                xs[0] = xMin;
                for (int i = 0; i < span.Length; i++)
                    xs[i + 1] = span[i];
                xs[span.Length + 1] = xMax;

            }

            int count = 0;

            for (int i = 0; i < numVerticalLines; i++)
            {
                float yOff = (i == 0 || i == numVerticalLines - 1) ? 0f : 80f;
                grid[count++] = new Vertex(xs[i], yMin + yOff, 0f, _gridColor);
                grid[count++] = new Vertex(xs[i], yMax       , 0f, _gridColor);
            }

            // top
            grid[count++] = new Vertex(xMin, yMax, 0f, _gridColor);
            grid[count++] = new Vertex(xMax, yMax, 0f, _gridColor);
            // bottom
            grid[count++] = new Vertex(xMin, yMin, 0f, _gridColor);
            grid[count++] = new Vertex(xMax, yMin, 0f, _gridColor);

            _gridBuffer.Set(ref grid, count);
        }
        #endregion
    }

}
