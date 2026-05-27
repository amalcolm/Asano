using OpenTK.Graphics.OpenGL4;
using StbImageSharp;

namespace Asano.MyGLTools.Fonts
{
    using System.Runtime.InteropServices;
    using System.Text.Json;
    using System.Text.RegularExpressions;
    using Asano.MyGLTools.Fonts.Json;

    public static partial class FontLoader
    {
        public static FontFile Load(string filePath)
        {
            if (!filePath.Contains('\\')) filePath = $@"Resources\Fonts\{filePath}";

            var ext = Path.GetExtension(filePath).ToLowerInvariant();
            return ext switch
            {
                ".fnt"  => LoadFNT (filePath),
                ".json" => LoadJson(filePath),
                _ => throw new NotSupportedException($"Unsupported font file format: {ext}")
            };
        }

        public static FontFile LoadJson(string filePath)
        {
            using var fs = File.OpenRead(filePath);
            var jsonFontFile = JsonSerializer.Deserialize<JsonFontFile>(fs);

            if (jsonFontFile == null || jsonFontFile.Info == null || jsonFontFile.Common == null)
                throw new InvalidDataException("JSON font file is missing required sections (info, common).");

            var fontFile = new FontFile();

            fontFile.SetInfo(jsonFontFile.Info.Face, jsonFontFile.Info.Size);
            fontFile.SetCommon(jsonFontFile.Common.LineHeight, jsonFontFile.Common.Base, jsonFontFile.Common.ScaleW, jsonFontFile.Common.ScaleH);

            if (jsonFontFile.Pages.Count > 0)
            {
                var textureFileName = jsonFontFile.Pages[0];
                fontFile.SetPage(textureFileName);

                string? directory = Path.GetDirectoryName(filePath);
                string texturePath = Path.Combine(directory ?? "", textureFileName);
                fontFile.TextureId = LoadTexture(texturePath);
            }

            Span<JsonChar> charSpan = CollectionsMarshal.AsSpan(jsonFontFile.Chars);
            foreach (ref var jsonChar in charSpan)
            {
                var fontChar = new FontChar
                {
                    ID       = jsonChar.Id,
                    X        = jsonChar.X,
                    Y        = jsonChar.Y,
                    Width    = jsonChar.Width,
                    Height   = jsonChar.Height,
                    XOffset  = jsonChar.XOffset,
                    YOffset  = jsonChar.YOffset,
                    XAdvance = jsonChar.XAdvance
                };
                fontFile.Chars[fontChar.ID] = fontChar;
            }

            Span<JsonKerning> kerningSpan = CollectionsMarshal.AsSpan(jsonFontFile.Kernings);
            foreach (ref var jsonKerning in kerningSpan)
                fontFile.Kernings[(jsonKerning.First, jsonKerning.Second)] = jsonKerning.Amount;

            return fontFile;
        }

        public static FontFile LoadFNT(string filePath)
        { 
            var fontFile = new FontFile();
            var lines = File.ReadLines(filePath);

            foreach (var line in lines)
            {
                var parts = SplitLine(line);
                if (parts.Length < 1) continue;

                var values = ParseValues(parts);

                switch (parts[0])
                {
                    case "info":
                        fontFile.SetInfo(values["face"].Trim('"'), int.Parse(values["size"]));
                        break;

                    case "common":
                        fontFile.SetCommon(
                            int.Parse(values["lineHeight"]),
                            int.Parse(values["base"      ]),
                            int.Parse(values["scaleW"    ]),
                            int.Parse(values["scaleH"    ])
                        );
                        break;

                    case "page":
                        fontFile.SetPage(values["file"].Trim('"'));
                        string? directory = Path.GetDirectoryName(filePath);
                        string filename = Path.GetFileNameWithoutExtension(filePath);
                        string texturePath = Path.Combine(directory ?? "", $"{filename}.png");

                        int textureId = LoadTexture(texturePath);
                        fontFile.TextureId = textureId;
                        break;

                    case "char":
                        var fontChar = new FontChar
                        {
                            ID       = int.Parse(values["id"      ]),
                            X        = int.Parse(values["x"       ]),
                            Y        = int.Parse(values["y"       ]),
                            Width    = int.Parse(values["width"   ]),
                            Height   = int.Parse(values["height"  ]),
                            XOffset  = int.Parse(values["xoffset" ]),
                            YOffset  = int.Parse(values["yoffset" ]),
                            XAdvance = int.Parse(values["xadvance"])
                        };
                        fontFile.Chars[fontChar.ID] = fontChar;
                        break;

                    case "kerning":
                        fontFile.Kernings[(int.Parse(values["first"]), int.Parse(values["second"]))] = int.Parse(values["amount"]);
                        break;
                }
            }
            return fontFile;
        }

        private static string[] SplitLine(string line) 
            => [.. SplitRegex().Matches(line).Cast<Match>().Select(m => m.Value)];
        [GeneratedRegex("[^\\s\"']+|\"([^\"]*)\"|'([^']*)'")] private static partial Regex SplitRegex();


        private static Dictionary<string, string> ParseValues(string[] parts)
        {
            var values = new Dictionary<string, string>();
            for (int i = 1; i < parts.Length; i++)
            {
                var pair = parts[i].Split(['='], 2);
                if (pair.Length == 2)
                    values[pair[0]] = pair[1];
            }
            return values;
        }


        private static int LoadTexture(string filePath)
        {
            if (!File.Exists(filePath))
                throw new FileNotFoundException("Font texture not found.", filePath);

            int handle = GL.GenTexture();
            GL.BindTexture(TextureTarget.Texture2D, handle);

            // Load the image and get a pointer to the raw data
            using (Stream stream = File.OpenRead(filePath))
            {
                ImageResult image = ImageResult.FromStream(stream, ColorComponents.RedGreenBlueAlpha);

                // Upload the pixel data to the texture
                GL.TexImage2D(
                    TextureTarget.Texture2D,
                    0,
                    PixelInternalFormat.Rgba,
                    image.Width,
                    image.Height,
                    0,
                    PixelFormat.Rgba,
                    PixelType.UnsignedByte,
                    image.Data);
            }
   
            GL.TexParameter(TextureTarget.Texture2D, TextureParameterName.TextureWrapS, (int)TextureWrapMode.ClampToEdge);
            GL.TexParameter(TextureTarget.Texture2D, TextureParameterName.TextureWrapT, (int)TextureWrapMode.ClampToEdge);
            GL.TexParameter(TextureTarget.Texture2D, TextureParameterName.TextureMinFilter, (int)TextureMinFilter.Linear);
            GL.TexParameter(TextureTarget.Texture2D, TextureParameterName.TextureMagFilter, (int)TextureMagFilter.Linear);

            return handle;
        }

    }

}
