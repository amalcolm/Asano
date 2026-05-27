using OpenTK.Graphics.OpenGL4;
using OpenTK.Mathematics;
using Asano.MyGLTools.UserControls;

namespace Asano.MyGLTools.Helpers
{

    class MyGLViewport(MyPlotterBase myPlotter)
    {
        public int         Margin { get =>  _margin; set {  _margin = value; Update(); } }   private int        _margin = 10;
        public RectangleF  InRect { get =>  _inRect; set {  _inRect = value; Update(); } }   private RectangleF _inRect  = RectangleF.Empty;
        public RectangleF OutRect { get => _outRect; set { _outRect = value; Update(); } }   private RectangleF _outRect = RectangleF.Empty;

        private Rectangle _vpRect = Rectangle.Empty;
        private Rectangle _parentRect = Rectangle.Empty;
        private int _transformLoc  = -1;
        protected bool _canUpdate = false;
        protected MyPlotterBase _myPlotter = myPlotter;

        public virtual void Init()
        {
            _myPlotter.Resize += (s, e) => _myPlotter.GLThread?.Enqueue(() => Update());

            _transformLoc = GL.GetUniformLocation(_myPlotter.GetPlotShader(), "uTransform");
            _canUpdate = true;
            Update();
        }

        public virtual void Shutdown()
        {
            _canUpdate = false;
        }

        public void Update()    
        { 
            if (!_canUpdate) return;

            int[] _viewport = new int[4];
            GL.GetInteger(GetPName.Viewport, _viewport);
            _parentRect.X      = _viewport[0];
            _parentRect.Y      = _viewport[1];
            _parentRect.Width  = _viewport[2];
            _parentRect.Height = _viewport[3];

            _vpRect.X      = (int)(_inRect.X      * _parentRect.Width  +     _margin);
            _vpRect.Y      = (int)(_inRect.Y      * _parentRect.Height +     _margin);
            _vpRect.Width  = (int)(_inRect.Width  * _parentRect.Width  - 2 * _margin);
            _vpRect.Height = (int)(_inRect.Height * _parentRect.Height - 2 * _margin);
        }

        public void SetupViewport()
        {
            if (!_canUpdate) return;
            if (_vpRect.Width == 0 || _vpRect.Height == 0) Update();

            GL.Scissor(_vpRect.X, _vpRect.Y, _vpRect.Width, _vpRect.Height);
            GL.Enable(EnableCap.ScissorTest);
            GL.Viewport(_vpRect.X, _vpRect.Y, _vpRect.Width, _vpRect.Height);

            // the x-ordinates are in milliseconds for the subplot, max 20ms
            var transform = Matrix4.CreateOrthographicOffCenter(_outRect.Left, _outRect.Right, _outRect.Top, _outRect.Bottom, -1.0f, 1.0f);
            GL.UniformMatrix4(_transformLoc, false, ref transform);
        }

        public void ResetViewport(Matrix4 transform)
        {
            if (!_canUpdate) return;
            GL.Disable(EnableCap.ScissorTest);
            GL.Viewport(_parentRect.X, _parentRect.Y, _parentRect.Width, _parentRect.Height);
            GL.UniformMatrix4(_transformLoc, false, ref transform);
        }
    }
}
