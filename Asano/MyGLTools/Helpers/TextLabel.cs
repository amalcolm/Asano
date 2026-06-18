using Asano.MyGLTools.Fonts;

namespace Asano.MyGLTools.Helpers
{
    internal abstract class TextLabel : IDisposable
    {
        protected TextBlock? TextBlock { get; private set; }

        protected void CreateTextBlock(ReadOnlySpan<char> text, TextAlign align = TextAlign.Left, string valueFormat = "F2")
        {
            TextBlock?.Dispose();
            TextBlock = new TextBlock(text, 0.0f, 0.0f, null, align, valueFormat);
        }

        protected void SetTextPosition(float x, float y)
        {
            if (TextBlock == null) return;

            TextBlock.X = x;
            TextBlock.Y = y;
        }

        public virtual void Dispose()
        {
            TextBlock?.Dispose();
            TextBlock = null;
        }
    }
}
