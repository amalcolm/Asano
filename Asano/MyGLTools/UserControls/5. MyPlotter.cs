using TheLib;
using System.ComponentModel;
using Asano.MyGLTools.Helpers;
namespace Asano.MyGLTools.UserControls
{
    [ToolboxItem(false)]
    public partial class MyPlotter : MyPlotterBase
    {

        public static float Window { get; set; } = 10.0f;
        public        float Yscale { get; set; } = 1.0f;


        protected Dictionary<uint, MyPlot> Plots = [];
        protected readonly object PlotsLock = new();

        protected string Debug = string.Empty;

        protected override void Init()
        {
            base.Init();
            if (MyGL != null && UseLegacyMouseWheelZoom)
                MyGL.MouseWheel += MyGL_MouseWheel;

            if (Program.SerialPort != null)
                Program.SerialPort.ConnectionChanged += SP_ConnectionChanged;
        }

        private MyPlot[] _plotsSnapshot = [];
        private bool _plotsDirty = true;

        protected void AddPlot(uint key, MyPlot plot)
        {
            Plots[key] = plot;
            _plotsDirty = true;
        }

        private float _currentViewRight = 0.0f;
//        private float _maxTime = 0.0f;

        private const float RightEdgeBufferPixels = 5.0f;

        private DateTime lastTime = DateTime.Now;
        private readonly TimeSpan timeBetweenDebug = TimeSpan.MaxValue;
        protected override void DrawPlots()
        {
            if (DateTime.Now - lastTime > timeBetweenDebug)
            {
//              System.Diagnostics.Debug.WriteLine($"[MyPlotter] Plots: {Plots.Count}, TimeWindow: {Window:F1}s, MaxTime: {_maxTime:F3}s");

                lastTime = DateTime.Now;
            }

            if (Plots.Count == 0) return;

            // 0. Take a snapshot of the current plots
            MyPlot[] plotsSnapshot = GetPlotsSnapshot();
/*
            // 1. Get the latest time from all plots
            float maxTime = float.MinValue;
            for (int i = 0; i < plotsSnapshot.Length; i++)
            {
                float lastX = plotsSnapshot[i].LastX;
                if (lastX > maxTime) maxTime = lastX;
            }
            _maxTime = maxTime;

            if (_maxTime == float.MinValue) return;
*/
            _currentViewRight = (float)(Scheduler.Time + GetRightEdgeBufferSeconds());


            // 4. Define the _viewport based on the smoothed position.
            float viewLeft = _currentViewRight - Window;
            ViewPort = PrepareViewPort(new RectangleF(viewLeft, -6, Window, 1030));
            ApplyPlotTransform();


            // 5. Render each plot from the snapshot.
            for (int i = 0; i < plotsSnapshot.Length; i++)
            {
                var plot = plotsSnapshot[i];
                if (plot.Yscale == 0.0f) plot.Yscale = Yscale;

                plot.Render();
            }
        }

        protected virtual void SP_ConnectionChanged(ConnectionState state)
        {
            switch (state)
            {
                case ConnectionState.Connected:
                case ConnectionState.Disconnected:
                    lock (PlotsLock)
                    {
                        Plots.Clear();
                        _plotsSnapshot = [];
                        _plotsDirty = true;
                    }
                    break;
            }
            Scheduler.Reset();
        }

        protected override void DrawText()
        {
            fontRenderer?.RenderText(Debug, 10, 10);

            if (fontRenderer == null) return;

            MyPlot[] plotsSnapshot = GetPlotsSnapshot();
            for (int i = 0; i < plotsSnapshot.Length; i++)
                plotsSnapshot[i].RenderText(fontRenderer);
        }

        protected virtual bool UseLegacyMouseWheelZoom => true;

        protected virtual RectangleF PrepareViewPort(RectangleF viewPort) => viewPort;

        private double GetRightEdgeBufferSeconds()
        {
            int width = Math.Max(1, GLDisplaySize.Width);
            return Window * RightEdgeBufferPixels / width;
        }

        private MyPlot[] GetPlotsSnapshot()
        {
            lock (PlotsLock)
            {
                if (_plotsDirty)
                {
                    _plotsSnapshot = [.. Plots.Values];
                    _plotsDirty = false;
                }

                return _plotsSnapshot;
            }
        }

        private void MyGL_MouseWheel(object? sender, MouseEventArgs e)
        {
            if (GLThread == null || GLThread.IsDisposed) return;

            const float zoomFactor = 1.1f;
            float newTimeWindow;

            if (e.Delta > 0)
                newTimeWindow = Window / zoomFactor;
            else
                newTimeWindow = Window * zoomFactor;

            newTimeWindow = Math.Clamp(newTimeWindow, 0.1f, 10.0f);

            GLThread.Enqueue(() => { Window = newTimeWindow; });
        }


    }
}
