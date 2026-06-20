using Asano.MyGLTools.UserControls;
using TheLib;
using TheLib.Packets;
namespace Asano.MyGLTools.Helpers
{
    public class MySerialPort : IDisposable
    {
        private static MySerialPort? _singleton;


        public delegate void ConnectionChangedHandler(ConnectionState state);
        public delegate void BlockPacketHandler(BlockPacket packet);
        public delegate void TextPacketHandler(TextPacket packet);
        public delegate void TelemetryPacketHandler(TelemetryPacket packet);
        public delegate void RawSignalPacketHandler(RawSignalPacket packet);
        public delegate void DebugPacketHandler(DebugPacket packet);
        public delegate void ErrorHandler(Exception exception);
        public delegate void ParsedParametersReceivedHandler(Dictionary<string, double> parameters);

        public event ConnectionChangedHandler? ConnectionChanged;
        public event BlockPacketHandler? BlockPacketReceived;
        public event TextPacketHandler? TextPacketReceived;
        public event TelemetryPacketHandler? TelemetryPacketReceived;
        public event RawSignalPacketHandler? RawSignalPacketReceived;
        public event DebugPacketHandler? DebugPacketReceived;
        public event ErrorHandler? ErrorOccurred;
        public event ParsedParametersReceivedHandler? ParsedParametersReceived;

        public MySerialPort()
        {   if (_singleton != null) throw new InvalidOperationException("Only one instance of MySerialPort is allowed.");
            
            _singleton = this;
            _serialPort = new TeensySerial();

            if (_serialPort == null)
                return;

            _serialPort.ConnectionChanged += OnConnectionChanged;
            _serialPort.DataReceived += OnDataReceived;
            _serialPort.ErrorOccurred += OnErrorOccurred;
        }

        private TeensySerial _serialPort = default!;
        readonly CancellationTokenSource cts = new();

        public bool? IsOpen => _serialPort?.IsOpen;
        public string? PortName => _serialPort?.PortName;

        public void Open(string? portName) => _serialPort.Open(portName);
        public void Close() => _serialPort.Close();
        public void Write(IXCommand command) => _serialPort?.Write(command);
        public async Task OpenAsync() => await _serialPort.OpenAsync();
        public async Task CloseAsync() => await _serialPort.CloseAsync();


        public void Dispose()
        {
            cts.Cancel();
            Close();
            _serialPort?.Dispose();
            GC.SuppressFinalize(this);
        }

        
        public MainForm? mainForm;
 

        private void OnConnectionChanged(ConnectionState state)
        {
            
            AString? str = state switch
            {
                ConnectionState.Connected           => AString.FromString("Connected " + _serialPort.PortName),
                ConnectionState.HandshakeInProgress => AString.FromString("Handshake in progress"),
                ConnectionState.Disconnected        => AString.FromString("Disconnected"),
                ConnectionState.HandshakeSuccessful => null,  // string comes from the device
                _ => null
            };

            mainForm?.EnableDropdown(state == ConnectionState.Disconnected);

            switch (state)
            {
                case ConnectionState.Connected:
                    Log.Clear();
                    Log.Add(str);
                    break;

  
                case ConnectionState.Disconnected:

                    if (MySocketWatcher.ReceivedDisconnect)
                    {
                        Log.Add(AString.FromString("Disconnected by request, waiting for reconnect..."));
                        return;
                    }
                    Log.Add(str);

                    mainForm?.Invoker(() => mainForm.Form1_Shown(this, EventArgs.Empty));
                    break;
            }

            ConnectionChanged?.Invoke(state);
        }

        private void OnDataReceived(IPacket packet)
        {
            switch (packet)
            {
                case BlockPacket      blockPacket:      BlockPacketReceived?.Invoke( blockPacket); break;
                case TelemetryPacket   telePacket:  TelemetryPacketReceived?.Invoke(  telePacket); break;
                case RawSignalPacket signalPacket:  RawSignalPacketReceived?.Invoke(signalPacket); break;
                case DebugPacket      debugPacket:      DebugPacketReceived?.Invoke( debugPacket); break;

                case TextPacket        textPacket:  AddTextPacket(textPacket); break;
            }
        }


        private readonly MyPool<Dictionary<string, double>> parsedPool = new();

        private void AddTextPacket(TextPacket textPacket)
        {
            var parsedValues = parsedPool.Rent();
            bool parsed = MyTextParser.Parse(textPacket.Text, parsedValues);

            if (parsed)
                ParsedParametersReceived?.Invoke(parsedValues);
            else
                Log.Add(textPacket.Text);

            parsedPool.Return(parsedValues);

            if (parsed == false)
                TextPacketReceived?.Invoke(textPacket);
        }

        





        private async void OnErrorOccurred(Exception exception)
        {
            try
            {
                Log.Add(AString.FromString(exception.Message + Environment.NewLine));

                while (!cts.Token.IsCancellationRequested && IsOpen == false) // null check here
                {
                    await Task.Delay(500, cts.Token); // Wait before retrying
                    if (cts.Token.IsCancellationRequested) return;

                    var ports = SerialHelper.GetUSBSerialPorts();
                    if (ports?.Length > 0)
                    {
                        await Task.Delay(200, cts.Token);
                        if (cts.Token.IsCancellationRequested) return;

                        if (IsOpen == false) // check again before opening
                            mainForm?.SetPorts(ports);
                    }
                }

                ErrorOccurred?.Invoke(exception);
            }
            catch (OperationCanceledException) when (cts.IsCancellationRequested)
            {
            }
        }

    }
}