using Microsoft.Web.WebView2.Core;

namespace Asano.Caldera
{
    public partial class CalderaControl : UserControl
    {
        public CoreWebView2 CoreWebView2 => web.CoreWebView2;

        public Caldera? Caldera { get => _caldera; }
        private bool _webInitStarted = false;
        private bool _disposedOrClosing = false;

        private readonly DevServer _devServer = new();
        private Caldera? _caldera;

        public CalderaControl()
        {
            InitializeComponent();

            if (Program.serialPort == null) return;

            Program.serialPort.ConnectionChanged += SerialPort_ConnectionChanged;
        }

       
        private void SerialPort_ConnectionChanged(TheLib.ConnectionState state)
        {
            if (state == TheLib.ConnectionState.Connected)
                if (Caldera?.IsRunning == true)
                    this.Invoker(web.CoreWebView2.Reload);
        }

        protected override async void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            if (Program.IsRunning == false || _webInitStarted) return;

            await _devServer.EnsureViteRunningAsync();

            _webInitStarted = true;

            try 
            {
                await InitWebView();
                _caldera = new Caldera(this);
                web.CoreWebView2.Navigate(DevServer.URL);

            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to initialize WebView2: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }


        protected override void OnHandleDestroyed(EventArgs e)
        {
            if (!RecreatingHandle && !_disposedOrClosing)
            {
                _disposedOrClosing = true;
                _caldera?.Dispose();
                _caldera = null;
                _devServer.StopViteIfStartedByMe();
            }

            base.OnHandleDestroyed(e);
        }

        private async Task InitWebView()
        {
            
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Asano",
                "WebView2");

            Directory.CreateDirectory(userDataFolder);

            var env = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: userDataFolder);

            await web.EnsureCoreWebView2Async(env);
        }
    }
}
