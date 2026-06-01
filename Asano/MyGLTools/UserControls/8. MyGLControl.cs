using OpenTK.GLControl;
using OpenTK.Graphics.OpenGL4;
using OpenTK.Mathematics;
using TheLib.Packets;
using System.Collections.Concurrent;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

using Asano.MyGLTools.Fonts;
using Asano.MyGLTools.Helpers;

namespace Asano.MyGLTools.UserControls
{
    public class MyGLControl : UserControl
    {
        static int InstanceCount = 0;

        public bool AutoClear { get; set; } = true;
        
        public MyGLThread? GLThread { get; private set; } = default!;
        public void Setup(Action? initAction, Action? shutdownAction = null) 
            => GLThread!.Enqueue(initAction, shutdownAction);

        public delegate void LoadedEventHandler(object sender, bool isLoaded);
        public event LoadedEventHandler? LoadedChanged;

        public delegate void GLResizeEventHandler(object sender, RectangleF viewPort);
        public event GLResizeEventHandler? GLResize;


        private static readonly ThreadLocal<ConcurrentDictionary<string, FontFile>> _fontCache = new(() => new());

        public static FontFile GetFont(string name)
        {
            var cache = _fontCache.Value!;
            if (cache.TryGetValue(name, out var font))
                return font;
            font = FontLoader.Load(name);
            cache[name] = font;
            return font;
        }

        protected readonly GLControl MyGL = default!;
        private static DebugProc? _debugProcCallback;
        protected int _textShaderProgram;
        protected int _defaultShaderProgram;

        private bool _isLoaded = false;
        public bool IsLoaded
        {
            get => _isLoaded;
            protected set
            {
                if (_isLoaded != value)
                {
                    _isLoaded = value;
                    LoadedChanged?.Invoke(this, _isLoaded);
                }
            }
        }

        protected FontFile? font;
        public FontRenderer fontRenderer = new();

        // --- Methods for Subclasses ---
        protected virtual void Init() { }
        protected virtual void Render() { }
        protected virtual void DrawText() { }
        protected virtual void Shutdown() { }


        [Browsable(false)]
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public RectangleF ViewPort { get; set; } = new(0, 1, 100, 2);

        protected Size GLDisplaySize => MyGL.ClientSize;


        public MyGLControl()
        {
            if (Program.IsRunning == false) { ShowDesignView(); return; }
            InstanceCount++;

            
            MyGL = GLShared.GetControl();
            this.Controls.Add(MyGL);

            GLThread = new(MyGL);

            this.Resize += (s, e) => GLThread?.Enqueue(GL_Resize);

            MyGL.MouseDown += (s, e) => Scheduler.IsPaused = true ;
            MyGL.MouseUp   += (s, e) => Scheduler.IsPaused = false;

            GLThread.RenderAction = RenderMethod;

            CalcFPS = _CalcFPS();
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);

            if (!DesignMode && GLThread != null)
                GLThread.Enqueue(GL_Load, shutdownAction: GL_Shutdown);
        }

        /// <summary>
        /// Final setup method that initializes OpenGL, shaders, and plots.
        /// </summary>
        private void GL_Load()
        {
            if (IsLoaded || IsDisposed) return;


            SetupDebugCallback();

            GL.Viewport(0, 0, MyGL.ClientSize.Width, MyGL.ClientSize.Height);

            GL.ClearColor(BackColor);

            GL.Enable(EnableCap.Blend);
            GL.BlendEquation(BlendEquationMode.FuncAdd);
            GL.BlendFunc(BlendingFactor.SrcAlpha, BlendingFactor.OneMinusSrcAlpha);

            GL.Disable(EnableCap.DepthTest);
            GL.DepthMask(false);

            _defaultShaderProgram = ShaderManager.Get("_default");

            _textShaderProgram = ShaderManager.Get("msdf");
            font = GetFont("Roboto-Medium.json");
            fontRenderer.Font = font;
            fontRenderer.Init();

            fontRenderer.ProjectionMatrix = Matrix4.CreateOrthographicOffCenter(0, MyGL.ClientSize.Width, 0, MyGL.ClientSize.Height, -1, 1);
            fontRenderer.ModelMatrix = Matrix4.Identity;

            if (ParentForm != null)
                ParentForm.FormClosing += (s, e) => IsLoaded = false;

            Init();
            IsLoaded = true;
        }

        private static void SetupDebugCallback()
        {
            // Create the delegate and pin it
            _debugProcCallback = DebugCallback;

            GL.Enable(EnableCap.DebugOutput);
            GL.Enable(EnableCap.DebugOutputSynchronous);
            GL.DebugMessageCallback(_debugProcCallback, IntPtr.Zero);

            // Optional: Filter out Intel/Nvidia chatter
            GL.DebugMessageControl(DebugSourceControl.DontCare, DebugTypeControl.DontCare,
                                   DebugSeverityControl.DontCare, 0, (int[]?)null, true);
        }

        private static void DebugCallback(DebugSource source, DebugType type, int id,
                                          DebugSeverity severity, int length, IntPtr message, IntPtr userParam)
        {
            // Filter: Ignore "Notification" severity (buffer info, etc)
            if (severity == DebugSeverity.DebugSeverityNotification) return;

            // Filter: Ignore "Performance" if you only care about crashes for now
            if (type == DebugType.DebugTypePerformance) return;


            string log =$"[GL {type}]: {Marshal.PtrToStringAnsi(message, length)}";

            Debug.WriteLine(log);

            // Break on errors so you see the stack trace immediately
            if (type == DebugType.DebugTypeError)
            {
//                throw new Exception(log);
            }
        }


        private void GL_Resize()
        {   if (!_isLoaded || IsDisposed) return;

            GL.Viewport(0, 0, MyGL.ClientSize.Width, MyGL.ClientSize.Height);
            fontRenderer.ProjectionMatrix = Matrix4.CreateOrthographicOffCenter(
                0, MyGL.ClientSize.Width,
                0, MyGL.ClientSize.Height,
                -1, 1);

            GLResize?.Invoke(this, ViewPort);
        }

        public void ClearViewport()
        {
            if (!IsLoaded || IsDisposed) return;
            GL.Clear(ClearBufferMask.ColorBufferBit | ClearBufferMask.DepthBufferBit);
        }


        private void RenderMethod()
        {
            if (!IsLoaded || IsDisposed) return;
            
            if (AutoClear)
                GL.Clear(ClearBufferMask.ColorBufferBit | ClearBufferMask.DepthBufferBit);

            Render();

            RenderText();

            CalcFPS();

            // Do not swap buffers here - let GLThread handle it
        }

        private Color _textColour = Color.Black;
        private bool renderingText = false;
        public Color TextColour
        {
            get => _textColour;
            set
            {
                _textColour = value;
                if (renderingText)
                {
                    int colorLocation = GL.GetUniformLocation(_textShaderProgram, "uColor");
                    GL.Uniform4(colorLocation, _textColour);
                }
            }
        }
        private void RenderText()
        {
            if (!IsLoaded || IsDisposed) return;

            GL.UseProgram(_textShaderProgram);

            int uProjLoc = GL.GetUniformLocation(_textShaderProgram, "uProj");
            int uModelLoc = GL.GetUniformLocation(_textShaderProgram, "uModel");

            Matrix4 proj = fontRenderer.ProjectionMatrix;
            Matrix4 model = fontRenderer.ModelMatrix;
            GL.UniformMatrix4(uProjLoc, false, ref proj);
            GL.UniformMatrix4(uModelLoc, false, ref model);

            int textureLocation = GL.GetUniformLocation(_textShaderProgram, "uTexture");
            GL.Uniform1(textureLocation, 0);

            int colorLocation = GL.GetUniformLocation(_textShaderProgram, "uColor");
            GL.Uniform4(colorLocation, TextColour);

            renderingText = true;
            DrawText();
            renderingText = false;
        }

        public void SetTextProjection(Matrix4 projection)
        {
            int uProjLoc = GL.GetUniformLocation(_textShaderProgram, "uProj");
            GL.UniformMatrix4(uProjLoc, false, ref projection);
        }

        public void ClearGL()
        {
            if (!IsLoaded || IsDisposed) return;
            GLThread?.EnqueueSwap(() => ClearViewport());
        }

        public void Close()
        {
            GLThread?.Dispose();     // block until render thread exits
            GLThread = null;
        }

        protected override void OnHandleDestroyed(EventArgs e)
        {
            GLThread?.Dispose();     // block until render thread exits
            GLThread = null;
            base.OnHandleDestroyed(e);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                GLThread?.Dispose(); // block here first
                GLThread = null;
            }
            base.Dispose(disposing);
        }


        protected void GL_Shutdown()
        {
            if (_isLoaded)
            {
                _isLoaded = false;

                Shutdown();
                InstanceCount--;

                if (InstanceCount == 0)
                {
                    fontRenderer.Shutdown();

                    var cache = _fontCache.Value!;
                    foreach (var font in cache.Values)
                        GL.DeleteTexture(font.TextureId);

                    ShaderManager.Dispose();
                }
            }
        }


        protected void RunOnUiThread(MethodInvoker action)
        {
            if (IsDisposed) return;

            if (InvokeRequired)
            {
                if (IsHandleCreated == false) return;
                Invoke(action);
                return;
            }

            action();
        }

        protected T? RunOnUiThread<T>(Func<T> action)
        {
            if (IsDisposed) return default;

            if (InvokeRequired)
            {
                if (IsHandleCreated == false) return default;
                return (T?)Invoke(action);
            }

            return action();
        }




        protected void ShowDesignView()
        {
            var title = this.GetType().Name ?? "MyGLControl";

            this.Controls.Add(new Label
            {
                Text = $"[{title} Design View]",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                ForeColor = Color.Gray,
                Font = new Font("Calibri", 16, FontStyle.Italic)
            });

            this.BackColor = Color.Magenta;

        }

        public double FPS { get; private set; }

        private readonly Action CalcFPS = default!;

        Action _CalcFPS()
        {
            Stopwatch swFPS = Stopwatch.StartNew();
            double lastFrameTime = 0;
            double fpsUpdateTimer = 0;
            int frameCount = 0;

            return () =>
            {
                double now = swFPS.Elapsed.TotalSeconds;

                frameCount++;
                fpsUpdateTimer += now - lastFrameTime;
                lastFrameTime = now;

                if (fpsUpdateTimer >= 0.5)
                {
                    FPS = frameCount / fpsUpdateTimer;
                    frameCount = 0;
                    fpsUpdateTimer = 0;
                }

            };
        }
    }
}
