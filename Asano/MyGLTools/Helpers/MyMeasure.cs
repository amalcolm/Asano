using Asano.MyGLTools.Fonts;

namespace Asano.MyGLTools.Helpers
{
    internal sealed class MyMeasure : MyTextLabel
    {
        public enum TextPlacementMode
        {
            CenterLine,
            BelowLine,
            AboveLine,
        }

        private const float TextGapPadding = 5.0f;
        private const float TextUnitGap = 3.0f;

        private readonly MyGLVertexBuffer _arrowBuffer = new(16);
        private          Vertex[] _vertices = new Vertex[16];
        private readonly MyColour _colour = Color.FromArgb(110, 210, 210, 210);

        private TextBlock? _unitsBlock;
        private TextBlock[] _textBlocks = [];

        private float _x1;
        private float _x2;
        private float _y;
        private double _value;
        private string _units = "ms";
        private float _textScaling = 0.4f;
        private float _requestedScale = 1.0f;
        private float _scale = 1.0f;

        public TextPlacementMode TextPlacement { get; set; } = TextPlacementMode.CenterLine;
        public float TextPaddingY { get; set; } = 2.0f;
        public bool Visible { get; set; } = true;
        public float MinScale { get; set; } = 0.25f;
        public float Scale
        {
            get => _requestedScale;
            set
            {
                _requestedScale = Math.Max(0.01f, value);
                SetScale(_requestedScale);
            }
        }

        public void Init()
        {
            _arrowBuffer.Init();
            CreateTextBlock("0", TextAlign.Right, "F3");
            _unitsBlock = new TextBlock(_units, 0.0f, 0.0f, null);
            ApplyTextScale();

            if (TextBlock != null)
                _textBlocks = [TextBlock, _unitsBlock];

            SetValue(_value, _units);
        }

        public override void Dispose()
        {
            base.Dispose();
            _unitsBlock?.Dispose();
            _arrowBuffer.Dispose();
        }

        public void SetRange(float x1, float x2, float y)
        {
            if (_x1 == x1 && _x2 == x2 && _y == y) return;

            _x1 = x1;
            _x2 = x2;
            _y = y;
        }

        public void SetValue(double value, string units)
        {
            _value = value;
            _units = units;

            TextBlock?.SetValue(value);
            _unitsBlock?.SetValue(units);
        }

        public void Render(Rectangle viewportRect, RectangleF outRect)
        {
            if (!Visible) return;
            if (viewportRect.Width <= 0 || viewportRect.Height <= 0 || outRect.Width <= 0.0f || outRect.Height <= 0.0f) return;

            BuildWorld(viewportRect, outRect);

            _arrowBuffer.DrawLines();
        }

        public void RenderOverlay(Rectangle viewportRect, RectangleF outRect)
        {
            if (!Visible) return;
            if (viewportRect.Width <= 0 || viewportRect.Height <= 0 || outRect.Width <= 0.0f || outRect.Height <= 0.0f) return;

            BuildScreen(viewportRect, outRect);

            _arrowBuffer.DrawLines();
        }

        public void RenderText(FontRenderer fontRenderer, Rectangle viewportRect, RectangleF outRect)
        {
            if (!Visible) return;
            if (TextBlock == null || _unitsBlock == null || _textBlocks.Length == 0) return;
            if (viewportRect.Width <= 0 || viewportRect.Height <= 0 || outRect.Width <= 0.0f || outRect.Height <= 0.0f) return;

            float centerX = WorldToScreenX((_x1 + _x2) * 0.5f, viewportRect, outRect);
            float lineY = WorldToScreenY(_y, viewportRect, outRect);

            _textScaling = fontRenderer.Scaling;
            PositionTextBlocks(centerX, lineY);

            fontRenderer.RenderText(_textBlocks, _textBlocks.Length);
        }

        private void BuildWorld(Rectangle viewportRect, RectangleF outRect)
        {
            float left = Math.Min(_x1, _x2);
            float right = Math.Max(_x1, _x2);
            float screenLeft = WorldToScreenX(left, viewportRect, outRect);
            float screenRight = WorldToScreenX(right, viewportRect, outRect);
            float screenY = WorldToScreenY(_y, viewportRect, outRect);
            float screenWidth = Math.Abs(screenRight - screenLeft);
            FitScaleToMeasure(screenWidth, (screenLeft + screenRight) * 0.5f, screenY);

            float worldPerPixelX = outRect.Width / Math.Max(1, viewportRect.Width);
            float worldPerPixelY = outRect.Height / Math.Max(1, viewportRect.Height);

            float headX = Math.Min(screenWidth * 0.04f, 7.0f) * worldPerPixelX * _scale;
            float headY = 5.0f * worldPerPixelY * _scale;
            float tickY = 7.0f * worldPerPixelY * _scale;
            RectangleF textBounds = GetTextBounds(
                (screenLeft + screenRight) * 0.5f,
                screenY);
            float gapLeft = Math.Clamp(ScreenToWorldX(textBounds.Left - ScaledTextGapPadding, viewportRect, outRect), left, right);
            float gapRight = Math.Clamp(ScreenToWorldX(textBounds.Right + ScaledTextGapPadding, viewportRect, outRect), left, right);
            float minSegment = worldPerPixelX * 0.5f;

            AddMeasureLines(left, right, _y, headX, headY, tickY, gapLeft, gapRight, minSegment);
        }

        private void BuildScreen(Rectangle viewportRect, RectangleF outRect)
        {
            float left = WorldToScreenX(Math.Min(_x1, _x2), viewportRect, outRect);
            float right = WorldToScreenX(Math.Max(_x1, _x2), viewportRect, outRect);
            float y = WorldToScreenY(_y, viewportRect, outRect);
            float width = Math.Max(0.000001f, right - left);
            FitScaleToMeasure(width, (left + right) * 0.5f, y);

            float headX = Math.Min(width * 0.04f, 7.0f) * _scale;
            float headY = 5.0f * _scale;
            float tickY = 7.0f * _scale;
            RectangleF textBounds = GetTextBounds((left + right) * 0.5f, y);
            float gapLeft = Math.Clamp(textBounds.Left - ScaledTextGapPadding, left, right);
            float gapRight = Math.Clamp(textBounds.Right + ScaledTextGapPadding, left, right);

            AddMeasureLines(left, right, y, headX, headY, tickY, gapLeft, gapRight, 0.5f);
        }

        private void AddMeasureLines(float left, float right, float y, float headX, float headY, float tickY, float gapLeft, float gapRight, float minSegment)
        {
            int count = 0;

            if (gapLeft - left > minSegment)
                AddLine(ref count, left, y, gapLeft, y);

            if (right - gapRight > minSegment)
                AddLine(ref count, gapRight, y, right, y);

            AddLine(ref count, left , y        , left + headX , y + headY);
            AddLine(ref count, left , y        , left + headX , y - headY);
            AddLine(ref count, right, y        , right - headX, y + headY);
            AddLine(ref count, right, y        , right - headX, y - headY);
            AddLine(ref count, left , y - tickY, left         , y + tickY);
            AddLine(ref count, right, y - tickY, right        , y + tickY);

            _arrowBuffer.Set(ref _vertices, count);
        }

        private RectangleF GetTextBounds(float centerX, float lineY)
        {
            if (TextBlock == null || _unitsBlock == null) return RectangleF.Empty;

            PositionTextBlocks(centerX, lineY);
            return GetCurrentTextBounds();
        }

        private void PositionTextBlocks(float centerX, float lineY)
        {
            if (TextBlock == null || _unitsBlock == null) return;

            SetTextPosition(centerX - ScaledTextUnitGap, lineY);
            _unitsBlock.X = centerX + ScaledTextUnitGap;
            _unitsBlock.Y = lineY;

            RectangleF bounds = GetCurrentTextBounds();
            float deltaX = centerX - (bounds.Left + bounds.Right) * 0.5f;
            if (Math.Abs(deltaX) > 0.001f)
            {
                TextBlock.X += deltaX;
                _unitsBlock.X += deltaX;
                bounds = GetCurrentTextBounds();
            }

            float deltaY = TextPlacement switch
            {
                TextPlacementMode.AboveLine => lineY + TextPaddingY - bounds.Bottom,
                TextPlacementMode.BelowLine => lineY - TextPaddingY - bounds.Top,
                _ => lineY - (bounds.Top + bounds.Bottom) * 0.5f,
            };

            if (Math.Abs(deltaY) <= 0.001f) return;

            TextBlock.Y += deltaY;
            _unitsBlock.Y += deltaY;
            _ = GetCurrentTextBounds();
        }

        private RectangleF GetCurrentTextBounds()
        {
            if (TextBlock == null || _unitsBlock == null) return RectangleF.Empty;

            _ = TextBlock.GetVertices(_textScaling);
            _ = _unitsBlock.GetVertices(_textScaling);

            return RectangleF.Union(TextBlock.Bounds, _unitsBlock.Bounds);
        }

        private void FitScaleToMeasure(float measureWidth, float centerX, float lineY)
        {
            if (TextBlock == null || _unitsBlock == null) return;
            if (!float.IsFinite(measureWidth) || measureWidth <= 0.0f) return;

            SetScale(_requestedScale);
            PositionTextBlocks(centerX, lineY);
            RectangleF bounds = GetCurrentTextBounds();

            float guidedWidth = bounds.Width + 2.0f * bounds.Height;
            if (!float.IsFinite(guidedWidth) || guidedWidth <= 0.0f) return;
            if (guidedWidth <= measureWidth) return;

            SetScale(Math.Max(MinScale, _requestedScale * measureWidth / guidedWidth));
        }

        private void SetScale(float scale)
        {
            _scale = Math.Max(0.01f, scale);
            ApplyTextScale();
        }

        private void ApplyTextScale()
        {
            if (TextBlock != null)
                TextBlock.Scale = _scale;

            if (_unitsBlock != null)
                _unitsBlock.Scale = _scale;
        }

        private void AddLine(ref int count, float x1, float y1, float x2, float y2)
        {
            _vertices[count++] = new Vertex(x1, y1, 0.0f, _colour);
            _vertices[count++] = new Vertex(x2, y2, 0.0f, _colour);
        }

        private static float WorldToScreenX(float x, Rectangle viewportRect, RectangleF outRect)
            => viewportRect.Left + (x - outRect.Left) * viewportRect.Width / outRect.Width;

        private static float WorldToScreenY(float y, Rectangle viewportRect, RectangleF outRect)
            => viewportRect.Top + (y - outRect.Top) * viewportRect.Height / outRect.Height;

        private static float ScreenToWorldX(float x, Rectangle viewportRect, RectangleF outRect)
            => outRect.Left + (x - viewportRect.Left) * outRect.Width / viewportRect.Width;

        private float ScaledTextGapPadding => TextGapPadding * _scale;
        private float ScaledTextUnitGap => TextUnitGap * _scale;
    }
}
