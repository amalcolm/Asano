using System.Text.Json.Serialization;

namespace Asano.MyGLTools.Fonts.Json
{
    // This file contains the class structure that directly maps to the JSON format
    // from the aframe-fonts repository. These classes are used by System.Text.Json
    // for deserialization.

    public class JsonFontFile
    {
        [JsonPropertyName("pages")]        public List<string> Pages { get; set; } = [];
        [JsonPropertyName("chars")]        public List<JsonChar> Chars { get; set; } = [];
        [JsonPropertyName("info")]         public JsonInfo? Info { get; set; }
        [JsonPropertyName("common")]       public JsonCommon? Common { get; set; }
        [JsonPropertyName("kernings")]     public List<JsonKerning> Kernings { get; set; } = [];
    }

    public class JsonChar
    {
        [JsonPropertyName("id")]           public int Id { get; set; }
        [JsonPropertyName("width")]        public int Width { get; set; }
        [JsonPropertyName("height")]       public int Height { get; set; }
        [JsonPropertyName("xoffset")]      public float XOffset { get; set; }
        [JsonPropertyName("yoffset")]      public float YOffset { get; set; }
        [JsonPropertyName("xadvance")]     public float XAdvance { get; set; }
        [JsonPropertyName("chnl")]         public int Chnl { get; set; }
        [JsonPropertyName("x")]            public int X { get; set; }
        [JsonPropertyName("y")]            public int Y { get; set; }
        [JsonPropertyName("page")]         public int Page { get; set; }
    }

    public class JsonInfo
    {
        [JsonPropertyName("face")]         public string Face { get; set; } = string.Empty;
        [JsonPropertyName("size")]         public int Size { get; set; }
    }

    public class JsonCommon
    {
        [JsonPropertyName("lineHeight")]   public float LineHeight { get; set; }
        [JsonPropertyName("base")]         public float Base { get; set; }
        [JsonPropertyName("scaleW")]       public int ScaleW { get; set; }
        [JsonPropertyName("scaleH")]       public int ScaleH { get; set; }
        [JsonPropertyName("pages")]        public int Pages { get; set; }
    }

    public class JsonKerning
    {
        [JsonPropertyName("first")]        public int First { get; set; }
        [JsonPropertyName("second")]       public int Second { get; set; }
        [JsonPropertyName("amount")]       public float Amount { get; set; }
    }
}

