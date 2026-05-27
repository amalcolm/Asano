namespace Asano.MyGLTools.Fonts
{
    /// <summary>
    /// Holds the rendering data for a single character in the font atlas.
    /// </summary>
    public struct FontChar
    {
        public int   ID         { get; set; }
        public int   X          { get; set; }
        public int   Y          { get; set; }
        public int   Width      { get; set; }
        public float Height     { get; set; }
        public float XOffset    { get; set; }
        public float YOffset    { get; set; }
        public float XAdvance   { get; set; }
    }
}
