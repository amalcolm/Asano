using Asano;
using OpenTK.Graphics.OpenGL4;
using OpenTK.Mathematics;
using System.ComponentModel;

using Asano.MyGLTools.Helpers;
namespace Asano.MyGLTools.UserControls
{
    public abstract class MyPlotterBase : MyGLControl
    {

        // Shader programs
        protected int _plotShaderProgram ;
        private Matrix4 _plotTransform;
        private int _plotTransformLocation = -1;
        public Matrix4 getPlotTransform() => _plotTransform;

        public int GetPlotShader() => _plotShaderProgram;

        protected MyPlotterBase()
        {
            if (!Program.IsRunning) return;
        }

        protected override void Init()
        {
            _plotShaderProgram = MyShaderManager.Get("plot");
            _plotTransformLocation = GL.GetUniformLocation(_plotShaderProgram, "uTransform");
        }

        protected override void Render()
        {
            GL.UseProgram(_plotShaderProgram);

            ApplyPlotTransform();

            bool isClipped = BeginPlotClip();
            try { DrawPlots(); }
            finally { if (isClipped) EndPlotClip(); }

            DrawPlotOverlays();
        }

        protected void ApplyPlotTransform() => ApplyPlotTransform(GetPlotViewPort());

        protected virtual RectangleF GetPlotViewPort() => ViewPort;

        protected void ApplyPlotTransform(RectangleF viewPort)
        {
            _plotTransform = Matrix4.CreateOrthographicOffCenter(viewPort.Left, viewPort.Right, viewPort.Top, viewPort.Bottom, -1.0f, 1.0f);
            GL.UniformMatrix4(_plotTransformLocation, false, ref _plotTransform);
        }

        protected abstract void DrawPlots();
        protected virtual void DrawPlotOverlays() { }

        protected virtual bool BeginPlotClip() => false;

        protected void BeginPlotClip(Rectangle clipRect)
        {
            GL.Scissor(clipRect.X, clipRect.Y, clipRect.Width, clipRect.Height);
            GL.Enable(EnableCap.ScissorTest);
        }

        protected void EndPlotClip()
        {
            GL.Disable(EnableCap.ScissorTest);
        }

        public void SetMetrics(float min, float max, float range, float desiredRange, float viewMin, float viewMax)
        {
            _metrics ??= new PlotMetrics();

            _metrics.MinY          = min;
            _metrics.MaxY          = max;
            _metrics.RangeY        = range;
            _metrics.DesiredRangeY = desiredRange;
            _metrics.ViewMinY      = viewMin;
            _metrics.ViewMaxY      = viewMax;
            _metrics.HasViewRange  = true;
        }


        public class PlotMetrics
        {
            public float MinY = 0.0f;
            public float MaxY = 0.0f;
            public float RangeY = 0.0f;
            public float DesiredRangeY = 0.0f;
            public float ViewMinY = 0.0f;
            public float ViewMaxY = 0.0f;
            public bool HasViewRange = false;
        }

        private PlotMetrics? _metrics = null;
        public PlotMetrics? GetMetrics() => _metrics;

        protected RectangleF GetMetricsViewPort()
        {
            RectangleF viewPort = GetPlotViewPort();

            if (_metrics is { HasViewRange: true }
                && float.IsFinite(_metrics.ViewMinY)
                && float.IsFinite(_metrics.ViewMaxY)
                && _metrics.ViewMaxY > _metrics.ViewMinY)
            {
                return new RectangleF(viewPort.Left, _metrics.ViewMinY, viewPort.Width, _metrics.ViewMaxY - _metrics.ViewMinY);
            }

            return viewPort;
        }
    }
}
