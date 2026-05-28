using Microsoft.Web.WebView2.Core;
using TheLib;
using TheLib.Packets;
using System.Text.Json;
using Asano.MyGLTools.UserControls;

namespace Asano.Caldera
{
    public class Caldera : IDisposable
    {
        protected static TeensySerial SP => Program.serialPort ?? throw new InvalidOperationException("Serial port is not initialized.");
        public CalderaControl Control { get; }
        public CoreWebView2 WebView { get; }
        public bool IsRunning => !_disposed && _ready;

        public static event EventHandler? OnInit;

        public event EventHandler<SetDebugFlagsMessage>? TestStarted;


        public Caldera(CalderaControl control)
        {
            Control = control ?? throw new ArgumentNullException(nameof(control));
            WebView = control.CoreWebView2 ?? throw new InvalidOperationException("WebView2 is not initialized.");

            WebView.WebMessageReceived += WebView_WebMessageReceived;
            WebView.NavigationCompleted += WebView_NavigationCompleted;

            Program.Caldera = this;
            _wipersPoster = CreateWipersPoster();
            _voltagesPoster = CreateVoltagesPoster();
            _statePoster = CreateStatePoster();

            SP.DataReceived += SP_DataReceived;
            SP.ConnectionChanged += SP_ConnectionChanged;
        }

        private bool _needsRefresh = true;
        private int _lastState = -1;
        private readonly object _pendingHeldWipersLock = new();
        private readonly WipersChangedMessage _pendingHeldWipers = new();
        private uint? _pendingHeldWipersState;
        private CommandFlags _pendingHeldWipersFlags = CommandFlags.None;

        private void SP_DataReceived(TheLib.IPacket packet)
        {
            if (IsRunning == false) return;

            switch (packet)
            {
                case BlockPacket blockPacket:
                    if (_needsRefresh)
                    {
                        _needsRefresh = false;
                        if (_lastState < 0) _lastState = (int)blockPacket.State;
                        PostStateChange(_lastState);
                    }
                    TryRestoreHeldWipers(blockPacket);
                    break;
                case DebugPacket debugPacket:
                    if (_lastState < 0 || (int)debugPacket.State != _lastState)
                      PostStateChange((int)debugPacket.State, force: true);
                    break;
            }
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

        public bool PostWipersChange(WipersChangedMessage wipers, bool force = false)
            => _wipersPoster.Post(wipers, force);

        public bool PostVoltagesChange(VoltagesChangedMessage voltages)
            => _voltagesPoster.Post(voltages);

        public bool PostStateChange(int state, bool force = false)
        {
            _lastState = state;
            return _statePoster.Post(new StateChangedMessage((HeadState)state), force);
        }

        private bool CanPostMessages()
            => !_disposed && _ready && !Control.IsDisposed && Control.IsHandleCreated;

        private BufferedPoster<WipersChangedMessage> CreateWipersPoster()
            => new(
                Control,
                CanPostMessages,
                () => new WipersChangedMessage(),
                static (target, source) => target.CopyFrom(source),
                static message => message.IsValid,
                static message => CalderaJson.CreateWipersChanged(message.Wipers),
                TryPostJson);

        private BufferedPoster<VoltagesChangedMessage> CreateVoltagesPoster()
            => new(
                Control,
                CanPostMessages,
                () => new VoltagesChangedMessage(),
                static (target, source) => target.CopyFrom(source),
                static message => message.IsValid,
                static message => CalderaJson.CreateVoltagesChanged(message.Voltages),
                TryPostJson);

        private BufferedPoster<StateChangedMessage> CreateStatePoster()
            => new(
                Control,
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
            OnInit?.Invoke(this, EventArgs.Empty);
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
            }
        }

        private static void HandleWebMessageString(string? message)
        {
            if (message == "dataReady")
            {
                // Reserved for a future frontend readiness handshake.
            }
        }

        private static void HandleSetWipersMessage(JsonElement root)
        {
            var message = root.Deserialize<SetWipersMessage>();
            if (message?.Wipers == null) return;

            Program.serialPort?.Write(CreateSetWipersCommand(message.Wipers, message.CMDflags));
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

            Program.serialPort?.Write(xCMD);
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

            Program.serialPort?.Write(xCMD);
        }

        private static byte ClampWiper(int value)
            => (byte)Math.Clamp(value, byte.MinValue, byte.MaxValue);

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
                Program.serialPort?.Write(restoreCommand);
        }

        private void ClearHeldWiperRestore()
        {
            lock (_pendingHeldWipersLock)
                _pendingHeldWipersState = null;
        }

        private static bool TryCopyLatestWipers(WipersChangedMessage target)
        {
            var activeChart = MyChart.ActiveChart;
            if (activeChart == null) return false;

            var voltages = new VoltagesChangedMessage();
            activeChart.CopyLatestCalderaMessages(target, voltages);
            return target.IsValid;
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

            if (Program.serialPort != null)
            {
                Program.serialPort.DataReceived -= SP_DataReceived;
                Program.serialPort.ConnectionChanged -= SP_ConnectionChanged;
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

            if (ReferenceEquals(Program.Caldera, this))
                Program.Caldera = null;

            GC.SuppressFinalize(this);
        }

    }
}
