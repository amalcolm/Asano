using Timer = System.Windows.Forms.Timer;

namespace Asano
{
    using Asano.Caldera;
    using Asano.MyGLTools.Helpers;
    using TheLib;

    public partial class MainForm : Form
    {
        readonly TeensySerial? SP = Program.serialPort;
        readonly CancellationTokenSource cts = new();
        private bool _closeStarted;
        private bool _shutdownComplete;



        public MainForm()
        {
            InitializeComponent();

            switch (Environment.MachineName)
            {
                case "BOX":
                    this.StartPosition = FormStartPosition.Manual;
                    this.Location = new Point(-1420, -100);
                    this.WindowState = FormWindowState.Maximized;
                    break;

                case "PSYC-ANDREW":
                    this.StartPosition = FormStartPosition.Manual;
                    this.Location = new Point(180, 100);
                    break;
            }

            monitorTimer.Tick += (s, e) =>
            {
                var ports = SerialHelper.GetUSBSerialPorts();
                if (ports.Length > 0)
                {
                    monitorTimer.Stop();
                    this.Invoker(() =>
                    {
                        cbPorts.Items.Clear();
                        cbPorts.Items.AddRange(ports);
                        cbPorts.SelectedIndex = cbPorts.Items.Count - 1;
                    });
                }
            };

            Caldera.Caldera.OnInit += Caldera_OnInit;

            multiChart.ChartCountChanged += MultiChart_ChartCountChanged;

            if (SP == null) return;

            SP.DataReceived      += SP_DataReceived;
            SP.ConnectionChanged += SP_ConnectionChanged;
            SP.ErrorOccurred     += SP_ErrorOccurred;

            multiChart.Clear();
        }

        private void Caldera_OnInit(object? sender, EventArgs e)
        {
            if (sender is not Caldera.Caldera caldera) return;

            caldera.TestStarted += (s, e) => dbg.Clear();
        }

        protected override async void OnFormClosing(FormClosingEventArgs e)
        {
            if (!_shutdownComplete)
            {
                e.Cancel = true;  if (_closeStarted) return;

                _closeStarted = true;

                try   {await ShutdownAsync(); }
                catch (Exception ex) { System.Diagnostics.Debug.WriteLine("Error during shutdown: " + ex); }
                finally { _shutdownComplete = true; BeginCloseAfterShutdown(); }
                return;
            }

            base.OnFormClosing(e);
        }

        private void CalderaForm_FormClosed(object? sender, FormClosedEventArgs e)
        {
            if (!_closeStarted)
                Close();
        }

        private async Task ShutdownAsync()
        {
            monitorTimer.Stop();
            cts.Cancel();

            Caldera.Caldera.OnInit -= Caldera_OnInit;
            multiChart.ChartCountChanged -= MultiChart_ChartCountChanged;

            if (SP != null)
            {
                SP.DataReceived      -= SP_DataReceived;
                SP.ConnectionChanged -= SP_ConnectionChanged;
                SP.ErrorOccurred     -= SP_ErrorOccurred;
            }

            await ShutdownCalderaFormAsync();
        }

        private void BeginCloseAfterShutdown()
        {
            if (IsDisposed) return;

            BeginInvoke(new MethodInvoker(Close));
        }

        private async Task ShutdownCalderaFormAsync()
        {
            var form = calderaForm;
            if (form == null)
                return;

            calderaForm = null;
            form.FormClosed -= CalderaForm_FormClosed;

            if (form.IsDisposed)
                return;

            await form.ShutdownCalderaAsync();
            form.Close();
            form.Dispose();
        }

        private readonly Timer monitorTimer = new() { Interval = 1000, Enabled = false };


        readonly MyPool<Dictionary<string, double>> parsedPool = new();

        private void SP_DataReceived(TheLib.IPacket packet)
        {
            if (IsHandleCreated == false) return;

            switch (packet)
            {
                case BlockPacket    blockPacket: AddBlockPacket(blockPacket); break;
                case TextPacket      textPacket:  AddTextPacket( textPacket); break;
                case TelemetryPacket telePacket:  AddTelePacket( telePacket); break;
            }
        }

        private void AddBlockPacket(BlockPacket blockPacket)
        {
            if (blockPacket.Count == 0) return;

            multiChart.AddBlockPacket(blockPacket);
//            tallForm?.Process(blockPacket);
        }



        private void AddTextPacket(TextPacket textPacket)
        {
            var parsedValues = parsedPool.Rent();
            if (MyTextParser.Parse(textPacket.Text, parsedValues))
            {
                multiChart.AddData(parsedValues);
                parsedPool.Return(parsedValues);
            }
            else
                dbg.Log(textPacket.Text);
        }

        private void AddTelePacket(TelemetryPacket telePacket)
            => TelemetryPane.SP_DataReceived(telePacket);


        private async void SP_ErrorOccurred(Exception exception)
        {
            if (IsHandleCreated == false) return;

            try
            {
                dbg.Log(AString.FromString(exception.Message + Environment.NewLine));

                while (!cts.Token.IsCancellationRequested && SP?.IsOpen == false) // null check here
                {
                    await Task.Delay(500, cts.Token); // Wait before retrying
                    if (cts.Token.IsCancellationRequested) return;

                    var ports = SerialHelper.GetUSBSerialPorts();
                    if (ports?.Length > 0)
                    {
                        await Task.Delay(200, cts.Token);
                        if (cts.Token.IsCancellationRequested) return;

                        if (SP?.IsOpen == false) // check again before opening
                            this.Invoker(() =>
                            {
                                cbPorts.Items.Clear();
                                cbPorts.Items.AddRange(ports);
                                cbPorts.SelectedIndex = cbPorts.Items.Count - 1;
                            });
                    }
                }
            }
            catch (OperationCanceledException) when (cts.IsCancellationRequested)
            {
            }
        }
        private void SP_ConnectionChanged(ConnectionState state)
        {
            if (IsHandleCreated == false) return;

            AString? str = state switch
            {
                ConnectionState.Connected => AString.FromString("Connected " + SP?.PortName),
                ConnectionState.HandshakeInProgress => AString.FromString("Handshake in progress"),
                ConnectionState.Disconnected => AString.FromString("Disconnected"),
                ConnectionState.HandshakeSuccessful => null,  // string comes from the device
                _ => null
            };

            bool enableDropdown = state == ConnectionState.Disconnected;

            if (cbPorts.Enabled != enableDropdown)
                this.Invoker(() => cbPorts.Enabled = enableDropdown);

            switch (state)
            {
                case ConnectionState.Connected:
                    if (firstLoad == false)
                        dbg.Clear();
                    dbg.Log(str);
                    multiChart.Clear();
                    break;

                case ConnectionState.HandshakeSuccessful:
                    multiChart.BeginInitialising();
                    break;

                case ConnectionState.Disconnected:
                    multiChart.Clear();

                    if (SocketWatcher.ReceivedDisconnect)
                    {
                        dbg.Log(AString.FromString("Disconnected by request, waiting for reconnect..."));
                        return;
                    }
                    dbg.Log(str);

                    this.Invoker(() => Form1_Shown(this, EventArgs.Empty));
                    break;
            }

        }



        private void cbPorts_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (cbPorts.SelectedItem == null || cbPorts.SelectedItem.ToString() == "No ports found") return;

            SP?.Open(cbPorts.SelectedItem.ToString());
        }


        bool firstLoad = true;
        MyCalderaForm? calderaForm;
        private async void Form1_Shown(object sender, EventArgs e)
        {
            var ports = SerialHelper.GetUSBSerialPorts();

            if (ports.Length == 0)
            {
                if (firstLoad)
                {
                    for (var res = DialogResult.Retry; res == DialogResult.Retry;)
                    {
                        ports = SerialHelper.GetUSBSerialPorts();
                        if (ports.Length > 0)
                            break;

                        res = MessageBox.Show("Could not find any device", "Device Not Found", MessageBoxButtons.AbortRetryIgnore, MessageBoxIcon.Warning);

                        if (res == DialogResult.Abort)
                        {
                            Close();
                            return;
                        }
                    }
                }


                cbPorts.Items.Clear();
                cbPorts.Items.Add("No ports found");
                cbPorts.SelectedIndex = 0;

                monitorTimer.Start();
            }
            else
            {
                if (firstLoad)
                {
                    calderaForm = new MyCalderaForm() ;
                    calderaForm.FormClosed += CalderaForm_FormClosed;
                    calderaForm.Show();
                }

                firstLoad = false;

                dbg.ClearGL();
                TelemetryPane.ClearGL();
                await Task.Delay(100);

                cbPorts.Items.Clear();
                cbPorts.Items.AddRange(ports);
                cbPorts.SelectedIndex = cbPorts.Items.Count - 1;
            }
        }




        int index = -1;
        private void butDBG_Click(object sender, EventArgs e)
        {
            foreach (var chart in multiChart.GetCharts())
                dbg.Log(chart.getDebugOutput(index));
            
            butDBG.Text = $"DBG {index++}";
        }

        private void MultiChart_ChartCountChanged(object? sender, int count)
        {
            if (count <= 4) return;

            WindowState = FormWindowState.Normal;
            Location = Point.Empty;
            WindowState = FormWindowState.Maximized;
        }


    }
}
