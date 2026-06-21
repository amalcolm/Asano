using TheLib;
using Asano.DataTools;
using Asano.MyGLTools.Helpers;

namespace Asano.MyGLTools.UserControls
{
    public partial class DataForm : Form
    {
        private const int MaxDockedChartCount = 4;
        private const int DetachedChartSettleMilliseconds = 2000;

        private Form? detachedChartForm;
        private bool closing;
        private bool preserveDataHoldOnDetachClose;

        public DataForm()
        {
            InitializeComponent();
            multiChart.ChartCountChanged += MultiChart_ChartCountChanged;

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
                    this.Location = new Point(2560, 1280);
                    this.Size = new Size(1280, 2160);
                    break;
            }


        }

        private void MultiChart_ChartCountChanged(object? sender, int count)
        {
            if (count <= MaxDockedChartCount || detachedChartForm != null || closing)
                return;

            if (IsDisposed || IsHandleCreated == false)
                return;

            if (InvokeRequired)
            {
                BeginInvoke(new MethodInvoker(() => MultiChart_ChartCountChanged(sender, count)));
                return;
            }

            DetachChartForm();
        }

        private void DetachChartForm()
        {
            if (detachedChartForm != null || multiChart.IsDisposed)
                return;

            Form form = new()
            {
                BackColor = BackColor,
                Icon = GetDetachedChartIcon() ?? Icon,
                Location = new Point(0, 0),
                StartPosition = FormStartPosition.Manual,
                Text = "Charts",
                WindowState = FormWindowState.Maximized
            };

            form.FormClosing += DetachedChartForm_FormClosing;
            detachedChartForm = form;
            global::Asano.Program.HasMaximisedForm = true;

            Label settleLabel = CreateSettleLabel(form);
            multiChart.BeginDataHold(
                DetachedChartSettleMilliseconds,
                () => RemoveSettleLabel(form, settleLabel));

            chartHostPanel.Controls.Remove(multiChart);
            form.Controls.Add(multiChart);
            multiChart.Dock = DockStyle.Fill;
            form.Controls.Add(settleLabel);

            form.Show(this);
            settleLabel.BringToFront();
        }

        private Icon? GetDetachedChartIcon()
        {
            foreach (Form form in Application.OpenForms)
                if (form is Asano.MainForm mainForm)
                    return mainForm.Icon;

            return Icon;
        }

        private Label CreateSettleLabel(Form form)
            => new()
            {
                AutoSize = false,
                BackColor = form.BackColor,
                Dock = DockStyle.Fill,
                Font = new Font(this.Font.FontFamily, 24.0f, FontStyle.Regular),
                ForeColor = Color.Gainsboro,
                Text = "settling charts...",
                TextAlign = ContentAlignment.MiddleCenter
            };

        private static void RemoveSettleLabel(Control parent, Label label)
        {
            if (label.IsDisposed)
                return;

            parent.Controls.Remove(label);
            label.Dispose();
        }

        private void DetachedChartForm_FormClosing(object? sender, FormClosingEventArgs e)
        {
            if (sender is not Form form)
                return;

            form.FormClosing -= DetachedChartForm_FormClosing;
            detachedChartForm = null;
            global::Asano.Program.HasMaximisedForm = false;

            if (!preserveDataHoldOnDetachClose)
                multiChart.CancelDataHold();

            if (multiChart.IsDisposed || closing)
                return;

            ReparentDetachedChart(form);
        }

        private void ReparentDetachedChart(Form form)
        {
            bool wasPaused = MyScheduler.IsPaused;
            bool wasFrozen = MyScheduler.IsFrozen;

            MyScheduler.IsPaused = true;
            MyScheduler.IsFrozen = true;

            try
            {
                WaitForChartFrames();
                form.Controls.Remove(multiChart);
                chartHostPanel.Controls.Add(multiChart);
                multiChart.Dock = DockStyle.Fill;
            }
            finally
            {
                MyScheduler.IsPaused = wasPaused;
                MyScheduler.IsFrozen = wasFrozen;
            }
        }

        private void WaitForChartFrames()
        {
            foreach (MyChart chart in multiChart.GetCharts())
                try { chart.GLThread?.FrameDone.Wait(TimeSpan.FromMilliseconds(250)); }
                catch { }
        }

        public void ClearTestData(int holdMilliseconds = 0, uint[]? expectedStates = null)
        {
            if (IsDisposed)
                return;

            if (InvokeRequired)
            {
                if (IsHandleCreated)
                    BeginInvoke(new MethodInvoker(() => ClearTestData(holdMilliseconds, expectedStates)));
                return;
            }

            if (holdMilliseconds > 0)
                multiChart.BeginRebuildDataHold(holdMilliseconds, ToHeadStates(expectedStates));
            else
                multiChart.CancelDataHold();

            DockDetachedChartIfNeeded();
            multiChart.Clear();
        }

        private void DockDetachedChartIfNeeded()
        {
            if (detachedChartForm is not { IsDisposed: false } form)
                return;

            preserveDataHoldOnDetachClose = true;
            try
            {
                form.Close();
            }
            finally
            {
                preserveDataHoldOnDetachClose = false;
            }
        }

        private static HeadState[]? ToHeadStates(uint[]? states)
        {
            if (states == null || states.Length == 0)
                return null;

            return [.. states.Select(state => (HeadState)state).Distinct()];
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            closing = true;

            if (detachedChartForm is { IsDisposed: false } form)
                form.Close();
            else
                global::Asano.Program.HasMaximisedForm = false;

            base.OnFormClosing(e);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            multiChart.ChartCountChanged -= MultiChart_ChartCountChanged;
            base.OnFormClosed(e);
        }
    }
}
