using OpenTK.Graphics.OpenGL4;
using OpenTK.Mathematics;
using TheLib;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Runtime.InteropServices;

namespace Asano.MyGLTools.Helpers
{
    /// <summary>
    /// Represents a single vertex in 3D space.
    /// </summary>
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct Vertex
    {
        public Vector4  Position; // location 0
        public Vector4  Normal;   // location 1
        public MyColour Colour;   // location 2
        public Vector2  uv0;      // location 3
        public Vector2  uv1;      // location 4

        public Vertex(Vector4 position)
        {
            Position = position;
            Normal   = Vector4.UnitZ;
            Colour   = MyColour.Unset;
            uv0      = Vector2.Zero;
            uv1      = Vector2.Zero;
        }
    
        public Vertex(float x, float y, float z)
        {
            Position = new Vector4(x, y, z, 1.0f);
            Normal   = Vector4.UnitZ;
            Colour   = MyColour.Unset;
            uv0      = Vector2.Zero;
            uv1      = Vector2.Zero;
        }

        public Vertex(float x, float y, float z, MyColour colour)
        {
            Position = new Vector4(x, y, z, 1.0f);
            Normal   = Vector4.UnitZ;
            Colour   = colour;
            uv0      = Vector2.Zero;
            uv1      = Vector2.Zero;
        }

        public static readonly int Size = Marshal.SizeOf<Vertex>();
    }

    /// <summary>
    /// Creates a fixed-size vertex buffer for a given number of vertices.
    /// </summary>
    /// <param name="vertexCapacity">Maximum vertex count to allocate space for.</param>
    /// <param name="stride">Number of floats per vertex (e.g. 3 for XYZ).</param>
    public class MyGLVertexBuffer(int vertexCapacity) : IDisposable
    {
        public int VertexCount { get => _vertexCount; }
  
        private readonly Vertex[] _vertexData = new Vertex[vertexCapacity];
        private int _vao;
        private int _vbo;
        private bool _disposed;

        private int _vertexCount = 0;

        public int WindowSize { get; set; } = -1;

        private readonly object _lock = new();

        public void Init()
        { 
            _vao = GL.GenVertexArray();
            _vbo = GL.GenBuffer();

            GL.BindVertexArray(_vao);
            GL.BindBuffer(BufferTarget.ArrayBuffer, _vbo);
                        
            // Allocate GPU memory (bytes)
            GL.BufferData(
                target: BufferTarget.ArrayBuffer,
                  size: vertexCapacity * Vertex.Size,
                  data: IntPtr.Zero,
                 usage: BufferUsageHint.DynamicDraw);

            /* Attribute 0: vec4 position */  GL.EnableVertexAttribArray(0); GL.VertexAttribPointer( index: 0, size: 4, type: VertexAttribPointerType.Float, normalized: false, stride: Vertex.Size, pointer: Marshal.OffsetOf<Vertex>(nameof(Vertex.Position)));
            /* Attribute 1: vec4 normal   */  GL.EnableVertexAttribArray(1); GL.VertexAttribPointer( index: 1, size: 4, type: VertexAttribPointerType.Float, normalized: false, stride: Vertex.Size, pointer: Marshal.OffsetOf<Vertex>(nameof(Vertex.Normal  )));
            /* Attribute 2: vec4 colour   */  GL.EnableVertexAttribArray(2); GL.VertexAttribPointer( index: 2, size: 4, type: VertexAttribPointerType.Float, normalized: false, stride: Vertex.Size, pointer: Marshal.OffsetOf<Vertex>(nameof(Vertex.Colour  )));
            /* Attribute 3: vec2 uv0      */  GL.EnableVertexAttribArray(3); GL.VertexAttribPointer( index: 3, size: 2, type: VertexAttribPointerType.Float, normalized: false, stride: Vertex.Size, pointer: Marshal.OffsetOf<Vertex>(nameof(Vertex.uv0     )));
            /* Attribute 4: vec2 uv1      */  GL.EnableVertexAttribArray(4); GL.VertexAttribPointer( index: 4, size: 2, type: VertexAttribPointerType.Float, normalized: false, stride: Vertex.Size, pointer: Marshal.OffsetOf<Vertex>(nameof(Vertex.uv1     )));
            
            GL.BindVertexArray(0);
            GL.BindBuffer(BufferTarget.ArrayBuffer, 0);
        }

        public void Clear()
        {
            lock (_lock)
            {
                _vertexCount = 0;
            }
        }

        readonly int SafeSize = vertexCapacity - 4;

        void CheckSize()
        {

            if (_vertexCount < SafeSize || WindowSize < 0) return;
            int windowMax = WindowSize - 1;

            // Shift data left to make room for new vertex
            Array.Copy(_vertexData, (_vertexCount - windowMax), _vertexData, 0, windowMax);
            _vertexCount = windowMax;
        }


        private void AddUnderLock(float x, float y, float z, MyColour colour)
        {
            _vertexData[_vertexCount] = new Vertex(x,y,z, colour);
            _vertexCount++;
        }

        public void AddVertex(float x, float y, float z)
        {
            lock (_lock)
            {
                CheckSize();

                AddUnderLock(x, y, z, Color.Magenta);
            }
        }

        public void AddVertex(float x, float y, float z, MyColour colour)
        {
            lock (_lock)
            {
                CheckSize();
         
                AddUnderLock(x, y, z, colour);
            }
        }


        static readonly FieldEnum[] DoNotJoin = [FieldEnum.C0, FieldEnum.Sensor2];

        public void AddBlock(ref BlockPacket packet, FieldEnum? selector, int channel, bool onlyLast)
        {
            MyColour color = MyColour.GetFieldColour(selector, channel);

            lock (_lock)
            {
                int start = (selector == null) ? 1 : 0;
                if (onlyLast) start = packet.Count - 1;

                int first = start, last = packet.Count - 1;

                bool transparent = DoNotJoin.Contains(selector ?? FieldEnum.C0) && !onlyLast;

                for (int i = start; i < packet.Count; i++)
                {
                    CheckSize();

                    float x = (float)packet.BlockData[i].TimeStamp;
                    float y = (selector == null) ? (float)(packet.BlockData[0].Channel[channel] * Config.A2D_24bit_To_1024)   // *** 0 reads MASTER
                                                 : (float)(packet.BlockData[i].get(selector.Value)         );

                   if (y == 0.0f) y = -999.0f;
                    if (i == start && transparent) AddUnderLock(x, y, 0.0f, MyColour.Transparent);

                    AddUnderLock(x, y, 0.0f, color);

                    if (i == last  && transparent) AddUnderLock(x, y, 0.0f, MyColour.Transparent);
                }
            }
        }
        private float[] _latestX = new float[16];
        private int _latestXCount;

        private float[] _xSnapshot = new float[16];

        public ReadOnlySpan<float> GetLatestX()
        {
            lock (_lock)
            {
                int n = _latestXCount;
                
                if (_xSnapshot.Length < n)
                    _xSnapshot = new float[n * 2];

                Array.Copy(_latestX, 0, _xSnapshot, 0, n);
                return new ReadOnlySpan<float>(_xSnapshot, 0, n);
            }
        }

        public int Count => _vertexCount;




        Vertex[] subPlotData = new Vertex[1024];
        public void SetSubPlotData(BlockPacket packet, FieldEnum? field, int channel, double scale)
        {
            if (subPlotData.Length < packet.Count)
                subPlotData = new Vertex[packet.Count * 2];

            if (field == FieldEnum.Events)
            {
                SetEvents(packet);
                return;
            }

            bool separate = false;
            int first = 0, last = packet.Count - 1;
            if (last >= first + 2)
            {
                double dT0 = packet.BlockData[first + 1].TimeStamp - packet.BlockData[first   ].TimeStamp;
                double dT1 = packet.BlockData[last     ].TimeStamp - packet.BlockData[last - 1].TimeStamp;

                separate = dT0 > 0 && dT1 / dT0 > 3;
            }


            MyColour colour = MyColour.GetFieldColour(field, channel);

            int i = 0;
            while (i < packet.Count)
            {
                double value = field.HasValue ? packet.BlockData[i].get(field.Value)
                                              : packet.BlockData[i].Channel[channel];
                value *= scale;

                float x = (float)packet.BlockData[i].StateTime;
                float y = (float)value;
                float z = 0.0f;

                if (separate && i == last)
                    subPlotData[i++] = new Vertex((float)packet.BlockData[last-1].StateTime, y, z, colour);

                subPlotData[i++] = new Vertex(x, y, z, colour);
            }


            Set(ref subPlotData, i);

        }

        private void SetEvents(BlockPacket block)
        {
            Clear();

            MyColour colour = MyColour.GetEventColour(EventKind.A2D_DATA_READY);
            for (int i = 0; i < block.NumEvents; i++)
            {   if (_vertexCount + 2 > vertexCapacity) return;
                var ev = block.EventData[i]; if (ev.Kind != EventKind.A2D_DATA_READY) continue;
            
                float x = (float)ev.StateTime;

                _vertexData[_vertexCount++] = new Vertex(x, 80, 0, colour);
                _vertexData[_vertexCount++] = new Vertex(x, 70, 0, colour);
            }


            void DrawEvents(EventKind startEvent, EventKind endEvent, float y)
            {
                MyColour colour1 = MyColour.GetEventColour(startEvent);
                MyColour colour2 = MyColour.GetEventColour(  endEvent);
                float x1 = 0.0f, x2;
                float y1 = y - 4.0f, y2 = y + 4.0f;

                for (int i = 0; i < block.NumEvents; i++)
                {
                    if (_vertexCount + 6 > vertexCapacity) return;

                    var ev = block.EventData[i];

                    if (ev.Kind == startEvent) x1 = (float)ev.StateTime;
                    if (ev.Kind !=   endEvent) continue;
                                               x2 = (float)ev.StateTime;

                    _vertexData[_vertexCount++] = new Vertex(x1, y1, 0.0f, colour1);
                    _vertexData[_vertexCount++] = new Vertex(x1, y2, 0.0f, colour1);

                    _vertexData[_vertexCount++] = new Vertex(x1, y , 0.0f, colour2);
                    _vertexData[_vertexCount++] = new Vertex(x2, y , 0.0f, colour2);

                    _vertexData[_vertexCount++] = new Vertex(x2, y1, 0.0f, colour2);
                    _vertexData[_vertexCount++] = new Vertex(x2, y2, 0.0f, colour2);

                }
            }


            DrawEvents(EventKind.A2D_READ_START , EventKind.A2D_READ_COMPLETE , 20.0f);
            DrawEvents(EventKind.SPI_DMA_START  , EventKind.SPI_DMA_COMPLETE  , 30.0f);
            DrawEvents(EventKind.HW_UPDATE_START, EventKind.HW_UPDATE_COMPLETE, 48.0f);
        }

        /// <summary>
        /// Replaces the buffer content with new data.
        /// </summary>
        /// <param name="data">Flat array of floats (must be multiple of stride)</param>
        /// <param name="vertexCount">Number of vertices (not floats!)</param>
        public void Set(ref Vertex[] data, int vertexCount)
        {
            lock (_lock)
            {
                ArgumentOutOfRangeException.ThrowIfGreaterThan(vertexCount, vertexCapacity);
                if (data.Length < vertexCount)    throw new ArgumentException("Data array too small for vertex count");

                _vertexCount = vertexCount;
                // Copy only the used portion
                Array.Copy(data, _vertexData, vertexCount);

                _latestXCount = vertexCount;
                if (_latestX.Length < _latestXCount)
                    _latestX = new float[_latestXCount * 2];

                for (int i = 0; i < _latestXCount; i++)
                    _latestX[i] = _vertexData[i].Position.X;
            }
        }

        /// <summary>
        /// Uploads the current CPU vertex data to the GPU.
        /// Call this after you've finished adding vertices for the frame.
        /// </summary>
        public void Upload()
        {
            if (_vertexCount < 2) return;

            GL.BindBuffer   (BufferTarget.ArrayBuffer, _vbo);
            GL.BufferSubData(BufferTarget.ArrayBuffer, IntPtr.Zero, _vertexCount * Vertex.Size, _vertexData);
            GL.BindBuffer   (BufferTarget.ArrayBuffer, 0);
        }


        /// <summary>
        /// Draws the buffer using GL_LINES.
        /// </summary>
        public void DrawLines()
        {
            if (_vertexCount < 2) return;

            lock (_lock)
            {
                Upload();

                GL.BindVertexArray(_vao);
                GL.DrawArrays(PrimitiveType.Lines, 0, _vertexCount);
                GL.BindVertexArray(0);
            }
        }

        /// <summary>
        /// Draws the buffer using GL_LINE_STRIP.
        /// </summary>
        public void DrawLineStrip()
        {
            if (_vertexCount < 1) return;

            lock (_lock)
            {
                Upload();

                GL.BindVertexArray(_vao);
                GL.DrawArrays(PrimitiveType.LineStrip, 0, _vertexCount);
                GL.BindVertexArray(0);
            }
        }

        /// <summary>
        /// Draws the buffer using GL_TRIANGLES.
        /// </summary>
        public void DrawTriangles()
        {
            if (_vertexCount < 3) return;
            lock (_lock)
            {
                Upload();
                GL.BindVertexArray(_vao);
                GL.DrawArrays(PrimitiveType.Triangles, 0, _vertexCount);
                GL.BindVertexArray(0);
            }
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;

            GL.DeleteBuffer(_vbo);
            GL.DeleteVertexArray(_vao);
            GC.SuppressFinalize(this);
        }
    }
}
