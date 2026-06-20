using System.Drawing;
using Asano.MyGLTools.Fonts;

namespace Asano.MyGLTools.Helpers
{
    internal sealed class MyLabelCache : IDisposable
    {
        private const int PreallocatedCharsPerLabel = 24;
        private const int MaxSharedLabelsPerCache = 512;
        private const int SharedLabelTrimTarget = 384;

        private static readonly object _sharedCachesLock = new();
        private static readonly Dictionary<CacheKey, SharedCache> _sharedCaches = [];
        private static int _activeCacheUsers;

        private readonly TextBlock[] _labels;
        private readonly int[] _tickIndices;
        private readonly float[] _ticks;
        private readonly float[] _offsetX;
        private readonly float[] _offsetY;
        private readonly FontFile _font;

        private int _count;
        private bool _isValid;
        private CacheKey _lastKey;
        private bool _disposed;

        public MyLabelCache(int capacity, FontFile? font, string format)
        {
            _labels = new TextBlock[capacity];
            _tickIndices = new int[capacity];
            _ticks = new float[capacity];
            _offsetX = new float[capacity];
            _offsetY = new float[capacity];
            _font = font ?? FontFile.Default;

            lock (_sharedCachesLock)
                _activeCacheUsers++;
        }

        public int Count => _count;
        public TextBlock[] Labels => _labels;
        public float[] OffsetX => _offsetX;
        public float[] OffsetY => _offsetY;

        public void Clear()
        {
            Array.Clear(_labels, 0, _count);
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

            CacheKey key = CreateKey(step, format, unitScale, isTime);
            SharedCache sharedCache = GetOrCreateSharedCache(key, step, format, unitScale, isTime);

            if (NeedsReset(key, minTickIndex, maxTickIndex))
                Rebuild(minTickIndex, maxTickIndex, sharedCache);
            else
                Advance(minTickIndex, maxTickIndex, sharedCache);

            _lastKey = key;
            _isValid = true;
        }

        public void UpdateScreenPositions(RectangleF viewPort, Size displaySize, float scaling, float y, float xOffset)
        {
            for (int i = 0; i < _count; i++)
            {
                TextBlock label = _labels[i];

                RectangleF bounds;
                lock (label)
                {
                    label.GetVertices(scaling);
                    bounds = label.Bounds;
                }

                float screenX = (_ticks[i] - viewPort.Left) * displaySize.Width / viewPort.Width + xOffset;
                _offsetX[i] = bounds.Width > 0.0f
                    ? screenX - (bounds.Left + bounds.Width * 0.5f)
                    : screenX;
                _offsetY[i] = y;
            }
        }

        public void Dispose()
        {
            if (_disposed) return;

            Clear();
            _disposed = true;

            lock (_sharedCachesLock)
            {
                _activeCacheUsers--;
                if (_activeCacheUsers <= 0)
                {
                    foreach (SharedCache cache in _sharedCaches.Values)
                        cache.Dispose();

                    _sharedCaches.Clear();
                    _activeCacheUsers = 0;
                }
            }
        }

        private bool NeedsReset(CacheKey key, int minTickIndex, int maxTickIndex)
        {
            if (!_isValid || _count == 0) return true;
            if (!_lastKey.Equals(key)) return true;

            return minTickIndex > _tickIndices[_count - 1] + 1
                || maxTickIndex < _tickIndices[0] - 1;
        }

        private void Rebuild(int minTickIndex, int maxTickIndex, SharedCache sharedCache)
        {
            Array.Clear(_labels, 0, _count);
            _count = 0;

            for (int tickIndex = minTickIndex; tickIndex <= maxTickIndex && _count < _labels.Length; tickIndex++)
                AddBack(tickIndex, sharedCache);
        }

        private void Advance(int minTickIndex, int maxTickIndex, SharedCache sharedCache)
        {
            while (_count > 0 && _tickIndices[0] < minTickIndex)
                RemoveFront();

            while (_count > 0 && _tickIndices[_count - 1] > maxTickIndex)
                RemoveBack();

            if (_count == 0)
            {
                Rebuild(minTickIndex, maxTickIndex, sharedCache);
                return;
            }

            int firstTickIndex = _tickIndices[0] - 1;
            while (firstTickIndex >= minTickIndex && _count < _labels.Length)
            {
                AddFront(firstTickIndex, sharedCache);
                firstTickIndex--;
            }

            int tickIndex = _tickIndices[_count - 1] + 1;
            while (tickIndex <= maxTickIndex && _count < _labels.Length)
            {
                AddBack(tickIndex, sharedCache);
                tickIndex++;
            }
        }

        private void RemoveFront()
        {
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
            _labels[_count] = null!;
        }

        private void RemoveBack()
        {
            _count--;
            _labels[_count] = null!;
        }

        private void AddFront(int tickIndex, SharedCache sharedCache)
        {
            for (int i = _count; i > 0; i--)
            {
                _labels[i] = _labels[i - 1];
                _tickIndices[i] = _tickIndices[i - 1];
                _ticks[i] = _ticks[i - 1];
                _offsetX[i] = _offsetX[i - 1];
                _offsetY[i] = _offsetY[i - 1];
            }

            SetLabel(0, tickIndex, sharedCache);
            _count++;
        }

        private void AddBack(int tickIndex, SharedCache sharedCache)
        {
            SetLabel(_count, tickIndex, sharedCache);
            _count++;
        }

        private void SetLabel(int index, int tickIndex, SharedCache sharedCache)
        {
            CacheEntry entry = sharedCache.GetLabel(tickIndex);
            _tickIndices[index] = tickIndex;
            _ticks[index] = entry.Tick;
            _labels[index] = entry.Label;
        }

        private CacheKey CreateKey(float step, string format, float unitScale, bool isTime)
        {
            float keyUnitScale = float.IsFinite(unitScale) ? unitScale : 0.0f;

            return new CacheKey(
                _font.Face,
                _font.Size,
                _font.TextureFile,
                step,
                format,
                keyUnitScale,
                isTime);
        }

        private SharedCache GetOrCreateSharedCache(CacheKey key, float step, string format, float unitScale, bool isTime)
        {
            lock (_sharedCachesLock)
            {
                if (_sharedCaches.TryGetValue(key, out SharedCache? cache))
                    return cache;

                cache = new SharedCache(_font, step, format, unitScale, isTime);
                _sharedCaches[key] = cache;
                return cache;
            }
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

        private const float TickIndexEpsilon = 0.0001f;

        private readonly record struct CacheKey(
            string FontFace,
            int FontSize,
            string TextureFile,
            float Step,
            string Format,
            float UnitScale,
            bool IsTime);

        private sealed class CacheEntry(TextBlock label, float tick)
        {
            public TextBlock Label { get; } = label;
            public float Tick { get; } = tick;
            public long LastUsed { get; set; }
        }

        private sealed class SharedCache(FontFile font, float step, string format, float unitScale, bool isTime) : IDisposable
        {
            private readonly object _lock = new();
            private readonly Dictionary<int, CacheEntry> _labels = [];
            private long _useSerial;

            public CacheEntry GetLabel(int tickIndex)
            {
                lock (_lock)
                {
                    if (!_labels.TryGetValue(tickIndex, out CacheEntry? entry))
                    {
                        entry = CreateLabel(tickIndex);
                        entry.LastUsed = ++_useSerial;
                        _labels[tickIndex] = entry;
                        TrimIfNeeded();
                        return entry;
                    }

                    entry.LastUsed = ++_useSerial;
                    return entry;
                }
            }

            public void Dispose()
            {
                lock (_lock)
                {
                    foreach (CacheEntry entry in _labels.Values)
                        entry.Label.Dispose();

                    _labels.Clear();
                }
            }

            private CacheEntry CreateLabel(int tickIndex)
            {
                float tick = TickFromIndex(tickIndex, step);
                TextBlock label = new(string.Empty, 0.0f, 0.0f, font, TextAlign.Left, format);
                label.EnsureVertexCapacity(PreallocatedCharsPerLabel);

                if (isTime)
                    label.SetAsTime(tick, format);
                else
                    label.SetValue(GetLabelValue(tick, unitScale), format);

                return new CacheEntry(label, tick);
            }

            private void TrimIfNeeded()
            {
                if (_labels.Count <= MaxSharedLabelsPerCache) return;

                int removeCount = _labels.Count - SharedLabelTrimTarget;
                if (removeCount <= 0) return;

                foreach (int tickIndex in _labels
                    .OrderBy(pair => pair.Value.LastUsed)
                    .Take(removeCount)
                    .Select(pair => pair.Key)
                    .ToArray())
                {
                    _labels.Remove(tickIndex);
                }
            }
        }
    }
}
