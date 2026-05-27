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
            cbPorts = new ComboBox();
            labPorts = new Label();
            multiChart = new Asano.MyGLTools.UserControls.MyMultichart();
            butDBG = new Button();
            pHeader = new Panel();
            pDebugPane = new Panel();
            dbg = new Asano.MyGLTools.UserControls.MyDebugPane();
            pTelemetryPane = new Panel();
            TelemetryPane = new Asano.MyGLTools.UserControls.MyTelemetryPane();
            signalViewer = new Asano.DataTools.Controls.SignalViewer();
            pHeader.SuspendLayout();
            pDebugPane.SuspendLayout();
            pTelemetryPane.SuspendLayout();
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
            multiChart.Size = new Size(1060, 954);
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
            // pDebugPane
            // 
            pDebugPane.Controls.Add(dbg);
            pDebugPane.Dock = DockStyle.Bottom;
            pDebugPane.Location = new Point(0, 1312);
            pDebugPane.Name = "pDebugPane";
            pDebugPane.Padding = new Padding(4);
            pDebugPane.Size = new Size(1395, 308);
            pDebugPane.TabIndex = 11;
            // 
            // dbg
            // 
            dbg.AutoClear = true;
            dbg.BorderStyle = BorderStyle.FixedSingle;
            dbg.Dock = DockStyle.Fill;
            dbg.Location = new Point(4, 4);
            dbg.Name = "dbg";
            dbg.Size = new Size(1387, 300);
            dbg.TabIndex = 6;
            // 
            // pTelemetryPane
            // 
            pTelemetryPane.Controls.Add(TelemetryPane);
            pTelemetryPane.Dock = DockStyle.Right;
            pTelemetryPane.Location = new Point(1060, 42);
            pTelemetryPane.Name = "pTelemetryPane";
            pTelemetryPane.Padding = new Padding(3);
            pTelemetryPane.Size = new Size(335, 1270);
            pTelemetryPane.TabIndex = 12;
            // 
            // TelemetryPane
            // 
            TelemetryPane.AutoClear = true;
            TelemetryPane.BorderStyle = BorderStyle.FixedSingle;
            TelemetryPane.Dock = DockStyle.Fill;
            TelemetryPane.Location = new Point(3, 3);
            TelemetryPane.Name = "TelemetryPane";
            TelemetryPane.Padding = new Padding(4);
            TelemetryPane.Size = new Size(329, 1264);
            TelemetryPane.TabIndex = 8;
            // 
            // signalViewer
            // 
            signalViewer.AutoClear = true;
            signalViewer.BorderStyle = BorderStyle.FixedSingle;
            signalViewer.Dock = DockStyle.Bottom;
            signalViewer.Location = new Point(0, 996);
            signalViewer.Name = "noiseViewer";
            signalViewer.Size = new Size(1060, 316);
            signalViewer.TabIndex = 13;
            // 
            // MainForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1395, 1620);
            Controls.Add(multiChart);
            Controls.Add(signalViewer);
            Controls.Add(pTelemetryPane);
            Controls.Add(pDebugPane);
            Controls.Add(pHeader);
            Name = "MainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "fNIRS Prototype Data Monitor";
            Shown += Form1_Shown;
            pHeader.ResumeLayout(false);
            pHeader.PerformLayout();
            pDebugPane.ResumeLayout(false);
            pTelemetryPane.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion
        private ComboBox cbPorts;
        private Label labPorts;
        private MyGLTools.UserControls.MyMultichart multiChart;
        private Button butDBG;
        private Panel pHeader;
        private Panel pDebugPane;
        private MyGLTools.UserControls.MyDebugPane dbg;
        private Panel pTelemetryPane;
        private MyGLTools.UserControls.MyTelemetryPane TelemetryPane;
        private DataTools.Controls.SignalViewer signalViewer;
    }
}
