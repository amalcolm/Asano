using Asano.MyGLTools.Helpers;

namespace Asano.MyGLTools.UserControls
{
    public class MyInteractivePlotterBase : MyPlotterBaseWithAxes, IPlotInteractionHost
    {
        private readonly PlotInteractionHandler _interaction;
        private bool _hasInteractionXRange;

        public float MinInteractionXRange { get; set; } = 0.000001f;
        public float MaxInteractionXRange { get; set; } = float.PositiveInfinity;

        protected MyInteractivePlotterBase()
        {
            _interaction = new(this);
        }

        protected override void Init()
        {
            base.Init();
            _interaction.Attach(MyGL);
        }

        protected override void Shutdown()
        {
            _interaction.Detach();
            base.Shutdown();
        }

        protected void SetAutomaticViewPort(RectangleF viewPort)
        {
            ViewPort = MergeAutomaticViewPort(viewPort);
        }

        protected void ClearInteractionXRange()
        {
            _hasInteractionXRange = false;
        }

        private RectangleF MergeAutomaticViewPort(RectangleF viewPort)
        {
            if (!_hasInteractionXRange)
                return viewPort;

            RectangleF current = ViewPort;
            return new RectangleF(current.Left, viewPort.Top, current.Width, viewPort.Height);
        }

        RectangleF IPlotInteractionHost.InteractionViewPort => GetPlotViewPort();
        Size IPlotInteractionHost.InteractionClientSize => GLClientSize;
        float IPlotInteractionHost.MinInteractionXRange => MinInteractionXRange;
        float IPlotInteractionHost.MaxInteractionXRange => MaxInteractionXRange;

        protected bool requestHold = false;
        void IPlotInteractionHost.BeginInteraction()
        {
            requestHold = true;
            _hasInteractionXRange = true;
        }
        void IPlotInteractionHost.EndInteraction()
        {
            requestHold = false;
        }

        void IPlotInteractionHost.SetInteractionX(float left, float width)
        {
            RectangleF plotViewPort = GetPlotViewPort();
            plotViewPort.X = left;
            plotViewPort.Width = width;

            RectangleF viewPort = RemoveLabelPadding(plotViewPort);
            RectangleF current = ViewPort;
            ViewPort = new RectangleF(viewPort.Left, current.Top, viewPort.Width, current.Height);
            _hasInteractionXRange = true;
        }
    }

    public partial class MyInteractivePlotter : MyPlotterWithAxes, IPlotInteractionHost
    {
        private readonly PlotInteractionHandler _interaction;
        private bool _hasInteractionXRange;

        public float MinInteractionXRange { get; set; } = 0.000001f;
        public float MaxInteractionXRange { get; set; } = float.PositiveInfinity;

        protected override bool UseLegacyMouseWheelZoom => false;

        public MyInteractivePlotter()
        {
            _interaction = new(this);
        }

        protected override void Init()
        {
            base.Init();
            _interaction.Attach(MyGL);
        }

        protected override void Shutdown()
        {
            _interaction.Detach();
            base.Shutdown();
        }

        protected override RectangleF PrepareViewPort(RectangleF viewPort)
        {
            if (!_hasInteractionXRange)
                return viewPort;

            RectangleF current = ViewPort;
            return new RectangleF(current.Left, viewPort.Top, current.Width, viewPort.Height);
        }

        protected void ClearInteractionXRange()
        {
            _hasInteractionXRange = false;
        }

        RectangleF IPlotInteractionHost.InteractionViewPort => GetPlotViewPort();
        Size IPlotInteractionHost.InteractionClientSize => GLClientSize;
        float IPlotInteractionHost.MinInteractionXRange => MinInteractionXRange;
        float IPlotInteractionHost.MaxInteractionXRange => MaxInteractionXRange;

        protected bool requestHold = false;
        void IPlotInteractionHost.BeginInteraction()
        {
            requestHold = true;
            _hasInteractionXRange = true;
        }
        void IPlotInteractionHost.EndInteraction()
        {
            requestHold = false;
        }

        void IPlotInteractionHost.SetInteractionX(float left, float width)
        {
            RectangleF plotViewPort = GetPlotViewPort();
            plotViewPort.X = left;
            plotViewPort.Width = width;

            RectangleF viewPort = RemoveLabelPadding(plotViewPort);
            RectangleF current = ViewPort;
            ViewPort = new RectangleF(viewPort.Left, current.Top, viewPort.Width, current.Height);
            _hasInteractionXRange = true;
        }
    }
}
