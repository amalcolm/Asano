using OpenTK.GLControl;
using OpenTK.Windowing.Common;
using OpenTK.Windowing.Desktop;

namespace Asano.MyGLTools.Helpers
{
    public static class GLShared
    {
        public static IGLFWGraphicsContext? SharedContext { get; set; } = null;

        public static GLControl GetControl()
        {
            GLControlSettings settings = new()
            {
                API = ContextAPI.OpenGL,
                APIVersion = new Version(4, 6),
                Flags = ContextFlags.Debug | ContextFlags.ForwardCompatible,
                NumberOfSamples = 4,
                Profile = ContextProfile.Core,
            };

            if (SharedContext == null)
            {
                var control = new GLControl(settings) { Dock = DockStyle.Fill };
               // control.MakeCurrent();
                SharedContext = control.Context;
                return control;
            }

            settings.SharedContext = SharedContext;
            return new GLControl(settings) { Dock = DockStyle.Fill };
        }
    }
}