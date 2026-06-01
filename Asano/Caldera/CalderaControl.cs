using Microsoft.Web.WebView2.Core;

namespace Asano.Caldera
{
    public partial class CalderaControl : UserControl
    {
        private static readonly TimeSpan WebViewShutdownTimeout = TimeSpan.FromSeconds(2);
        private const int MessageFlushIntervalMs = 16;

        public CoreWebView2 CoreWebView2 => web.CoreWebView2;

        public Caldera? Caldera { get => _caldera; }
        private bool _webInitStarted = false;
        private bool _disposedOrClosing = false;

        private readonly DevServer _devServer = new();
        private CoreWebView2Environment? _webViewEnvironment;
        private TaskCompletionSource<bool>? _browserProcessExited;
        private Caldera? _caldera;
        private readonly System.Windows.Forms.Timer _messageFlushTimer;

        public CalderaControl()
        {
            InitializeComponent();
            components ??= new System.ComponentModel.Container();

            _messageFlushTimer = new System.Windows.Forms.Timer(components)
            {
                Interval = MessageFlushIntervalMs,
            };
            _messageFlushTimer.Tick += MessageFlushTimer_Tick;

            if (Program.serialPort == null) return;

            Program.serialPort.ConnectionChanged += SerialPort_ConnectionChanged;
        }

        private void MessageFlushTimer_Tick(object? sender, EventArgs e)
        {
            _caldera?.FlushPendingMessages();
        }

       
        private void SerialPort_ConnectionChanged(TheLib.ConnectionState state)
        {
            if (_disposedOrClosing)
                return;

            if (state == TheLib.ConnectionState.Connected)
                if (Caldera?.IsRunning == true)
                    this.Invoker(web.CoreWebView2.Reload);
        }

        protected override async void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            if (Program.IsRunning == false || _webInitStarted) return;

            _webInitStarted = true;

            try
            {
                await _devServer.EnsureViteRunningAsync();

                if (_disposedOrClosing || IsDisposed || !IsHandleCreated)
                {
                    _devServer.StopViteIfStartedByMe();
                    return;
                }

                await InitWebView();
                if (_disposedOrClosing || IsDisposed || web.CoreWebView2 == null)
                    return;

                _caldera = new Caldera(this);
                _messageFlushTimer.Start();
                web.CoreWebView2.Navigate(DevServer.URL);

            }
            catch (Exception ex)
            {
                if (!_disposedOrClosing && !IsDisposed)
                    MessageBox.Show($"Failed to initialize WebView2: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }


        protected override void OnHandleDestroyed(EventArgs e)
        {
            if (!RecreatingHandle)
                _ = ShutdownAsync(waitForBrowserProcessExit: false);

            base.OnHandleDestroyed(e);
        }

        public Task ShutdownAsync()
            => ShutdownAsync(waitForBrowserProcessExit: true);

        private async Task ShutdownAsync(bool waitForBrowserProcessExit)
        {
            if (_disposedOrClosing)
                return;

            _disposedOrClosing = true;
            _messageFlushTimer.Stop();

            if (Program.serialPort != null)
                Program.serialPort.ConnectionChanged -= SerialPort_ConnectionChanged;

            try
            {
                _caldera?.Dispose();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("Error disposing Caldera bridge: " + ex);
            }
            finally
            {
                _caldera = null;
            }

            var browserProcessExitedTask = waitForBrowserProcessExit
                ? _browserProcessExited?.Task
                : null;

            try
            {
                if (!web.IsDisposed)
                    web.Dispose();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("Error disposing WebView2: " + ex);
            }

            if (browserProcessExitedTask != null)
                await WaitForBrowserProcessExitAsync(browserProcessExitedTask);

            try
            {
                if (_webViewEnvironment != null)
                    _webViewEnvironment.BrowserProcessExited -= WebViewEnvironment_BrowserProcessExited;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("Error detaching WebView2 environment: " + ex);
            }
            finally
            {
                _webViewEnvironment = null;
                _browserProcessExited = null;
            }

            _devServer.StopViteIfStartedByMe();
        }

        private static async Task WaitForBrowserProcessExitAsync(Task browserProcessExitedTask)
        {
            var timeoutTask = Task.Delay(WebViewShutdownTimeout);
            await Task.WhenAny(browserProcessExitedTask, timeoutTask);
        }

        private void WebViewEnvironment_BrowserProcessExited(
            object? sender,
            CoreWebView2BrowserProcessExitedEventArgs e)
        {
            _browserProcessExited?.TrySetResult(true);
        }

        private async Task InitWebView()
        {
            
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Asano",
                "WebView2");

            Directory.CreateDirectory(userDataFolder);

            _webViewEnvironment = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: userDataFolder);

            if (_disposedOrClosing || IsDisposed)
            {
                _webViewEnvironment = null;
                return;
            }

            _browserProcessExited = new TaskCompletionSource<bool>(
                TaskCreationOptions.RunContinuationsAsynchronously);
            _webViewEnvironment.BrowserProcessExited += WebViewEnvironment_BrowserProcessExited;

            await web.EnsureCoreWebView2Async(_webViewEnvironment);
        }
    }
}
