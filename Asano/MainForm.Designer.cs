namespace Asano
{
    partial class MainForm
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            components = new System.ComponentModel.Container();
            MyGLTools.Helpers.PlotAxesRenderer._Options _Options1 = new MyGLTools.Helpers.PlotAxesRenderer._Options();
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
            cbPorts = new ComboBox();
            labPorts = new Label();
            multiChart = new Asano.MyGLTools.UserControls.MyMultichart();
            butDBG = new Button();
            pHeader = new Panel();
            dbg = new Asano.MyGLTools.UserControls.MyDebugPane();
            TelemetryPane = new Asano.MyGLTools.UserControls.MyTelemetryPane();
            pDiagnostics = new Panel();
            signalViewer1 = new Asano.DataTools.Controls.SignalViewer();
            pHeader.SuspendLayout();
            pDiagnostics.SuspendLayout();
            SuspendLayout();
            // 
            // cbPorts
            // 
            cbPorts.Enabled = false;
            cbPorts.FormattingEnabled = true;
            cbPorts.Location = new Point(1060, 10);
            cbPorts.Name = "cbPorts";
            cbPorts.Size = new Size(121, 23);
            cbPorts.TabIndex = 3;
            cbPorts.SelectedIndexChanged += cbPorts_SelectedIndexChanged;
            // 
            // labPorts
            // 
            labPorts.AutoSize = true;
            labPorts.Location = new Point(991, 13);
            labPorts.Name = "labPorts";
            labPorts.Size = new Size(63, 15);
            labPorts.TabIndex = 4;
            labPorts.Text = "COM Port:";
            // 
            // multiChart
            // 
            multiChart.Dock = DockStyle.Fill;
            multiChart.Location = new Point(0, 42);
            multiChart.Name = "multiChart";
            multiChart.Size = new Size(1395, 989);
            multiChart.TabIndex = 8;
            // 
            // butDBG
            // 
            butDBG.Enabled = false;
            butDBG.Location = new Point(15, 9);
            butDBG.Name = "butDBG";
            butDBG.Size = new Size(75, 23);
            butDBG.TabIndex = 9;
            butDBG.Text = "DBG";
            butDBG.UseVisualStyleBackColor = true;
            butDBG.Click += butDBG_Click;
            // 
            // pHeader
            // 
            pHeader.Controls.Add(butDBG);
            pHeader.Controls.Add(cbPorts);
            pHeader.Controls.Add(labPorts);
            pHeader.Dock = DockStyle.Top;
            pHeader.Location = new Point(0, 0);
            pHeader.Name = "pHeader";
            pHeader.Size = new Size(1395, 42);
            pHeader.TabIndex = 10;
            // 
            // dbg
            // 
            dbg.AutoClear = true;
            dbg.BackColor = Color.FromArgb(243, 223, 197);
            dbg.BorderStyle = BorderStyle.None;
            dbg.Dock = DockStyle.Fill;
            dbg.Location = new Point(0, 0);
            dbg.Margin = Padding.Empty;
            dbg.Name = "dbg";
            dbg.Size = new Size(1066, 287);
            dbg.TabIndex = 6;
            dbg.TextColour = Color.Black;
            // 
            // TelemetryPane
            // 
            TelemetryPane.AutoClear = true;
            TelemetryPane.BackColor = Color.FromArgb(243, 223, 197);
            TelemetryPane.BorderStyle = BorderStyle.None;
            TelemetryPane.Dock = DockStyle.Right;
            TelemetryPane.Location = new Point(1066, 0);
            TelemetryPane.Name = "TelemetryPane";
            TelemetryPane.Padding = Padding.Empty;
            TelemetryPane.Size = new Size(329, 287);
            TelemetryPane.TabIndex = 8;
            TelemetryPane.TextColour = Color.Black;
            // 
            // pDiagnostics
            // 
            pDiagnostics.Controls.Add(dbg);
            pDiagnostics.Controls.Add(TelemetryPane);
            pDiagnostics.Dock = DockStyle.Bottom;
            pDiagnostics.Location = new Point(0, 1333);
            pDiagnostics.Name = "pDiagnostics";
            pDiagnostics.Size = new Size(1395, 287);
            pDiagnostics.TabIndex = 14;
            // 
            // signalViewer1
            // 
            signalViewer1.AutoClear = true;
            _Options1.AxesLabelVisible = true;
            _Options1.AxesVisible = true;
            _Options1.AxisColour = Color.FromArgb(180, 32, 32, 32);
            _Options1.GridColour = Color.FromArgb(8, 32, 32, 32);
            _Options1.GridSettings = MyGLTools.Helpers.PlotAxesRenderer.GridFlags.VerticalLines | MyGLTools.Helpers.PlotAxesRenderer.GridFlags.HorizontalLines | MyGLTools.Helpers.PlotAxesRenderer.GridFlags.YaxisLabels | MyGLTools.Helpers.PlotAxesRenderer.GridFlags.XaxisLabels;
            _Options1.GridVisible = true;
            _Options1.LabelColor = Color.FromArgb(180, 32, 32, 32);
            _Options1.LabelPadding = 60F;
            _Options1.TickColour = Color.FromArgb(140, 32, 32, 32);
            _Options1.TicksVisible = true;
            _Options1.XAxisLabelClipRightPadding = 0F;
            _Options1.XAxisUnitScale = 1F;
            signalViewer1.AxesOptions = _Options1;
            signalViewer1.BackColor = Color.MistyRose;
            signalViewer1.BorderStyle = BorderStyle.FixedSingle;
            signalViewer1.Dock = DockStyle.Bottom;
            signalViewer1.Location = new Point(0, 1031);
            signalViewer1.MaxInteractionXRange = float.PositiveInfinity;
            signalViewer1.MinInteractionXRange = 1E-06F;
            signalViewer1.Name = "signalViewer1";
            signalViewer1.Size = new Size(1395, 302);
            signalViewer1.TabIndex = 15;
            signalViewer1.TextColour = Color.Black;
            // 
            // MainForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1395, 1620);
            Controls.Add(multiChart);
            Controls.Add(signalViewer1);
            Controls.Add(pHeader);
            Controls.Add(pDiagnostics);
            Icon = (Icon)resources.GetObject("$this.Icon");
            Name = "MainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = " ";
            Shown += Form1_Shown;
            pHeader.ResumeLayout(false);
            pHeader.PerformLayout();
            pDiagnostics.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion
        private ComboBox cbPorts;
        private Label labPorts;
        private MyGLTools.UserControls.MyMultichart multiChart;
        private Button butDBG;
        private Panel pHeader;
        private MyGLTools.UserControls.MyDebugPane dbg;
        private MyGLTools.UserControls.MyTelemetryPane TelemetryPane;
        private Panel pDiagnostics;
        private DataTools.Controls.SignalViewer signalViewer1;
    }
}
