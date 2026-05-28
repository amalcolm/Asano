
namespace Asano.Caldera
{
    public partial class MyCalderaForm : Form
    {
        private bool _shutdownComplete;
        private bool _closeAfterShutdown;
        private Task? _shutdownTask;

        public MyCalderaForm()
        {
            InitializeComponent();



            switch (Environment.MachineName)
            {
                case "BOX":
                    this.StartPosition = FormStartPosition.Manual;
                    this.Location = new Point(3840, -200);
                    this.WindowState = FormWindowState.Maximized;
                    calderaControl.Height = 1280;
                    break;

                case "PSYC-ANDREW":
                    this.WindowState = FormWindowState.Normal;
                    this.StartPosition = FormStartPosition.Manual;
                    this.Location = new Point(2560, 0);
                    this.Size = new Size(1280, 2160-32);
                    break;
            }
        }

        public Task ShutdownCalderaAsync() => _shutdownTask ??= ShutdownCalderaCoreAsync();

        protected override async void OnFormClosing(FormClosingEventArgs e)
        {
            if (_shutdownComplete) { base.OnFormClosing(e); return; }

            e.Cancel = true;

            if (_closeAfterShutdown) return;

            _closeAfterShutdown = true;
            try   { await ShutdownCalderaAsync(); }
            catch (Exception ex) { System.Diagnostics.Debug.WriteLine("Error during Caldera shutdown: " + ex); }
            finally { BeginCloseAfterShutdown(); }
        }

        private async Task ShutdownCalderaCoreAsync()
        {
            try     { await calderaControl.ShutdownAsync(); }
            finally { _shutdownComplete = true;             }
        }

        private void BeginCloseAfterShutdown()
        {
            if (IsDisposed)
                return;

            BeginInvoke(new MethodInvoker(Close));
        }
    }
}
