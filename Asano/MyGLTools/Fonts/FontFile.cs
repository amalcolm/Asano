using OpenTK.Graphics.OpenGL4;

namespace Asano.MyGLTools.Fonts
{

    /// <summary>
    /// Represents a parsed .fnt file, containing all character and metric data.
    /// </summary>
    public class FontFile
    {
        public static FontFile Default { get; set; } = default!;  // Need to always instantiate this before use!  (Done in MyGLControl)

        public string Face          { get; private set; } = string.Empty;
        public int    Size          { get; private set; }
        public float  LineHeight    { get; private set; }
        public float  Base          { get; private set; }
        public int    TextureWidth  { get; private set; }
        public int    TextureHeight { get; private set; }
        public string TextureFile   { get; private set; } = string.Empty;
        public int    TextureId     { get;         set; } = -1;


        public Dictionary<int, FontChar> Chars { get; } = [];
        public Dictionary<(int, int), float> Kernings { get; } = [];

        internal FontFile() { }

        internal void SetInfo(string face, int size)
        {
            Face = face;
            Size = size;

            if (string.Equals(face, "Roboto Medium", StringComparison.OrdinalIgnoreCase))   
                Default = this;
        }

        internal void SetCommon(float lineHeight, float baseHeight, int textureWidth, int textureHeight)
        {
            LineHeight    = lineHeight;
            Base          = baseHeight;
            TextureWidth  = textureWidth;
            TextureHeight = textureHeight;
        }

        internal void SetPage(string textureFile)
            => TextureFile = textureFile;

        /// <summary>
        /// Gets the kerning adjustment between two characters.
        /// </summary>
        public float GetKerning(char first, char second) 
            => Kernings.TryGetValue(((int)first, (int)second), out var amount) ? amount : 0;

        /// <summary>
        /// Calculates the rendered width of a string in pixels based on the font's metrics.
        /// </summary>
        public float MeasureString(string text)
        {
            if (string.IsNullOrEmpty(text)) return 0;

            float width = 0;
            for (int i = 0; i < text.Length; i++)
                if (Chars.TryGetValue(text[i], out FontChar fc))
                {
                    width += fc.XAdvance;
    
                    if (i < text.Length - 1)
                        width += GetKerning(text[i], text[i + 1]);
                }

            return width;
        }
    }
}
