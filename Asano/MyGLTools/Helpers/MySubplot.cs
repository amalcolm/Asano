using TheLib;
using Asano.MyGLTools.UserControls;

namespace Asano.MyGLTools.Helpers
{
    class MySubplot : MyGLViewport
    {
        private readonly MyGLVertexBuffer _waveBuffer_C0 = new(4096);
        private readonly MyGLVertexBuffer _waveBuffer_PG = new(4096);
        private readonly MyGLVertexBuffer _waveBuffer_EV = new(4096);
        private readonly MyGLVertexBuffer _waveBuffer_TMP= new(4096);

        private readonly double _C0_Scale = Config.C0to1024;
        private readonly double _PG_Scale = 1.0;

        private readonly MyGLVertexBuffer _gridBuffer = new(8192);
        private bool _gridDirty = true;
        
        
        public int GridDivisions { get; set; } = (int)Math.Round(Config.STATE_DURATION_uS/1000000.0f);
        public bool UniformGrid { get; set; } = false;

        public MySubplot(MyPlotterBase myPlotter) : base(myPlotter)
        {
            base.Margin = 20;
            base.InRect = new RectangleF(0f, 0f, 0.5f, 0.35f);
            this.OutRect = new RectangleF(0f, -10f, Config.STATE_DURATION_uS/1000000.0f, 1050f);
        }

        public override void Init()
        {
            base.Init();

            _waveBuffer_C0.Init();
            _waveBuffer_PG.Init();
            _waveBuffer_EV.Init();
            
            _waveBuffer_TMP.Init();

            _gridBuffer.Init();
        }

        public override void Shutdown()
        {
            base.Shutdown();
            _gridBuffer.Dispose();
            _waveBuffer_C0.Dispose();
            _waveBuffer_PG.Dispose();
            _waveBuffer_EV.Dispose();

            _waveBuffer_TMP.Dispose();
        }

        /// <summary>
        /// Overrides base OutRect to auto-invalidate grid when data range changes.
        /// Feel free to set this directly – it's your RectangleF for X/Y min/max.
        /// Left = XMin, Bottom = YMin, Right = XMax, Top = YMax.
        /// </summary>
        public new RectangleF OutRect
        {
            get => base.OutRect;
            set
            {
                if (!value.Equals(base.OutRect))
                {
                    base.OutRect = value;
                    _gridDirty = true;
                }
            }
        }

        public void SetBlock(BlockPacket block)
        {
            _waveBuffer_C0 .SetSubPlotData(block, FieldEnum.C0     , _C0_Scale);
            _waveBuffer_PG .SetSubPlotData(block, FieldEnum.Sensor2, _PG_Scale);
            _waveBuffer_EV .SetSubPlotData(block, FieldEnum.Events , 1.0);

            _waveBuffer_TMP.SetSubPlotData(block, FieldEnum.Sensor1, 1.0);
        }

        public void Render()
        {
            if (_waveBuffer_C0.VertexCount <= 0) return;

            SetupViewport();  // viewport, scissor, ortho projection from OutRect

            if (_gridDirty)
                if (UniformGrid)
                    BuildGrid();
                else
                    BuildGrid(_waveBuffer_C0);
            
            _gridBuffer.DrawLines();

//            _waveBuffer_C0 .DrawLineStrip();
            _waveBuffer_PG .DrawLineStrip();
            _waveBuffer_TMP.DrawLineStrip();

            // Draw events as vertical lines
            _waveBuffer_EV.DrawLines();

            ResetViewport(_myPlotter.getPlotTransform());  // clean restore to parent viewport
        }





        #region Build Grid Methods
        readonly Color _gridColor = Color.FromArgb(50, 64, 64, 64);
        float[] xs = new float[160];
        Vertex[] grid = new Vertex[1024];

        private void BuildGrid(MyGLVertexBuffer? waveBuffer = null)
        {
            var r = OutRect;
            float xMin = r.Left, xMax = r.Right, yMin = r.Top, yMax = r.Bottom; // note: Y inverted in GL coords
            int numVerticalLines;
            // 1) Get the X positions for vertical lines
            if (waveBuffer is null)
            {
                int div = Math.Max(1, GridDivisions);
                numVerticalLines = div + 1;
                if (xs.Length < numVerticalLines)
                    xs = new float[numVerticalLines];

                float step = (xMax - xMin) / div;
                for (int i = 0; i <= div; i++)
                    xs[i] = xMin + i * step;


                _gridDirty = false;  // only when uniform grid
            }
            else
            {
                var span = waveBuffer.GetLatestX();
                numVerticalLines= span.Length + 2; 
                if (xs.Length < numVerticalLines)
                    xs = new float[numVerticalLines];

                xs[0] = xMin;
                for (int i = 0; i < span.Length; i++)
                    xs[i + 1] = span[i];
                xs[span.Length + 1] = xMax;

            }

            // 2) Allocate and emit geometry
            int count = 0;

            for (int i = 0; i < numVerticalLines; i++)
            {
                float yOff = (i == 0 || i == numVerticalLines - 1) ? 0f : 80f;
                grid[count++] = new Vertex(xs[i], yMin + yOff, 0f, _gridColor);
                grid[count++] = new Vertex(xs[i], yMax       , 0f, _gridColor);
            }

            // top
            grid[count++] = new Vertex(xMin, yMax, 0f, _gridColor);
            grid[count++] = new Vertex(xMax, yMax, 0f, _gridColor);
            // bottom
            grid[count++] = new Vertex(xMin, yMin, 0f, _gridColor);
            grid[count++] = new Vertex(xMax, yMin, 0f, _gridColor);

            _gridBuffer.Set(ref grid, count);
        }
        #endregion
    }

}