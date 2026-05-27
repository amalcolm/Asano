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
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
            cbPorts = new ComboBox();
            labPorts = new Label();
            multiChart = new Asano.MyGLTools.UserControls.MyMultichart();
            butDBG = new Button();
            pHeader = new Panel();
            dbg = new Asano.MyGLTools.UserControls.MyDebugPane();
            TelemetryPane = new Asano.MyGLTools.UserControls.MyTelemetryPane();
            pDiagnostics = new Panel();
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
            multiChart.Size = new Size(1395, 1291);
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
            dbg.BackColor = Color.AliceBlue;
            dbg.BorderStyle = BorderStyle.FixedSingle;
            dbg.Dock = DockStyle.Fill;
            dbg.Location = new Point(0, 0);
            dbg.Name = "dbg";
            dbg.Size = new Size(1066, 287);
            dbg.TabIndex = 6;
            dbg.TextColour = Color.Black;
            // 
            // TelemetryPane
            // 
            TelemetryPane.AutoClear = true;
            TelemetryPane.BackColor = Color.PapayaWhip;
            TelemetryPane.BorderStyle = BorderStyle.FixedSingle;
            TelemetryPane.Dock = DockStyle.Right;
            TelemetryPane.Location = new Point(1066, 0);
            TelemetryPane.Name = "TelemetryPane";
            TelemetryPane.Padding = new Padding(4);
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
            // MainForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1395, 1620);
            Controls.Add(multiChart);
            Controls.Add(pHeader);
            Controls.Add(pDiagnostics);
            Icon = (Icon)resources.GetObject("$this.Icon");
            Name = "MainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "fNIRS Prototype Data Monitor";
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
        private DataTools.Controls.SignalViewer signalViewer;
        private Panel pDiagnostics;
    }
}
