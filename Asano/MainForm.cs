using Timer = System.Windows.Forms.Timer;

namespace Asano
{
    using Asano.MyGLTools.Helpers;
    using Asano.MyGLTools.UserControls;
    using TheLib;

    public partial class MainForm : Form
    {
        private bool _closeStarted;
        private bool _closeRequestedFromDataForm;
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

            if (Program.SerialPort != null)
                Program.SerialPort.mainForm = this;
        }


        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!_shutdownComplete)
            {
                e.Cancel = true;  if (_closeStarted) return;

                _closeStarted = true;

                try   { dataForm?.Close(); }
                catch (Exception ex) { System.Diagnostics.Debug.WriteLine("Error during shutdown: " + ex); }
                finally { _shutdownComplete = true; if (IsDisposed == false) Close(); }
                return;
            }

            base.OnFormClosing(e);
        }

        private void RequestCloseFromDataForm()
        {
            if (_closeStarted || _closeRequestedFromDataForm || IsDisposed)
                return;

            _closeRequestedFromDataForm = true;

            if (IsHandleCreated)
                this.Invoker(Close);
            else
                Close();
        }


        private readonly Timer monitorTimer = new() { Interval = 1000, Enabled = false };



        public void EnableDropdown(bool enable)
        {
            if (cbPorts.Enabled != enable)
                this.Invoker(() => cbPorts.Enabled = enable);
        }

        public void SetPorts(string[] ports)
        {
            this.Invoker(() =>
            {
                cbPorts.Items.Clear();
                cbPorts.Items.AddRange(ports);
                cbPorts.SelectedIndex = cbPorts.Items.Count - 1;
            });

        }

        private void cbPorts_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (cbPorts.SelectedItem == null || cbPorts.SelectedItem.ToString() == "No ports found") return;

            Program.SerialPort?.Open(cbPorts.SelectedItem.ToString());
        }


        bool firstLoad = true;
        DataForm? dataForm;
        private Timer? focusTimer;
        public void Form1_Shown(object sender, EventArgs e)
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
                    dataForm = new DataForm();
                    dataForm.FormClosed += (s, e) => RequestCloseFromDataForm();
                    dataForm.Show();

                    SetPorts(ports);

                    focusTimer = new Timer { Interval = 500, Enabled = false };
                    focusTimer.Tick += (s, e) =>
                    {   focusTimer.Stop(); focusTimer.Dispose(); focusTimer = null;

                        if (this.IsDisposed == false)
                            this.Focus();
                    };
                    focusTimer.Start();
                }
            }

            firstLoad = false;
        }
    }
}
