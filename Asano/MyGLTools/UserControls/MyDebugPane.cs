using System.ComponentModel;

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

        protected override void OnResize(EventArgs e)
        {   
            base.OnResize(e);
         
            if (IsHandleCreated == false || log.isInitialized == false) return;
            
            GLThread?.Invoke(() => log.Init());
        }

    }

}
