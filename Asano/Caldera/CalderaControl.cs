using Microsoft.Web.WebView2.Core;
using System.ComponentModel;

namespace Asano.Caldera
{
    public partial class CalderaControl : UserControl
    {
        [Browsable(false)]
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public IReadOnlyDictionary<string, string?> QueryParameters { get; set; } = new Dictionary<string, string?>();


        private static readonly TimeSpan WebViewShutdownTimeout = TimeSpan.FromSeconds(2);
        private const int MessageFlushIntervalMs = 16;

        public CoreWebView2 CoreWebView2 => web.CoreWebView2;
        public CalderaView View { get; set; } = CalderaView.Circuit;
        public Caldera? Caldera { get => _caldera; }
        private bool _webInitStarted = false;
        private bool _disposedOrClosing = false;

        private readonly DevServer _devServer = new();
        private CoreWebView2Environment? _webViewEnvironment;
        private TaskCompletionSource<bool>? _browserProcessExited;
        private Caldera? _caldera;
        private readonly System.Windows.Forms.Timer _messageFlushTimer;
        private readonly Dictionary<CalderaView, MyCalderaForm> _spawnedForms = [];

        public CalderaControl()
        {
            InitializeComponent();
            components ??= new Container();

            _messageFlushTimer = new System.Windows.Forms.Timer(components)
            {
                Interval = MessageFlushIntervalMs,
            };
            _messageFlushTimer.Tick += MessageFlushTimer_Tick;

            if (Program.SerialPort == null) return;

            Program.SerialPort.ConnectionChanged += SerialPort_ConnectionChanged;
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
                web.CoreWebView2.Navigate(DevServer.GetUrl(View, QueryParameters));

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
            => ShutdownAsync(waitForBrowserProcessExit: false);  // changed to true when finised development

        private async Task ShutdownAsync(bool waitForBrowserProcessExit)
        {
            if (_disposedOrClosing)
                return;

            _disposedOrClosing = true;
            _messageFlushTimer.Stop();

            await ShutdownSpawnedFormsAsync();

            if (Program.SerialPort != null)
                Program.SerialPort.ConnectionChanged -= SerialPort_ConnectionChanged;

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

        internal void OpenView(
            CalderaView view,
            IReadOnlyDictionary<string, string?>? queryParameters = null)
        {
            if (_disposedOrClosing || IsDisposed)
                return;

            if (InvokeRequired)
            {
                BeginInvoke(new MethodInvoker(() => OpenView(view, queryParameters)));
                return;
            }

            if (_spawnedForms.TryGetValue(view, out var existingForm))
            {
                if (!existingForm.IsDisposed)
                {
                    if (queryParameters?.Count > 0)
                        existingForm.NavigateCaldera(queryParameters);

                    ShowExistingForm(existingForm);
                    NotifySpawnedViewsChanged();
                    return;
                }

                _spawnedForms.Remove(view);
            }

            var form = new MyCalderaForm(view, queryParameters);
            form.FormClosed += SpawnedForm_FormClosed;
            _spawnedForms[view] = form;
            NotifySpawnedViewsChanged();
            form.Show(FindForm());
        }

        internal void Navigate(IReadOnlyDictionary<string, string?>? queryParameters = null)
        {
            if (_disposedOrClosing || IsDisposed)
                return;

            if (InvokeRequired)
            {
                BeginInvoke(new MethodInvoker(() => Navigate(queryParameters)));
                return;
            }

            QueryParameters = queryParameters != null
                ? new Dictionary<string, string?>(queryParameters)
                : new Dictionary<string, string?>();

            if (web.CoreWebView2 != null)
                web.CoreWebView2.Navigate(DevServer.GetUrl(View, QueryParameters));
        }

        internal void CloseView(CalderaView view)
        {
            if (_disposedOrClosing || IsDisposed)
                return;

            if (InvokeRequired)
            {
                BeginInvoke(new MethodInvoker(() => CloseView(view)));
                return;
            }

            if (!_spawnedForms.Remove(view, out var form))
            {
                NotifySpawnedViewsChanged();
                return;
            }

            form.FormClosed -= SpawnedForm_FormClosed;
            NotifySpawnedViewsChanged();
            _ = CloseSpawnedFormAsync(form);
        }

        internal void PostActiveViewsChanged()
        {
            if (_disposedOrClosing || IsDisposed)
                return;

            if (InvokeRequired)
            {
                BeginInvoke(new MethodInvoker(PostActiveViewsChanged));
                return;
            }

            NotifySpawnedViewsChanged();
        }

        private void SpawnedForm_FormClosed(object? sender, FormClosedEventArgs e)
        {
            if (sender is not MyCalderaForm form)
                return;

            form.FormClosed -= SpawnedForm_FormClosed;

            if (_spawnedForms.TryGetValue(form.View, out var existingForm)
                && ReferenceEquals(existingForm, form))
            {
                _spawnedForms.Remove(form.View);
            }

            NotifySpawnedViewsChanged();
        }

        private void ShowExistingForm(MyCalderaForm form)
        {
            if (!form.Visible)
                form.Show(FindForm());

            if (form.WindowState == FormWindowState.Minimized)
                form.WindowState = FormWindowState.Normal;

            form.BringToFront();
            form.Activate();
        }

        private void NotifySpawnedViewsChanged()
        {
            _caldera?.PostActiveViewsChanged(_spawnedForms.Keys);
        }

        private async Task CloseSpawnedFormAsync(MyCalderaForm form)
        {
            if (form.IsDisposed)
                return;

            try
            {
                await form.ShutdownCalderaAsync();

                if (!form.IsDisposed)
                    form.Close();

                if (!form.IsDisposed)
                    form.Dispose();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("Error closing spawned Caldera view: " + ex);
            }
        }

        private async Task ShutdownSpawnedFormsAsync()
        {
            if (_spawnedForms.Count == 0)
                return;

            var forms = _spawnedForms.Values.ToArray();
            _spawnedForms.Clear();
            NotifySpawnedViewsChanged();

            foreach (var form in forms)
            {
                form.FormClosed -= SpawnedForm_FormClosed;

                if (form.IsDisposed)
                    continue;

                try
                {
                    await form.ShutdownCalderaAsync();
                    form.Close();
                    form.Dispose();
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine("Error closing spawned Caldera view: " + ex);
                }
            }
        }
    }
}
