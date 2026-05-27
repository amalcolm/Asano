namespace Asano.MyGLTools.Helpers
{
    public interface IPlotInteractionHost
    {
        RectangleF InteractionViewPort { get; }
        Size InteractionClientSize { get; }
        float MinInteractionXRange { get; }
        float MaxInteractionXRange { get; }

        void BeginInteraction();
        void EndInteraction();
        void SetInteractionX(float left, float width);
    }

    internal sealed class PlotInteractionHandler(IPlotInteractionHost host)
    {
        private const float ZoomFactor = 1.15f;

        private readonly IPlotInteractionHost _host = host;
        private Control? _control;
        private bool _isDragging;
        private float _heldWorldX;

        public void Attach(Control control)
        {
            if (_control == control) return;

            Detach();

            _control = control;
            _control.MouseDown += MouseDown;
            _control.MouseMove += MouseMove;
            _control.MouseUp += MouseUp;
            _control.MouseLeave += MouseLeave;
            _control.MouseWheel += MouseWheel;
        }

        public void Detach()
        {
            if (_control == null) return;

            _control.MouseDown -= MouseDown;
            _control.MouseMove -= MouseMove;
            _control.MouseUp -= MouseUp;
            _control.MouseLeave -= MouseLeave;
            _control.MouseWheel -= MouseWheel;
            _control = null;
            _isDragging = false;
        }

        private void MouseDown(object? sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            if (!CanUseViewPort()) return;

            _heldWorldX = ScreenToWorldX(e.X);
            _isDragging = true;
            _host.BeginInteraction();
            Scheduler.IsPaused = false;

            if (_control != null)
                _control.Capture = true;
        }

        private void MouseMove(object? sender, MouseEventArgs e)
        {
            if (!_isDragging) return;
            if ((Control.MouseButtons & MouseButtons.Left) == 0)
            {
                EndDrag();
                return;
            }

            MoveHeldXToMouse(e.X);
            Scheduler.IsPaused = false;
        }

        private void MouseUp(object? sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
                EndDrag();
        }

        private void MouseLeave(object? sender, EventArgs e)
        {
            if ((Control.MouseButtons & MouseButtons.Left) == 0)
                EndDrag();
        }

        private void MouseWheel(object? sender, MouseEventArgs e)
        {
            if (e.Delta == 0 || !CanUseViewPort()) return;

            RectangleF viewPort = _host.InteractionViewPort;
            float anchor = _isDragging ? _heldWorldX : ScreenToWorldX(e.X);
            float ratio = ScreenRatio(e.X);

            float newWidth = e.Delta > 0
                ? viewPort.Width / ZoomFactor
                : viewPort.Width * ZoomFactor;

            newWidth = ClampWidth(newWidth);
            if (!float.IsFinite(newWidth) || newWidth <= 0.0f) return;

            float left = anchor - ratio * newWidth;

            _host.BeginInteraction();
            _host.SetInteractionX(left, newWidth);
            Scheduler.IsPaused = false;
        }

        private void MoveHeldXToMouse(int mouseX)
        {
            if (!CanUseViewPort()) return;

            RectangleF viewPort = _host.InteractionViewPort;
            float left = _heldWorldX - ScreenRatio(mouseX) * viewPort.Width;

            _host.SetInteractionX(left, viewPort.Width);
        }

        private void EndDrag()
        {
            _isDragging = false;

            if (_control != null)
                _control.Capture = false;

            _host.EndInteraction();
        }

        private float ScreenToWorldX(int mouseX)
        {
            RectangleF viewPort = _host.InteractionViewPort;
            return viewPort.Left + ScreenRatio(mouseX) * viewPort.Width;
        }

        private float ScreenRatio(int mouseX)
        {
            int width = Math.Max(1, _host.InteractionClientSize.Width);
            return mouseX / (float)width;
        }

        private float ClampWidth(float width)
        {
            float min = Math.Max(0.000001f, _host.MinInteractionXRange);
            float max = _host.MaxInteractionXRange;

            if (!float.IsFinite(max) || max < min)
                max = float.MaxValue;

            return Math.Clamp(width, min, max);
        }

        private bool CanUseViewPort()
        {
            RectangleF viewPort = _host.InteractionViewPort;

            return _host.InteractionClientSize.Width > 0
                && float.IsFinite(viewPort.Left)
                && float.IsFinite(viewPort.Right)
                && float.IsFinite(viewPort.Width)
                && viewPort.Width > 0.0f;
        }
    }
}
