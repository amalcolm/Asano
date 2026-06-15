using Microsoft.Web.WebView2.Core;
using TheLib;
using TheLib.Packets;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Asano.MyGLTools.UserControls;
using Asano.MyGLTools.Helpers;

namespace Asano.Caldera
{
    public class Caldera : IDisposable
    {
        protected static MySerialPort SP => Program.SerialPort ?? throw new InvalidOperationException("Serial port is not initialized.");
        private static readonly Encoding CsvEncoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
        private static readonly object ViewsLock = new();
        private static readonly List<Caldera> Views = [];
        private static readonly object AnalysisReplayLock = new();
        private static readonly List<string> AnalysisReplayMessages = [];
        private static string? LatestTestStatusMessage;
        private const int MaxAnalysisReplayMessages = 20000;

        public CalderaControl Control { get; }
        public CoreWebView2 WebView { get; }
        public CalderaView View { get; }
        public bool IsRunning => !_disposed && _ready;
        private bool IsPrimaryBridge => View == CalderaView.Circuit;

        public event EventHandler<SetDebugFlagsMessage>? TestStarted;


        public Caldera(CalderaControl control)
        {
            Control = control ?? throw new ArgumentNullException(nameof(control));
            WebView = control.CoreWebView2 ?? throw new InvalidOperationException("WebView2 is not initialized.");
            View = control.View;

            WebView.WebMessageReceived += WebView_WebMessageReceived;
            WebView.NavigationCompleted += WebView_NavigationCompleted;

            RegisterView(this);

            if (IsPrimaryBridge)
                Program.Caldera = this;

            _wipersPoster = CreateWipersPoster();
            _voltagesPoster = CreateVoltagesPoster();
            _statePoster = CreateStatePoster();

            if (IsPrimaryBridge)
            {
                ObserveBlockPackets();
                SP.DebugPacketReceived += SP_DebugPacketReceived;
                SP.ConnectionChanged += SP_ConnectionChanged;
            }
        }

        private static void RegisterView(Caldera caldera)
        {
            lock (ViewsLock)
                Views.Add(caldera);
        }

        private static void UnregisterView(Caldera caldera)
        {
            lock (ViewsLock)
                Views.Remove(caldera);
        }

        private static Caldera[] GetViews()
        {
            lock (ViewsLock)
                return [.. Views];
        }

        private bool _needsRefresh = true;
        private int _lastState = -1;
        private readonly object _pendingHeldWipersLock = new();
        private readonly WipersChangedMessage _pendingHeldWipers = new();
        private uint? _pendingHeldWipersState;
        private CommandFlags _pendingHeldWipersFlags = CommandFlags.None;
        private readonly object _blockPacketSubscriptionLock = new();
        private bool _observingBlockPackets;

        private void ObserveBlockPackets()
        {
            if (!IsPrimaryBridge)
                return;

            lock (_blockPacketSubscriptionLock)
            {
                if (_observingBlockPackets)
                    return;

                SP.BlockPacketReceived += SP_BlockPacketReceived;
                _observingBlockPackets = true;
            }
        }

        private void StopObservingBlockPackets()
        {
            if (!IsPrimaryBridge)
                return;

            lock (_blockPacketSubscriptionLock)
            {
                if (!_observingBlockPackets)
                    return;

                SP.BlockPacketReceived -= SP_BlockPacketReceived;
                _observingBlockPackets = false;
            }
        }

        private void StopObservingBlockPacketsIfIdle()
        {
            if (_needsRefresh || HasPendingHeldWiperRestore())
                return;

            StopObservingBlockPackets();
        }

        private bool HasPendingHeldWiperRestore()
        {
            lock (_pendingHeldWipersLock)
                return _pendingHeldWipersState.HasValue;
        }

        private void SP_BlockPacketReceived(BlockPacket packet)
        {
            if (IsRunning == false) return;

            if (_needsRefresh)
            {
                _needsRefresh = false;

                if (IsSingleStateMode)
                {
                    if (_lastState < 0) _lastState = (int)packet.State;
                    PostStateChange(_lastState);
                }
            }
            TryRestoreHeldWipers(packet);
            StopObservingBlockPacketsIfIdle();
        }

        private void SP_DebugPacketReceived(DebugPacket debugPacket)
        {
            if (!IsSingleStateMode)
                return;

            if (_lastState < 0 || (int)debugPacket.State != _lastState)
                PostStateChange((int)debugPacket.State, force: true);
        }

        internal void HandlePacket(IPacket packet)
        {
            switch (packet)
            {
                case NoisePacket noisePacket:
                    // Handle noise packet if needed
                    break;
            }
        }

        protected void SP_ConnectionChanged(ConnectionState state)
        {
            switch (state)
            {
                case ConnectionState.HandshakeSuccessful:
                    _ready = true;
                    _needsRefresh = true;
                    ObserveBlockPackets();
                    break;
                case ConnectionState.Disconnected:
                    _ready = false;
                    break;
            }
        }
        private bool _disposed;
        private bool _ready;
        private readonly BufferedPoster<WipersChangedMessage> _wipersPoster;
        private readonly BufferedPoster<VoltagesChangedMessage> _voltagesPoster;
        private readonly BufferedPoster<StateChangedMessage> _statePoster;
        private static bool IsSingleStateMode => Config.DEBUG_MODE == "SINGLE_STATE";

        public bool PostWipersChange(WipersChangedMessage wipers, bool force = false)
            => PostToViews(caldera => caldera._wipersPoster.Post(wipers, force));

        public bool PostVoltagesChange(VoltagesChangedMessage voltages)
            => PostToViews(caldera => caldera._voltagesPoster.Post(voltages));

        public bool PostStateChange(int state, bool force = false)
        {
            _lastState = state;
            WriteActiveStateCommand(state);
            var message = new StateChangedMessage((HeadState)state);

            return PostToViews(caldera =>
            {
                caldera._lastState = state;
                return caldera._statePoster.Post(message, force);
            });
        }

        private static bool PostToViews(Func<Caldera, bool> post)
        {
            bool hasPrimaryBridge = false;
            bool postedToPrimaryBridge = false;
            bool postedToAnyView = false;

            foreach (var caldera in GetViews())
            {
                bool posted = post(caldera);

                postedToAnyView |= posted;

                if (caldera.IsPrimaryBridge)
                {
                    hasPrimaryBridge = true;
                    postedToPrimaryBridge |= posted;
                }
            }

            return hasPrimaryBridge ? postedToPrimaryBridge : postedToAnyView;
        }

        internal void FlushPendingMessages()
        {
            _statePoster.Flush();
            _wipersPoster.Flush();
            _voltagesPoster.Flush();
        }

        private bool CanPostMessages()
            => !_disposed && _ready && !Control.IsDisposed && Control.IsHandleCreated;

        private BufferedPoster<WipersChangedMessage> CreateWipersPoster()
            => new(
                CanPostMessages,
                () => new WipersChangedMessage(),
                static (target, source) => target.CopyFrom(source),
                static message => message.IsValid,
                static message => CalderaJson.CreateWipersChanged(message.Wipers),
                TryPostJson);

        private BufferedPoster<VoltagesChangedMessage> CreateVoltagesPoster()
            => new(
                CanPostMessages,
                () => new VoltagesChangedMessage(),
                static (target, source) => target.CopyFrom(source),
                static message => message.IsValid,
                static message => CalderaJson.CreateVoltagesChanged(message.Voltages),
                TryPostJson);

        private BufferedPoster<StateChangedMessage> CreateStatePoster()
            => new(
                CanPostMessages,
                () => new StateChangedMessage(HeadState.UNSET),
                static (target, source) => target.CopyFrom(source),
                static _ => true,
                static message => CalderaJson.CreateStateChanged(message),
                TryPostJson);

        private bool TryPostJson(string json)
        {
            try
            {
                WebView.PostWebMessageAsJson(json);
                return true;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to post message to WebView: {ex.Message}");
                return false;
            }
        }

        private void WebView_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (!e.IsSuccess) { _ready = false; return; }

            WebView.Settings.IsWebMessageEnabled = true;
            _ready = true;
        }

        private void WebView_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                HandleWebMessage(e.WebMessageAsJson);
            }
            catch (JsonException ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to parse WebView message: {ex.Message}");
            }
        }

        private void HandleWebMessage(string json)
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;

            if (root.ValueKind == JsonValueKind.String)
            {
                HandleWebMessageString(root.GetString());
                return;
            }

            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("type", out var typeElement)
                || typeElement.ValueKind != JsonValueKind.String)
            {
                return;
            }

            switch (typeElement.GetString())
            {
                case "ready":
                    _needsRefresh = true;
                    if (_lastState >= 0)
                    {
                        PostStateChange(_lastState, force: true);
                        _needsRefresh = false;
                    }

                    if (View == CalderaView.Analysis)
                        ReplayAnalysisMessagesTo(this);
                    else if (View == CalderaView.Circuit)
                        Control.PostActiveViewsChanged();

                    break;
                case "getWipers":
                    HandleGetWipersMessage();
                    break;
                case "setWipers":
                    HandleSetWipersMessage(root);
                    break;
                case "getState":
                    HandleGetSateMessage();
                    break;
                case "setState":
                    HandleSetStateMessage(root);
                    break;
                case "setDebugFlags":
                    HandleSetDebugFlagsMessage(root);
                    break;
                case "saveCsv":
                    HandleSaveCsvMessage(root);
                    break;
                case "openView":
                    HandleOpenViewMessage(root);
                    break;
                case "requestLoadCsv":
                    HandleRequestLoadCsvMessage(root);
                    break;
                case "closeView":
                    HandleCloseViewMessage(root);
                    break;
                case "getActiveViews":
                    Control.PostActiveViewsChanged();
                    break;
                case "moveMousePointer":
                    HandleMoveMousePointerMessage(root);
                    break;
                case "startTest":
                case "stopTest":
                    ForwardWebMessage(CalderaView.Circuit, root.GetRawText());
                    break;
                case "analysisClear":
                case "analysisSample":
                    RecordAnalysisReplayMessage(typeElement.GetString(), root.GetRawText());
                    ForwardWebMessage(CalderaView.Analysis, root.GetRawText());
                    break;
                case "testStatus":
                    RecordLatestTestStatusMessage(root.GetRawText());
                    ForwardWebMessage(CalderaView.Analysis, root.GetRawText());
                    break;
            }
        }

        private static void HandleWebMessageString(string? message)
        {
            if (message == "dataReady")
            {
                // Reserved for a future frontend readiness handshake.
            }
        }

        private void HandleMoveMousePointerMessage(JsonElement root)
        {
            if (!TryGetFiniteDoubleProperty(root, "screenX", out var screenX)
                || !TryGetFiniteDoubleProperty(root, "screenY", out var screenY))
            {
                return;
            }

            var virtualScreen = SystemInformation.VirtualScreen;
            var x = (int)Math.Clamp(Math.Round(screenX), virtualScreen.Left, virtualScreen.Right - 1);
            var y = (int)Math.Clamp(Math.Round(screenY), virtualScreen.Top, virtualScreen.Bottom - 1);
            Action moveCursor = () =>
            {
                System.Windows.Forms.Cursor.Position = new Point(x, y);
            };

            if (Control.InvokeRequired)
                Control.BeginInvoke(moveCursor);
            else
                moveCursor();
        }

        private void HandleOpenViewMessage(JsonElement root)
        {
            var viewName = GetStringProperty(root, "view");

            if (!CalderaViewNames.TryParse(viewName, out var view))
                view = CalderaView.Analysis;

            Control.OpenView(view, GetOpenViewQueryParameters(root));
        }

        private static Dictionary<string, string?> GetOpenViewQueryParameters(JsonElement root)
        {
            var queryParameters = new Dictionary<string, string?>();
            string? loadFile = GetStringProperty(root, "loadFile");

            if (!string.IsNullOrWhiteSpace(loadFile))
                queryParameters["loadFile"] = loadFile;

            if (GetBooleanishProperty(root, "liveTest"))
                queryParameters["liveTest"] = "1";

            string? test = GetStringProperty(root, "test");

            if (!string.IsNullOrWhiteSpace(test))
                queryParameters["test"] = test;

            string? modelType = GetStringProperty(root, "modelType");

            if (!string.IsNullOrWhiteSpace(modelType))
                queryParameters["modelType"] = modelType;

            if (GetBooleanishProperty(root, "compare"))
                queryParameters["compare"] = "1";

            return queryParameters;
        }

        private void HandleCloseViewMessage(JsonElement root)
        {
            var viewName = GetStringProperty(root, "view");

            if (!CalderaViewNames.TryParse(viewName, out var view))
                view = CalderaView.Analysis;

            Control.CloseView(view);
        }

        private void HandleRequestLoadCsvMessage(JsonElement root)
        {
            string? filename = GetStringProperty(root, "filename");
            if (!string.IsNullOrEmpty(filename) && File.Exists(filename))
            {
                PostLoadCsv(filename, File.ReadAllText(filename, CsvEncoding));
                return;
            }

            using OpenFileDialog dialog = new OpenFileDialog
            {
                Filter = "CSV files (*.csv)|*.csv|All files (*.*)|*.*",
                Title = "Load Caldera CSV"
            };

            if (dialog.ShowDialog(Control.FindForm()) == DialogResult.OK)
            {
                PostLoadCsv(dialog.FileName, File.ReadAllText(dialog.FileName, CsvEncoding));
            }
        }

        private void PostLoadCsv(string filename, string content)
        {
            var json = JsonSerializer.Serialize(new
            {
                type = "loadCsv",
                filename,
                content
            });
            TryPostJson(json);
        }

        internal bool PostActiveViewsChanged(IEnumerable<CalderaView> activeViews)
        {
            var viewNames = activeViews
                .Select(CalderaViewNames.ToQueryValue)
                .ToArray();
            var json = JsonSerializer.Serialize(new
            {
                type = "activeViews",
                views = viewNames,
            });

            return TryPostJson(json);
        }

        private static bool ForwardWebMessage(CalderaView view, string json)
        {
            bool posted = false;

            foreach (var caldera in GetViews())
            {
                if (caldera.View != view)
                    continue;

                posted |= caldera.TryPostJson(json);
            }

            return posted;
        }

        private static void RecordAnalysisReplayMessage(string? type, string json)
        {
            lock (AnalysisReplayLock)
            {
                if (type == "analysisClear")
                    AnalysisReplayMessages.Clear();

                AnalysisReplayMessages.Add(json);

                while (AnalysisReplayMessages.Count > MaxAnalysisReplayMessages)
                    AnalysisReplayMessages.RemoveAt(0);
            }
        }

        private static void RecordLatestTestStatusMessage(string json)
        {
            lock (AnalysisReplayLock)
                LatestTestStatusMessage = json;
        }

        private static void ReplayAnalysisMessagesTo(Caldera caldera)
        {
            string[] messages;
            string? latestTestStatusMessage;

            lock (AnalysisReplayLock)
            {
                messages = [.. AnalysisReplayMessages];
                latestTestStatusMessage = LatestTestStatusMessage;
            }

            foreach (var message in messages)
                caldera.TryPostJson(message);

            if (latestTestStatusMessage != null)
                caldera.TryPostJson(latestTestStatusMessage);
        }

        private static void HandleSetWipersMessage(JsonElement root)
        {
            var message = root.Deserialize<SetWipersMessage>();
            if (message?.Wipers == null) return;

            if (TryGetActiveChartState(out var state))
                WriteActiveStateCommand(state);

            Program.SerialPort?.Write(CreateSetWipersCommand(message.Wipers, message.CMDflags));
        }

        private void HandleGetSateMessage()
        {
            PostStateChange(_lastState < 0 ? unchecked((int)HeadState.UNSET) : _lastState);
        }

        private void HandleGetWipersMessage()
        {
            var activeChart = MyChart.ActiveChart;
            if (activeChart == null) return;

            var wipers = new WipersChangedMessage();
            var voltages = new VoltagesChangedMessage();
            activeChart.CopyLatestCalderaMessages(wipers, voltages);

            if (wipers.IsValid)
                PostWipersChange(wipers, force: true);

            if (voltages.IsValid)
                PostVoltagesChange(voltages);
        }

        private void HandleSetStateMessage(JsonElement root)
        {
            var message = root.Deserialize<SetStateMessage>();
            if (message == null) return;

            XCMD_SetState xCMD = new()
            {
                cmdFlags = message.CMDflags,
                state    = (uint)message.State,
            };

            ScheduleHeldWiperRestore(message.CMDflags, xCMD.state);

            Program.SerialPort?.Write(xCMD);
        }

        private void HandleSetDebugFlagsMessage(JsonElement root)
        {
            var message = root.Deserialize<SetDebugFlagsMessage>();
            if (message == null) return;

            if (message.HasTestFlag)
                TestStarted?.Invoke(this, message);

            XCMD_SetDebugFlags xCMD = new()
            {
                cmdFlags = message.CMDflags,
            };

            Program.SerialPort?.Write(xCMD);
        }

        private void HandleSaveCsvMessage(JsonElement root)
        {
            string? content = GetStringProperty(root, "content");
            if (content == null) return;

            string filename = GetStringProperty(root, "filename") ?? "Dataset.csv";
            ProcessCsvSaveRequest(filename, content);
        }

        protected virtual bool ProcessCsvSaveRequest(string suggestedFileName, string csvContent)
            => SaveCsvWithDialog(suggestedFileName, csvContent);

        protected virtual bool SaveCsvWithDialog(string suggestedFileName, string csvContent)
        {
            using SaveFileDialog dialog = CreateCsvSaveDialog(suggestedFileName);

            if (dialog.ShowDialog(Control.FindForm()) != DialogResult.OK)
                return false;

            try
            {
                File.WriteAllText(dialog.FileName, csvContent, CsvEncoding);
                return true;
            }
            catch (Exception ex) when (ex is IOException
                                   || ex is NotSupportedException
                                   || ex is UnauthorizedAccessException)
            {
                ShowCsvSaveError(ex);
                return false;
            }
        }

        protected virtual SaveFileDialog CreateCsvSaveDialog(string suggestedFileName)
        {
            var dialog = new SaveFileDialog
            {
                AddExtension = true,
                DefaultExt = "csv",
                FileName = NormaliseCsvFilename(suggestedFileName),
                Filter = "CSV files (*.csv)|*.csv|All files (*.*)|*.*",
                OverwritePrompt = true,
                RestoreDirectory = true,
                Title = "Save Caldera CSV",
            };
            string? initialDirectory = GetCsvSaveInitialDirectory();

            if (!string.IsNullOrWhiteSpace(initialDirectory))
                dialog.InitialDirectory = initialDirectory;

            return dialog;
        }

        protected virtual string? GetCsvSaveInitialDirectory()
            => null;

        protected virtual void ShowCsvSaveError(Exception ex)
            => MessageBox.Show(
                Control.FindForm(),
                $"Failed to save CSV:\r\n{ex.Message}",
                "Save Caldera CSV",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);

        private static byte ClampWiper(int value)
            => (byte)Math.Clamp(value, byte.MinValue, byte.MaxValue);

        private static string? GetStringProperty(JsonElement root, string propertyName)
            => root.TryGetProperty(propertyName, out var element) && element.ValueKind == JsonValueKind.String
                ? element.GetString()
                : null;

        private static bool GetBooleanishProperty(JsonElement root, string propertyName)
        {
            if (!root.TryGetProperty(propertyName, out var element))
                return false;

            return element.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Number => element.TryGetInt32(out var value) && value != 0,
                JsonValueKind.String => IsTruthyString(element.GetString()),
                _ => false,
            };
        }

        private static bool IsTruthyString(string? value)
            => string.Equals(value, "1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(value, "true", StringComparison.OrdinalIgnoreCase)
                || string.Equals(value, "yes", StringComparison.OrdinalIgnoreCase);

        private static bool TryGetFiniteDoubleProperty(JsonElement root, string propertyName, out double value)
        {
            value = 0;

            if (!root.TryGetProperty(propertyName, out var element))
                return false;

            if (element.ValueKind == JsonValueKind.Number)
                return element.TryGetDouble(out value) && double.IsFinite(value);

            if (element.ValueKind == JsonValueKind.String)
                return double.TryParse(
                    element.GetString(),
                    NumberStyles.Float,
                    CultureInfo.InvariantCulture,
                    out value) && double.IsFinite(value);

            return false;
        }

        private static string NormaliseCsvFilename(string? suggestedFileName)
        {
            string? filename = Path.GetFileName(suggestedFileName);

            if (string.IsNullOrWhiteSpace(filename))
                filename = "Dataset.csv";

            foreach (char invalid in Path.GetInvalidFileNameChars())
                filename = filename.Replace(invalid, '_');

            return string.Equals(Path.GetExtension(filename), ".csv", StringComparison.OrdinalIgnoreCase)
                ? filename
                : Path.ChangeExtension(filename, ".csv") ?? $"{filename}.csv";
        }

        private void ScheduleHeldWiperRestore(CommandFlags flags, uint state)
        {
            if (!HasCommandFlag(flags, CommandFlags.HoldWipers)
                || HasCommandFlag(flags, CommandFlags.Run__findSignal))
            {
                ClearHeldWiperRestore();
                return;
            }

            var wipers = new WipersChangedMessage();
            if (!TryCopyLatestWipers(wipers))
            {
                ClearHeldWiperRestore();
                return;
            }

            lock (_pendingHeldWipersLock)
            {
                _pendingHeldWipers.CopyFrom(wipers);
                _pendingHeldWipersFlags = flags;
                _pendingHeldWipersState = state;
            }

            ObserveBlockPackets();
        }

        private void TryRestoreHeldWipers(BlockPacket blockPacket)
        {
            XCMD_SetWipers? restoreCommand = null;
            var state = unchecked((uint)(int)blockPacket.State);

            lock (_pendingHeldWipersLock)
            {
                if (_pendingHeldWipersState != state || !_pendingHeldWipers.IsValid)
                    return;

                restoreCommand = CreateSetWipersCommand(_pendingHeldWipers.Wipers, _pendingHeldWipersFlags);
                _pendingHeldWipersState = null;
            }

            if (restoreCommand != null)
            {
                WriteActiveStateCommand(state);
                Program.SerialPort?.Write(restoreCommand);
            }
        }

        private void ClearHeldWiperRestore()
        {
            lock (_pendingHeldWipersLock)
                _pendingHeldWipersState = null;

            StopObservingBlockPacketsIfIdle();
        }

        private static bool TryCopyLatestWipers(WipersChangedMessage target)
        {
            var activeChart = MyChart.ActiveChart;
            if (activeChart == null) return false;

            var voltages = new VoltagesChangedMessage();
            activeChart.CopyLatestCalderaMessages(target, voltages);
            return target.IsValid;
        }

        private static bool TryGetActiveChartState(out uint state)
        {
            state = 0;
            var activeChart = MyChart.ActiveChart;
            if (activeChart?.ChartState.HasValue != true) return false;

            var chartState = unchecked((uint)activeChart.ChartState.Value);
            if (chartState == unchecked((uint)HeadState.UNSET)) return false;

            state = chartState;
            return true;
        }

        private static void WriteActiveStateCommand(int state)
        {
            if (state < 0 || unchecked((uint)state) == unchecked((uint)HeadState.UNSET))
                return;

            WriteActiveStateCommand(unchecked((uint)state));
        }

        private static void WriteActiveStateCommand(uint state)
        {
            Program.SerialPort?.Write(new XCMD_SetActiveState
            {
                state = state,
            });
        }

        private static XCMD_SetWipers CreateSetWipersCommand(WiperValues wipers, CommandFlags flags)
            => new()
            {
                cmdFlags = flags,
                top      = ClampWiper(wipers.Top),
                bot      = ClampWiper(wipers.Bot),
                mid      = ClampWiper(wipers.Mid),
                offset   = ClampWiper(wipers.Offset),
                gain     = ClampWiper(wipers.Gain),
            };

        private static bool HasCommandFlag(CommandFlags flags, CommandFlags flag)
            => (flags & flag) != CommandFlags.None;

        public void Dispose()
        {   if (_disposed) return;

            _disposed = true;
            _ready = false;

            if (IsPrimaryBridge && SP != null)
            {
                StopObservingBlockPackets();
                SP.DebugPacketReceived -= SP_DebugPacketReceived;
                SP.ConnectionChanged   -= SP_ConnectionChanged;
            }

            try
            {
                WebView.WebMessageReceived  -= WebView_WebMessageReceived;
                WebView.NavigationCompleted -= WebView_NavigationCompleted;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("Error detaching Caldera WebView events: " + ex);
            }

            _wipersPoster.Clear();
            _voltagesPoster.Clear();
            _statePoster.Clear();
            UnregisterView(this);

            if (ReferenceEquals(Program.Caldera, this))
                Program.Caldera = GetViews().FirstOrDefault(caldera => caldera.IsPrimaryBridge);

            GC.SuppressFinalize(this);
        }

    }
}
