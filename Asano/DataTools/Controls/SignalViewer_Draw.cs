using TheLib;
using Asano.MyGLTools.Helpers;

namespace Asano.DataTools.Controls
{
    public partial class SignalViewer
    {
        protected override void DrawPlots()
        {
            lock (_state.Lock)
            {
                EnsureVerticesForCurrentView();
                // New packets can update ViewPort after the base render pass has loaded the transform.
                ApplyPlotTransform();
                _state.VertexBuffer.DrawTriangles();
            }
        }

        protected override void DrawPlotOverlays()
        {
            lock (_state.Lock)
                base.DrawPlotOverlays();
        }

        protected override void DrawText()
        {
            base.DrawText();

            if (_state.XAxisUnitLabel == null && _state.NoiseRangeBlocks.Length == 0) return;

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
            if (_state.XAxisUnitLabel == null) return;

            _state.XAxisUnitLabel.X = DisplayRectangle.Width - XAxisUnitRightMargin;
            _state.XAxisUnitLabel.Y = XAxisUnitBottomMargin;
            fontRenderer.RenderText(_state.XAxisUnitLabel);
        }

        private void DrawNoiseRangeText()
        {
            if (_state.NoiseRangeLabel == null || _state.NoiseRangeValueLabel == null || _state.NoiseRangeBlocks.Length != 2) return;

            float noiseRange;
            lock (_state.Lock)
                noiseRange = _state.NoiseRange;

            _state.NoiseRangeValueLabel.SetValue(noiseRange, NoiseRangeFormat);

            _state.NoiseRangeLabel.X = DisplayRectangle.Width - NoiseRangeRightMargin;
            _state.NoiseRangeLabel.Y = DisplayRectangle.Height - NoiseRangeTopMargin;
            _state.NoiseRangeLabel.GetVertices(fontRenderer.Scaling);

            if (!_state.NoiseRangeLabel.Bounds.IsEmpty)
            {
                float top = DisplayRectangle.Height - NoiseRangeTopMargin;
                _state.NoiseRangeLabel.Y += top - _state.NoiseRangeLabel.Bounds.Top;
                _state.NoiseRangeLabel.GetVertices(fontRenderer.Scaling);
                _state.NoiseRangeValueLabel.X = _state.NoiseRangeLabel.Bounds.Left - NoiseRangeLabelGap;
            }
            else
            {
                _state.NoiseRangeValueLabel.X = _state.NoiseRangeLabel.X - NoiseRangeLabelGap;
            }

            _state.NoiseRangeValueLabel.Y = _state.NoiseRangeLabel.Y + 0.01f;
            fontRenderer.RenderText(_state.NoiseRangeBlocks, _state.NoiseRangeBlocks.Length);
        }

        private void AttachSignalHoldHandlers()
        {
            MyGL.MouseDown += SignalHold_MouseDown;
            MyGL.MouseMove += SignalHold_MouseMove;
            MyGL.MouseUp += SignalHold_MouseUp;
            MyGL.MouseWheel += SignalHold_MouseWheel;
            MyGL.MouseLeave += SignalHold_MouseLeave;
        }

        private void DetachSignalHoldHandlers()
        {
            MyGL.MouseDown -= SignalHold_MouseDown;
            MyGL.MouseMove -= SignalHold_MouseMove;
            MyGL.MouseUp -= SignalHold_MouseUp;
            MyGL.MouseWheel -= SignalHold_MouseWheel;
            MyGL.MouseLeave -= SignalHold_MouseLeave;
        }

        private void SignalHold_MouseDown(object? sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;

            _state.SignalPointerDown = true;
            _state.SignalPointerMoved = false;
            _state.SignalPointerDownAt = e.Location;
        }

        private void SignalHold_MouseMove(object? sender, MouseEventArgs e)
        {
            if (!_state.SignalPointerDown || (Control.MouseButtons & MouseButtons.Left) == 0) return;

            if (Math.Abs(e.X - _state.SignalPointerDownAt.X) > 2 || Math.Abs(e.Y - _state.SignalPointerDownAt.Y) > 2)
                _state.SignalPointerMoved = true;
        }

        private void SignalHold_MouseUp(object? sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;

            if (_state.SignalPointerMoved)
                base.requestHold = true;

            _state.SignalPointerDown = false;
            _state.SignalPointerMoved = false;
        }

        private void SignalHold_MouseWheel(object? sender, MouseEventArgs e)
        {
            if (e.Delta != 0)
                base.requestHold = true;
        }

        private void SignalHold_MouseLeave(object? sender, EventArgs e)
        {
            _state.SignalPointerDown = false;
            _state.SignalPointerMoved = false;
            base.requestHold = false;
        }

        private float GetMidYScreenRatio()
        {
            float clientHeight = Math.Max(1.0f, Height);
            float axisY = Math.Clamp(MyAxesRenderer.XAxisLineY, 0.0f, clientHeight);
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

        private void EnsureVerticesForCurrentView()
        {
            RawSignalSnapshot signal = _state.LatestSignal;
            if (!signal.IsValid)
            {
                if (_state.VertexCount != 0)
                {
                    _state.VertexCount = 0;
                    _state.VertexBuffer.Set(ref _state.Vertices, _state.VertexCount);
                }
                return;
            }

            if (_state.VerticesDirty)
                ApplySignalViewPort(signal);

            RectangleF plotViewPort = GetPlotViewPort();
            Size displaySize = GLDisplaySize;

            if (!_state.VerticesDirty
                && displaySize == _state.LastVertexDisplaySize
                && NearlySame(plotViewPort, _state.LastVertexPlotViewPort))
                return;

            BuildSignalVertices(signal, plotViewPort, displaySize);
            _state.VertexBuffer.Set(ref _state.Vertices, _state.VertexCount);

            _state.LastVertexPlotViewPort = plotViewPort;
            _state.LastVertexDisplaySize = displaySize;
            _state.VerticesDirty = false;
        }

        private void ApplySignalViewPort(RawSignalSnapshot signal)
        {
            float midY = signal.Mean;
            float midRatio = GetMidYScreenRatio();
            float height = GetAnchoredViewHeight(midY, signal.MinY, signal.MaxY, midRatio);
            float topY = midY - height * midRatio;

            _state.NoiseRange = signal.NoiseRange;
            SetAutomaticViewPort(new RectangleF(0.0f, topY, signal.LastX, height));
        }

        private void BuildSignalVertices(RawSignalSnapshot signal, RectangleF plotViewPort, Size displaySize)
        {
            float minDX = MinVisibleSignalWidth(plotViewPort, displaySize);
            int verts = 0;

            MyColour colour = Color.SeaShell;
            MyColour transparent = colour with { a = 0.4f };

            for (int i = 0; i < signal.Count && verts + VERTICES_PER_SAMPLE <= _state.Vertices.Length; i++)
            {
                SignalData sample = signal.Samples[i];
                float y = sample.Sample;
                if (!float.IsFinite(y)) continue;

                float x1 = sample.StartTick * ticksToSeconds;
                float x2 = sample.EndTick * ticksToSeconds;

                if (x2 - x1 < minDX) x2 = x1 + minDX;

                float y1 = MathF.Min(signal.Mean, y);
                float y2 = MathF.Max(signal.Mean, y);

                MyColour c = (y2 - y1 < 1.0f) ? transparent : colour;

                _state.Vertices[verts].Position.X = x1; _state.Vertices[verts].Position.Y = y1; _state.Vertices[verts].Colour = c; verts++;
                _state.Vertices[verts].Position.X = x2; _state.Vertices[verts].Position.Y = y1; _state.Vertices[verts].Colour = c; verts++;
                _state.Vertices[verts].Position.X = x2; _state.Vertices[verts].Position.Y = y2; _state.Vertices[verts].Colour = c; verts++;
                _state.Vertices[verts].Position.X = x1; _state.Vertices[verts].Position.Y = y1; _state.Vertices[verts].Colour = c; verts++;
                _state.Vertices[verts].Position.X = x2; _state.Vertices[verts].Position.Y = y2; _state.Vertices[verts].Colour = c; verts++;
                _state.Vertices[verts].Position.X = x1; _state.Vertices[verts].Position.Y = y2; _state.Vertices[verts].Colour = c; verts++;
            }

            _state.VertexCount = verts;
        }

        private static float MinVisibleSignalWidth(RectangleF plotViewPort, Size displaySize)
        {
            if (displaySize.Width <= 0 || !float.IsFinite(plotViewPort.Width) || plotViewPort.Width <= 0.0f)
                return 0.001f;

            return (plotViewPort.Width / displaySize.Width) * 1.5f;
        }

        private static bool NearlySame(RectangleF a, RectangleF b)
        {
            const float epsilon = 0.000001f;

            return MathF.Abs(a.Left   - b.Left  ) <= epsilon
                && MathF.Abs(a.Top    - b.Top   ) <= epsilon
                && MathF.Abs(a.Width  - b.Width ) <= epsilon
                && MathF.Abs(a.Height - b.Height) <= epsilon;
        }
    }
}
