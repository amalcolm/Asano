using OpenTK.Mathematics;
namespace Asano.MyGLTools.Fonts
{
    public struct FontVertex
    {
        public const int tabSize = 240;

        public Vector2 Position; // The (X, Y) position on the screen
        public Vector2 TexCoord; // The (U, V) coordinate on the font atlas texture

        public static int BuildString(FontVertex[] vertices, int startIndex, ReadOnlySpan<char> text, FontFile font, float startX, float startY, float scaling = 1.0f, TextAlign textAlign = TextAlign.Right)
        {
            if (text.IsEmpty) return 0;

            var cursor = new Vector2(startX, startY);
            float texWidth = font.TextureWidth;
            float texHeight = font.TextureHeight;
            int vertexCount = 0;

            // Ensure we don't write past the end of the array
            int maxChars = (vertices.Length - startIndex) / 6;
            var textSegment = text.Length > maxChars ? text[..maxChars] : text;

            if (textAlign == TextAlign.Left)
            {
                for (int i = 0; i < textSegment.Length; i++)
                {
                    char c = textSegment[i];
                    switch (c)
                    {
                        case '\n':
                            cursor.X = startX;
                            cursor.Y -= font.LineHeight * scaling * 1.2f;
                            break;
                        case '\t':
                            int tabs = (int)((cursor.X - startX) / (tabSize * scaling)) + 1;
                            cursor.X = startX + tabs * tabSize * scaling;
                            break;

                        default:
                            if (!font.Chars.TryGetValue(c, out FontChar fc)) continue;
                            if (i > 0) cursor.X += font.GetKerning(textSegment[i - 1], c) * scaling;
                            BuildChar(vertices, startIndex + vertexCount, fc, cursor, scaling, font, texWidth, texHeight);
                            cursor.X += fc.XAdvance * scaling;
                            vertexCount += 6;
                            break;
                    }
                } 
            }
            else
            {
                for (int i = textSegment.Length - 1; i >= 0; i--)
                {
                    char c = textSegment[i];
                    switch (c)
                    {
                        case '\n':
                            cursor.X = startX;
                            cursor.Y -= font.LineHeight * scaling * 1.2f;
                            break;
                        case '\t':
                            int tabs = (int)((cursor.X - startX) / (tabSize * scaling)) + 1;
                            cursor.X = startX - tabs * tabSize * scaling;
                            break;

                        default:
                            if (!font.Chars.TryGetValue(textSegment[i], out FontChar fc)) continue;
                            cursor.X -= fc.XAdvance * scaling;
                            if (i > 0) cursor.X += font.GetKerning(textSegment[i - 1], textSegment[i]) * scaling;
                            BuildChar(vertices, startIndex + vertexCount, fc, cursor, scaling, font, texWidth, texHeight);
                            vertexCount += 6;
                            break;
                    }
                }
            }
            return vertexCount; 
        }

        private static void BuildChar(FontVertex[] vertices, int index, FontChar fontChar, Vector2 cursor, float scaling, FontFile font, float texWidth, float texHeight)
        {
            float x_pos = cursor.X + scaling * fontChar.XOffset;
            float y_pos = cursor.Y - scaling * (fontChar.YOffset - font.Base + fontChar.Height);
            float width = fontChar.Width * scaling;
            float height = fontChar.Height * scaling;

            float u1 = fontChar.X / texWidth;
            float v1 = fontChar.Y / texHeight;
            float u2 = (fontChar.X + fontChar.Width) / texWidth;
            float v2 = (fontChar.Y + fontChar.Height) / texHeight;

            vertices[index + 0] = new FontVertex { Position = new Vector2(x_pos        , y_pos + height), TexCoord = new Vector2(u1, v1) };
            vertices[index + 1] = new FontVertex { Position = new Vector2(x_pos + width, y_pos         ), TexCoord = new Vector2(u2, v2) };
            vertices[index + 2] = new FontVertex { Position = new Vector2(x_pos        , y_pos         ), TexCoord = new Vector2(u1, v2) };
            vertices[index + 3] = new FontVertex { Position = new Vector2(x_pos        , y_pos + height), TexCoord = new Vector2(u1, v1) };
            vertices[index + 5] = new FontVertex { Position = new Vector2(x_pos + width, y_pos         ), TexCoord = new Vector2(u2, v2) };
            vertices[index + 4] = new FontVertex { Position = new Vector2(x_pos + width, y_pos + height), TexCoord = new Vector2(u2, v1) };
        }


        public static int BuildString(FontVertex[] vertices, int startIndex, string text, FontFile font, float startX, float startY, float scaling = 1.0f, TextAlign textAlign = TextAlign.Right)
            => BuildString(vertices, startIndex, text.AsSpan(), font, startX, startY, scaling, textAlign);
    }
}
