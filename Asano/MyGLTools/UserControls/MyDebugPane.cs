using Asano.MyGLTools.Fonts;
using OpenTK.Mathematics;
using System.Buffers;
using System.Collections.Concurrent;
using System.ComponentModel;
using System.Drawing.Printing;
using TheLib;


namespace Asano.MyGLTools.UserControls
{
    using Asano.MyGLTools.Helpers;


    [ToolboxItem(true)]
    public partial class MyDebugPane : MyGLControl
    {
        private readonly Log log = default!;
        public MyDebugPane()
        {
            InitializeComponent();

            log = new Log(this);
        }

        protected override void Init()
        {   base.Init();
         
            fontRenderer.Scaling = 0.4f;
            log.Init();
        }

        protected override void Shutdown()
        {
            log.Shutdown();
            base.Shutdown();
        }

        protected override void Render() => log.Update();

        protected override void DrawText() => log.Draw();

    }

}
