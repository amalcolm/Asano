

namespace Asano.DataTools
{
    public partial class LogForm : Form
    {
        public static bool IsOpen { get; private set; } = false;

        public static LogForm? Instance { get; private set; } = null;

        public static event EventHandler? OnClose;

        public static bool Open(Control dbg)
        {
            if (IsOpen || global::Asano.Program.HasMaximisedForm)
                return false;

            Instance = new LogForm(dbg);
            IsOpen = true;
            Instance.Show();

            return true;
        }

        public LogForm(Control dbg)
        {
            InitializeComponent();

            switch (Environment.MachineName)
            {
                case "BOX":
                    this.WindowState = FormWindowState.Normal;
                    this.StartPosition = FormStartPosition.Manual;
                    this.Location = new Point(0, 0);
                    this.Size = new Size(1280, 2130);
                    break;

                case "PSYC-ANDREW":
                    this.StartPosition = FormStartPosition.Manual;
                    this.Location = new Point(2560, 1280);
                    this.Size = new Size(1280, 2160);
                    break;
            }

            this.Controls.Add(dbg);
            dbg.Dock = DockStyle.Fill;

            this.FormClosing += (s, e) =>
            {
                IsOpen = false;
                Instance = null;
                OnClose?.Invoke(this, EventArgs.Empty);
            };
        }
    }
}
