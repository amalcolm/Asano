using OpenTK.Graphics.OpenGL4;
using OpenTK.Mathematics;
using Asano.MyGLTools.UserControls;
using StbImageSharp;

using Asano.MyGLTools.Helpers;
namespace Asano.MyGLTools.Backgrounds
{
    internal class LabelAreaRenderer
    {
        private int _bgVao, _bgVbo, _bgTextureId, _bgShaderProgram;

        public bool FillBackground { get; set; } = false;

        MyGLControl myGL;
        public LabelAreaRenderer(MyGLControl myGL, string texturePath = "Resources/Backgrounds/LabelArea.jpg")
        {
            this.myGL = myGL;
            myGL.Setup(() => InitBackground(texturePath));
        }

        private void InitBackground(string texturePath)
        {
            _bgShaderProgram = ShaderManager.Get("back");
            _bgVao = GL.GenVertexArray();
            _bgVbo = GL.GenBuffer();

            GL.BindVertexArray(_bgVao);
            GL.BindBuffer(BufferTarget.ArrayBuffer, _bgVbo);
            GL.BufferData(BufferTarget.ArrayBuffer, sizeof(float) * 16, IntPtr.Zero, BufferUsageHint.DynamicDraw);

            GL.EnableVertexAttribArray(0);
            GL.VertexAttribPointer(0, 2, VertexAttribPointerType.Float, false, sizeof(float) * 4, 0);
            GL.EnableVertexAttribArray(1);
            GL.VertexAttribPointer(1, 2, VertexAttribPointerType.Float, false, sizeof(float) * 4, sizeof(float) * 2);

            GL.BindVertexArray(0);
            _bgTextureId = LoadTexture(texturePath);
        }

        public void Render(RectangleF bounds, Matrix4 projection, MyColour colour)
        {
            if (_bgVbo == 0 || bounds.IsEmpty) return;

            // Activate the background shader
            GL.UseProgram(_bgShaderProgram);

            GL.BindVertexArray(_bgVao);
            GL.ActiveTexture(TextureUnit.Texture0);
            GL.BindTexture(TextureTarget.Texture2D, _bgTextureId);

            GL.UniformMatrix4(GL.GetUniformLocation(_bgShaderProgram, "uTransform"), false, ref projection);
            GL.Uniform1(GL.GetUniformLocation(_bgShaderProgram, "uTexture"), 0);
            GL.Uniform4(GL.GetUniformLocation(_bgShaderProgram, "uColor"), colour.r, colour.g, colour.b, colour.a);

            UpdateBackgroundVertices(bounds);
            GL.DrawArrays(PrimitiveType.TriangleStrip, 0, 4);

            // Clean up state
            GL.BindVertexArray(0);
        }

        private readonly float[] vertices =
        [
            0,0,  0.0f, 1.0f,
            0,0,  0.0f, 0.0f,
            0,0,  1.0f, 1.0f,
            0,0,  1.0f, 0.0f,
        ];

        RectangleF _lastBounds = RectangleF.Empty;
        private void UpdateBackgroundVertices(RectangleF bounds)
        {
            if (bounds == _lastBounds) return;
            _lastBounds = bounds;
            if (FillBackground) bounds = new RectangleF(0, 0, myGL.ClientSize.Width-8, myGL.ClientSize.Height-8);
            vertices[ 0] = bounds.Left;  vertices[ 1] = bounds.Bottom;
            vertices[ 4] = bounds.Left;  vertices[ 5] = bounds.Top;
            vertices[ 8] = bounds.Right; vertices[ 9] = bounds.Bottom;
            vertices[12] = bounds.Right; vertices[13] = bounds.Top;


            GL.BindBuffer(BufferTarget.ArrayBuffer, _bgVbo);
            GL.BufferSubData(BufferTarget.ArrayBuffer, IntPtr.Zero, vertices.Length * sizeof(float), vertices);
        }

        private static int LoadTexture(string filePath)
        {
            if (!File.Exists(filePath))
            {
                int handle = GL.GenTexture();
                GL.BindTexture(TextureTarget.Texture2D, handle);
                byte[] data = [255, 255, 255, 128];
                GL.TexImage2D(TextureTarget.Texture2D, 0, PixelInternalFormat.Rgba, 1, 1, 0, PixelFormat.Rgba, PixelType.UnsignedByte, data);
                return handle;
            }

            int textureHandle = GL.GenTexture();

            GL.ActiveTexture(TextureUnit.Texture0);
            GL.BindTexture(TextureTarget.Texture2D, textureHandle);

            GL.PixelStore(PixelStoreParameter.UnpackAlignment, 1);

            using (Stream stream = File.OpenRead(filePath))
            {
                ImageResult image = ImageResult.FromStream(stream, ColorComponents.RedGreenBlueAlpha);

                GL.TexImage2D(
                    TextureTarget.Texture2D,
                    0,
                    PixelInternalFormat.Rgba,
                    image.Width,
                    image.Height,
                    0,
                    PixelFormat.Rgba,
                    PixelType.UnsignedByte,
                    image.Data
                );
            }

            GL.TexParameter(TextureTarget.Texture2D, TextureParameterName.TextureMinFilter, (int)TextureMinFilter.Linear);
            GL.TexParameter(TextureTarget.Texture2D, TextureParameterName.TextureMagFilter, (int)TextureMagFilter.Linear);

            GL.TexParameter(TextureTarget.Texture2D, TextureParameterName.TextureWrapS, (int)TextureWrapMode.ClampToEdge);
            GL.TexParameter(TextureTarget.Texture2D, TextureParameterName.TextureWrapT, (int)TextureWrapMode.ClampToEdge); 
            return textureHandle;
        }

        public void Shutdown()
        {
            GL.DeleteBuffer(_bgVbo);
            GL.DeleteVertexArray(_bgVao);
            GL.DeleteTexture(_bgTextureId);
        }
    }
}