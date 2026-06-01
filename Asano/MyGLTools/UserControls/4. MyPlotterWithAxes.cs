using Asano.MyGLTools.Helpers;

namespace Asano.MyGLTools.UserControls
{
    public partial class MyPlotterWithAxes : MyPlotter
    {
        private readonly PlotAxesRenderer _axes = new();

        public PlotAxesRenderer._Options AxesOptions { get => _axes.Options; set => _axes.Options = value; }

        protected override void Init()
        {
            base.Init();
            _axes.Init(font);
        }

        protected override void Shutdown()
        {
            _axes.Shutdown();
            base.Shutdown();
        }

        protected override void DrawPlotOverlays()
        {
            base.DrawPlotOverlays();

            RectangleF axesViewPort = GetAxesViewPort();
            ApplyPlotTransform(axesViewPort);
            _axes.RenderLines(axesViewPort, GLDisplaySize);
        }

        protected override void DrawText()
        {
            base.DrawText();


            Color? oldColour = null;
            if (TextColour != AxesOptions.LabelColor)
            {
                oldColour = TextColour;
                TextColour = AxesOptions.LabelColor;
            }
            _axes.RenderText(fontRenderer);
            if (oldColour.HasValue)
                TextColour = oldColour.Value;
        }

        protected virtual RectangleF GetAxesViewPort() => GetMetricsViewPort();

        protected override RectangleF GetPlotViewPort()
            => PlotAxesRenderer.AddLabelPadding(ViewPort, GLDisplaySize, AxesOptions.LabelPadding);

        protected RectangleF RemoveLabelPadding(RectangleF viewPort)
            => PlotAxesRenderer.RemoveLabelPadding(viewPort, GLDisplaySize, AxesOptions.LabelPadding);

        protected override bool BeginPlotClip()
        {
            if (AxesOptions.LabelPadding <= 0.0f) return false;

            int x1 = Math.Clamp((int)MathF.Ceiling(AxesOptions.LabelPadding), 0, GLDisplaySize.Width);
            int x2 = Math.Clamp((int)MathF.Ceiling(AxesOptions.XAxisLabelClipRightPadding), 0, GLDisplaySize.Width);
            int width = GLDisplaySize.Width - x1 - x2;
            if (width <= 0 || GLDisplaySize.Height <= 0) return false;

            base.BeginPlotClip(new Rectangle(x1, 0, width, GLDisplaySize.Height));
            return true;
        }
    }
}
