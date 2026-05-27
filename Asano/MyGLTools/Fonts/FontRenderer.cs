using OpenTK.Graphics.OpenGL4;
using OpenTK.Mathematics;
using System.Runtime.InteropServices;

namespace Asano.MyGLTools.Fonts
{
    
    public class FontRenderer
    {
        public float Scaling { get; set; } = 0.4f;

        private int _vbo;
        private int _vao;
        private int _bufferSize = 0; // Current size of the VBO in _vertices

        public FontFile Font { get; set; } = default!;

        public Matrix4 ProjectionMatrix { get; set; } = Matrix4.Identity;
        public Matrix4 ModelMatrix      { get; set; } = Matrix4.Identity;


        private FontVertex[] _vertices = [];
        private int _currentVertexCount = 0;
        public void Init()
        {
            _vertices = new FontVertex[1024]; // Initial capacity for ~170 characters

            _vao = GL.GenVertexArray();
            _vbo = GL.GenBuffer();

            GL.BindVertexArray(_vao);
            GL.BindBuffer(BufferTarget.ArrayBuffer, _vbo);

            // Configure the vertex attributes for FontVertex
            GL.EnableVertexAttribArray(0); // Position
            GL.VertexAttribPointer(0, 2, VertexAttribPointerType.Float, false, Marshal.SizeOf<FontVertex>(), 0);

            GL.EnableVertexAttribArray(1); // TexCoord
            GL.VertexAttribPointer(1, 2, VertexAttribPointerType.Float, false, Marshal.SizeOf<FontVertex>(), Marshal.SizeOf<Vector2>());

            GL.BindVertexArray(0);
        }
        public void RenderText(ReadOnlySpan<char> text, float x, float y, FontFile? font = null, TextAlign textAlign = TextAlign.Left)
        {
            if (text.IsEmpty)
            {
                _currentVertexCount = 0; // Ensure nothing is drawn if text is empty
                return;
            }

            GL.ActiveTexture(TextureUnit.Texture0);
            GL.BindTexture(TextureTarget.Texture2D, (font ?? this.Font).TextureId);

            // Ensure our vertex array is big enough and then build the string into it
            EnsureVertexCapacity(text.Length * 6);
            _currentVertexCount = FontVertex.BuildString(_vertices, 0, text, font ?? this.Font, x, y, Scaling, textAlign);
            BindVertices();
            Render();
        }


        public void RenderText(string text, float x, float y, FontFile? font = null, TextAlign textAlign = TextAlign.Left)
            => RenderText(text.AsSpan(), x, y, font, textAlign);

        public void RenderText(TextBlock block)
            => RenderText(block.Span, block.X, block.Y, block.Font, block.Align);

        public void RenderText(TextBlock[] blocks)
        {
            _currentVertexCount = 0;

            GL.ActiveTexture(TextureUnit.Texture0);
            GL.BindTexture(TextureTarget.Texture2D, blocks.FirstOrDefault()?.Font.TextureId ?? FontFile.Default.TextureId);

            foreach (ref var block in blocks.AsSpan())
            {
                var blockVerticesSpan = block.GetVertices(Scaling);
                EnsureVertexCapacity(_currentVertexCount + blockVerticesSpan.Length);
                blockVerticesSpan.CopyTo(_vertices.AsSpan(_currentVertexCount));
                _currentVertexCount += blockVerticesSpan.Length;
            }

            BindVertices();
            Render();
        }

        public void RenderText(TextBlock[] blocks, int count)
        {
            if (count <= 0) return;
            if (count > blocks.Length) count = blocks.Length;

            _currentVertexCount = 0;

            GL.ActiveTexture(TextureUnit.Texture0);
            GL.BindTexture(TextureTarget.Texture2D, blocks[0].Font.TextureId);

            for (int i = 0; i < count; i++)
            {
                var blockVerticesSpan = blocks[i].GetVertices(Scaling);
                EnsureVertexCapacity(_currentVertexCount + blockVerticesSpan.Length);
                blockVerticesSpan.CopyTo(_vertices.AsSpan(_currentVertexCount));
                _currentVertexCount += blockVerticesSpan.Length;
            }

            BindVertices();
            Render();
        }

        public void RenderText(List<TextBlock> blocks)
        {
            _currentVertexCount = 0;
         
            GL.ActiveTexture(TextureUnit.Texture0);
            GL.BindTexture(TextureTarget.Texture2D, blocks.FirstOrDefault()?.Font.TextureId ?? FontFile.Default.TextureId);
            
            foreach (ref var block in CollectionsMarshal.AsSpan(blocks))
            {
                var blockVerticesSpan = block.GetVertices(Scaling);
                EnsureVertexCapacity(_currentVertexCount + blockVerticesSpan.Length);
                blockVerticesSpan.CopyTo(_vertices.AsSpan(_currentVertexCount));
                _currentVertexCount += blockVerticesSpan.Length;
            }
            
            BindVertices();
            Render();
        }


        public void RenderText(FontVertex[] verts, int length, FontFile? font = null)
        {
            if (length == 0) return;
            GL.ActiveTexture(TextureUnit.Texture0);
            GL.BindTexture(TextureTarget.Texture2D, (font ?? this.Font).TextureId);


            BindVertices(verts, length);
            Render();
        }

        public void BindVertices(FontVertex[]? verts = null, int? length = null)
        {
            bool useDefault = verts == null;
            if ( useDefault && _currentVertexCount == 0) return;
            if (!useDefault && (length == null || length <= 0)) return;
            if (!useDefault) _currentVertexCount = length!.Value;

            GL.BindBuffer(BufferTarget.ArrayBuffer, _vbo);

            int requiredSize = _currentVertexCount * Marshal.SizeOf<FontVertex>();
            if (requiredSize > _bufferSize)
            {
                _bufferSize = requiredSize * 2;
                GL.BufferData(BufferTarget.ArrayBuffer, _bufferSize, IntPtr.Zero, BufferUsageHint.StreamDraw);
            }

            GL.BufferSubData(BufferTarget.ArrayBuffer, IntPtr.Zero, requiredSize, useDefault ? _vertices : verts);
        }

        public void Render()
        {
            if (_currentVertexCount == 0) return;

            GL.BindVertexArray(_vao);
            GL.DrawArrays(PrimitiveType.Triangles, 0, _currentVertexCount);
            GL.BindVertexArray(0);
        }

        public void Shutdown()
        {
            GL.DeleteBuffer(_vbo);
            GL.DeleteVertexArray(_vao);
            GC.SuppressFinalize(this);
        }

        private void EnsureVertexCapacity(int requiredCount)
        {
            if (_vertices.Length < requiredCount)
            {
                int newSize = Math.Max(_vertices.Length * 2, requiredCount);
                Array.Resize(ref _vertices, newSize);
            }
        }
    }
}
