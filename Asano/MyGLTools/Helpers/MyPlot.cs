using OpenTK.Graphics.OpenGL4;
using OpenTK.Mathematics;
using TheLib;
using System.Diagnostics;
using Asano.MyGLTools.Fonts;
using Asano.MyGLTools.UserControls;

namespace Asano.MyGLTools.Helpers
{
    public class MyPlot
    {
        public float      LastX    { get; private set; } = 0;
        public double     Yscale   { get; set;         } = 0.0; // overridden by MyPlotter if 0.0.  If not overridden, use 1.0.
        public MyColour   Colour   { get; set;         } = MyColour.GetNextColour();
        public double     XCounter { get; set;         } = 0.0; // -Math.Pow(2, 20) + 2; // X value counter, for signals without timestamps
                                                                                 // Starts at a large negative value to avoid issues with float precision with ++;
        public bool       Visible  { get; set;         } = true;
        public FieldEnum? Selector { get; set;         } = null;

        public bool AutoScaling { get; set; } = false;
        public bool SharedScaling { get; set; } = false;

        private const double DefaultSharedMinY = -10.0;
        private const double DefaultSharedMaxY = 1050.0;

        public static double Shared_MinY { get; set; } = DefaultSharedMinY;
        public static double Shared_MaxY { get; set; } = DefaultSharedMaxY;

        public static void ResetSharedScaling()
        {
            Shared_MinY = DefaultSharedMinY;
            Shared_MaxY = DefaultSharedMaxY;
        }

        private RunningAverage? _ra = null;


        public string DBG { get; set; } = string.Empty;
        
        private readonly MyGLVertexBuffer _bufMainPlot = default!;
        private readonly MyGLVertexBuffer _bufSubPlot = new(4096);
        private readonly MyGLVertexBuffer _bufSubPlotGrid = new(4096);

        private readonly MySubplot _subPlot = default!;

        public int NumPoints => _bufMainPlot.Count;

        int _transformLoc = -1;
        private readonly MyPlotterBase _plotter;
        private readonly int _windowSize;

        private float _parentMinX = 0;
        private float _parentMaxX = 0;

        public MyPlot(int windowSize, MyPlotterBase myPlotter)
        {
            _windowSize = windowSize;
            _plotter = myPlotter;
            
            // Make the buffer larger than the history to avoid copying every single frame
            int _bufferCapacity = _windowSize * 3 + Random.Shared.Next(0, _windowSize);  // stagger refreshes

            _bufMainPlot = new MyGLVertexBuffer(_bufferCapacity) { WindowSize = _windowSize };

            _subPlot = new MySubplot(_plotter);
            _plotter.Setup(initAction:Init, shutdownAction:Shutdown);
            _plotter.GLResize += (s, p) => _ra = null; // reset running average on resize
        }


        private void Init()
        {
            _transformLoc = GL.GetUniformLocation(_plotter.GetPlotShader(), "uTransform");


            _subPlot.Init();

            _bufMainPlot.Init();
            _bufSubPlot.Init();
            _bufSubPlotGrid.Init();
        }

        public void Add(double y) => Add(XCounter+=0.01, y);

        private int count = -1;
        double diffSum = 0.0;
        /// <summary>
        /// Adds a new Y data point to the plot. The X value is automatically incremented.
        /// </summary>
        public void Add(double x, double y)
        {
            if (count++ < 0)  return; 

            double scale = Yscale == 0.0 ? 1.0 : Yscale;

            float fX = (float)x;
            float fY = (float)(y * scale);

            _ra?.Add(fY);

            _bufMainPlot.AddVertex(fX, fY, 0.0f, Colour);


            if (count < 10)
                diffSum += fX - LastX;
            else if (_ra == null)
            {
                RectangleF viewport = _plotter.ViewPort;
                _parentMinX = viewport.Left;
                _parentMaxX = viewport.Right;
                double avgDiff = Config.STATE_DURATION_uS / 1_000_000.0;
                float window = _parentMaxX - _parentMinX;
                _ra = new RunningAverage( (uint)(window / avgDiff) );
            }
            LastX = fX;

        }

        

        public void Add(BlockPacket block)  // no auto-scaling support
        {
            if (count++ < 0) return;

            if (Selector == null)
                SetSubplot(block);

            _bufMainPlot.AddBlock(ref block, Selector, onlyLast:true); // only plot last point in block

            LastX = (float)block.BlockData[block.Count - 1].TimeStamp;
        }


        /// <summary>
        /// Renders the plot. Assumes the correct shader program is already active.
        /// </summary>
        public void Render()
        {
            if ((_ra != null && AutoScaling) || SharedScaling)
            {
                float minY, maxY;
                if (SharedScaling)
                {
                    minY = (float)Shared_MinY;
                    maxY = (float)Shared_MaxY;
                }
                else  // AutoScaling
                {
                    minY = (float)_ra!.Min;
                    maxY = (float)_ra!.Max;
                }

                // Guard bad values / zero range
                SetScaling(minY, maxY);
            }

            if (Visible)
            {
                _bufMainPlot.DrawLineStrip();
                _subPlot.Render();
                DBG = "Rendered";
            }
            else
            {
                DBG = "Not Visible";
            }
        }

        public void RenderText(FontRenderer fontRenderer)
        {
            if (Visible)
                _subPlot.RenderText(fontRenderer);
        }

        public void SetScaling(float minY, float maxY)
        {
            if (!float.IsFinite(minY) || !float.IsFinite(maxY))
                return;

            if (maxY < minY) (minY, maxY) = (maxY, minY);

            float range = maxY - minY;
            if (range < 1e-6f) range = 1e-6f;

            float midY = (minY + maxY) * 0.5f;

            float padding = 200f;
            float targetHeight = range + padding;

            // Ramp-in based on sample count
            float t = Math.Clamp(count / 100f, 0f, 1f);
//          t = t * t * (3f - 2f * t); // smoothstep (optional but nicer)

            float startHeight = 120000f;              // big & stable at the beginning
            float desiredHeight = startHeight + (targetHeight - startHeight) * t;

            desiredHeight = Math.Clamp(desiredHeight, 500f, 120000f);

            float bottom = midY - desiredHeight * 0.5f;
            float top = midY + desiredHeight * 0.5f;

            RectangleF viewport = _plotter.ViewPort;
            _parentMinX = viewport.Left;
            _parentMaxX = viewport.Right;


            var transform = Matrix4.CreateOrthographicOffCenter(_parentMinX, _parentMaxX, bottom, top, -1.0f, 1.0f);
            GL.UniformMatrix4(_transformLoc, false, ref transform);

            _plotter.SetMetrics(minY, maxY, range, desiredHeight, bottom, top);
        }

        /// <summary>
        /// Releases the GPU resources (VBO and VAO).
        /// </summary>
        public void Shutdown()
        {
            _bufMainPlot.Dispose();
            _bufSubPlot.Dispose();
            _bufSubPlotGrid.Dispose();

            _subPlot.Shutdown();
        }

        private void SetSubplot(BlockPacket block)
        {
            if (block == null) return;

            _subPlot.SetBlock(block);
/*
            for (int i = 1; i < block.Count; i++)
            {
                ref var item = ref block.BlockData[i];

                uint c0 = block.BlockData[i - 1].Channel[0];
                uint c1 = item.Channel[0];
                uint diff = (c0 > c1) ? (c0 - c1) : (c1 - c0);

                if (c0 < 0x1000 || c0 > 0xFEFFFFF)
                {   // 0's and 0xFF.... are invalid data
                    // Debug.WriteLine($"Skipping c0: 0x{c0:X8}");
                }
                else
                if (c1 < 0x1000 || c1 > 0xFEFFFFF)
                {
                    // skip diff check as this will be caught next iteration
                }
                else
                if (diff > 0x00400000)
                    Debug.WriteLine($"c0: 0x{c0:X8}, c1: 0x{c1:X8}");
            }
*/
        }
    }
}
