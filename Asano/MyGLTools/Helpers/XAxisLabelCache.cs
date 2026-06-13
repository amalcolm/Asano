using System.Drawing;
using Asano.MyGLTools.Fonts;

namespace Asano.MyGLTools.Helpers
{
    internal sealed class XAxisLabelCache : IDisposable
    {
        private const int PreallocatedCharsPerLabel = 24;

        private readonly TextBlock[] _labels;
        private readonly int[] _tickIndices;
        private readonly float[] _ticks;
        private readonly float[] _offsetX;
        private readonly float[] _offsetY;

        private int _count;
        private bool _isValid;
        private float _lastStep;
        private string _lastFormat = string.Empty;
        private float _lastUnitScale;
        private bool _lastIsTime;

        public XAxisLabelCache(int capacity, FontFile? font, string format)
        {
            _labels = new TextBlock[capacity];
            _tickIndices = new int[capacity];
            _ticks = new float[capacity];
            _offsetX = new float[capacity];
            _offsetY = new float[capacity];

            for (int i = 0; i < _labels.Length; i++)
            {
                _labels[i] = new TextBlock(string.Empty, 0.0f, 0.0f, font, TextAlign.Left, format);
                _labels[i].EnsureVertexCapacity(PreallocatedCharsPerLabel);
            }
        }

        public int Count => _count;
        public TextBlock[] Labels => _labels;
        public float[] OffsetX => _offsetX;
        public float[] OffsetY => _offsetY;

        public void Clear()
        {
            _count = 0;
            _isValid = false;
        }

        public void Update(RectangleF viewPort, float step, string format, float unitScale, bool isTime, float marginFraction)
        {
            if (!float.IsFinite(step) || step <= 0.0f || viewPort.Width <= 0.0f || _labels.Length == 0)
            {
                Clear();
                return;
            }

            float margin = viewPort.Width * marginFraction;
            int minTickIndex = FirstTickIndex(viewPort.Left - margin, step);
            int maxTickIndex = LastTickIndex(viewPort.Right + margin, step);

            if (maxTickIndex < minTickIndex)
            {
                Clear();
                return;
            }

            if (NeedsReset(step, format, unitScale, isTime, minTickIndex, maxTickIndex))
                Rebuild(minTickIndex, maxTickIndex, step, format, unitScale, isTime);
            else
                Advance(minTickIndex, maxTickIndex, step, format, unitScale, isTime);

            _lastStep = step;
            _lastFormat = format;
            _lastUnitScale = unitScale;
            _lastIsTime = isTime;
            _isValid = true;
        }

        public void UpdateScreenPositions(RectangleF viewPort, Size displaySize, float scaling, float y, float xOffset)
        {
            for (int i = 0; i < _count; i++)
            {
                TextBlock label = _labels[i];
                label.GetVertices(scaling);

                RectangleF bounds = label.Bounds;
                float screenX = (_ticks[i] - viewPort.Left) * displaySize.Width / viewPort.Width + xOffset;
                _offsetX[i] = bounds.Width > 0.0f
                    ? screenX - (bounds.Left + bounds.Width * 0.5f)
                    : screenX;
                _offsetY[i] = y;
            }
        }

        public void Dispose()
        {
            for (int i = 0; i < _labels.Length; i++)
                _labels[i]?.Dispose();
        }

        private bool NeedsReset(float step, string format, float unitScale, bool isTime, int minTickIndex, int maxTickIndex)
        {
            if (!_isValid || _count == 0) return true;
            if (!NearlyEqual(_lastStep, step, TickEpsilon(step))) return true;
            if (_lastFormat != format) return true;
            if (_lastUnitScale != unitScale) return true;
            if (_lastIsTime != isTime) return true;

            return minTickIndex > _tickIndices[_count - 1] + 1
                || maxTickIndex < _tickIndices[0] - 1;
        }

        private void Rebuild(int minTickIndex, int maxTickIndex, float step, string format, float unitScale, bool isTime)
        {
            _count = 0;

            for (int tickIndex = minTickIndex; tickIndex <= maxTickIndex && _count < _labels.Length; tickIndex++)
                AddBack(tickIndex, step, format, unitScale, isTime);
        }

        private void Advance(int minTickIndex, int maxTickIndex, float step, string format, float unitScale, bool isTime)
        {
            while (_count > 0 && _tickIndices[0] < minTickIndex)
                RemoveFront();

            while (_count > 0 && _tickIndices[_count - 1] > maxTickIndex)
                RemoveBack();

            if (_count == 0)
            {
                Rebuild(minTickIndex, maxTickIndex, step, format, unitScale, isTime);
                return;
            }

            int firstTickIndex = _tickIndices[0] - 1;
            while (firstTickIndex >= minTickIndex && _count < _labels.Length)
            {
                AddFront(firstTickIndex, step, format, unitScale, isTime);
                firstTickIndex--;
            }

            int tickIndex = _tickIndices[_count - 1] + 1;
            while (tickIndex <= maxTickIndex && _count < _labels.Length)
            {
                AddBack(tickIndex, step, format, unitScale, isTime);
                tickIndex++;
            }
        }

        private void RemoveFront()
        {
            TextBlock label = _labels[0];

            for (int i = 1; i < _count; i++)
            {
                int target = i - 1;
                _labels[target] = _labels[i];
                _tickIndices[target] = _tickIndices[i];
                _ticks[target] = _ticks[i];
                _offsetX[target] = _offsetX[i];
                _offsetY[target] = _offsetY[i];
            }

            _count--;
            _labels[_count] = label;
        }

        private void RemoveBack()
        {
            _count--;
        }

        private void AddFront(int tickIndex, float step, string format, float unitScale, bool isTime)
        {
            TextBlock label = _labels[_count];

            for (int i = _count; i > 0; i--)
            {
                _labels[i] = _labels[i - 1];
                _tickIndices[i] = _tickIndices[i - 1];
                _ticks[i] = _ticks[i - 1];
                _offsetX[i] = _offsetX[i - 1];
                _offsetY[i] = _offsetY[i - 1];
            }

            _labels[0] = label;
            SetLabel(0, tickIndex, step, format, unitScale, isTime);
            _count++;
        }

        private void AddBack(int tickIndex, float step, string format, float unitScale, bool isTime)
        {
            SetLabel(_count, tickIndex, step, format, unitScale, isTime);
            _count++;
        }

        private void SetLabel(int index, int tickIndex, float step, string format, float unitScale, bool isTime)
        {
            TextBlock label = _labels[index];
            float tick = TickFromIndex(tickIndex, step);
            _tickIndices[index] = tickIndex;
            _ticks[index] = tick;

            if (isTime)
                label.SetAsTime(tick, format);
            else
                label.SetValue(GetLabelValue(tick, unitScale), format);
        }

        private static float GetLabelValue(float tick, float unitScale)
        {
            if (!float.IsFinite(unitScale) || unitScale == 0.0f)
                return NormalizeLabelValue(tick);

            return NormalizeLabelValue(tick / unitScale);
        }

        private static float NormalizeLabelValue(float value)
        {
            if (value == 0.0f || Math.Abs(value) < 0.000001f) return 0.0f;
            return value;
        }

        private static int FirstTickIndex(float minValue, float step)
            => (int)MathF.Ceiling(minValue / step - TickIndexEpsilon);

        private static int LastTickIndex(float maxValue, float step)
            => (int)MathF.Floor(maxValue / step + TickIndexEpsilon);

        private static float TickFromIndex(int tickIndex, float step)
            => tickIndex * step;

        private static bool NearlyEqual(float a, float b, float epsilon)
            => Math.Abs(a - b) <= epsilon;

        private static float TickEpsilon(float step)
            => Math.Max(0.000001f, Math.Abs(step) * 0.0001f);

        private const float TickIndexEpsilon = 0.0001f;
    }
}
