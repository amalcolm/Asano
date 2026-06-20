using Asano.MyGLTools.Helpers;
using static System.Windows.Forms.DataFormats;

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
            MyAxesRenderer._Options _Options1 = new MyAxesRenderer._Options();
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
            cbPorts = new ComboBox();
            labPorts = new Label();
            dataControl = new Asano.DataTools.Controls.DataControl();
            pHeader = new Panel();
            TelemetryPane = new Asano.MyGLTools.UserControls.MyTelemetryPane();
            pDiagnostics = new Panel();
            dbg = new Asano.MyGLTools.UserControls.MyDebugPane();
            signalViewer1 = new Asano.DataTools.Controls.SignalViewer();
            pHeader.SuspendLayout();
            pDiagnostics.SuspendLayout();
            SuspendLayout();
            // 
            // cbPorts
            // 
            cbPorts.BackColor = Color.FromArgb(128, 128, 128);
            cbPorts.Dock = DockStyle.Right;
            cbPorts.Enabled = false;
            cbPorts.ForeColor = Color.Gainsboro;
            cbPorts.FormattingEnabled = true;
            cbPorts.Location = new Point(1274, 0);
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
            // dataControl
            // 
            dataControl.Dock = DockStyle.Fill;
            dataControl.Location = new Point(0, 22);
            dataControl.Name = "dataControl";
            dataControl.Size = new Size(1395, 1009);
            dataControl.TabIndex = 8;
            // 
            // pHeader
            // 
            pHeader.BackColor = Color.FromArgb(16, 8, 8);
            pHeader.Controls.Add(cbPorts);
            pHeader.Controls.Add(labPorts);
            pHeader.Dock = DockStyle.Top;
            pHeader.Location = new Point(0, 0);
            pHeader.Name = "pHeader";
            pHeader.Size = new Size(1395, 22);
            pHeader.TabIndex = 10;
            // 
            // TelemetryPane
            // 
            TelemetryPane.AutoClear = true;
            TelemetryPane.BackColor = Color.FromArgb(16, 8, 8);
            TelemetryPane.Dock = DockStyle.Right;
            TelemetryPane.Location = new Point(1066, 0);
            TelemetryPane.Name = "TelemetryPane";
            TelemetryPane.Size = new Size(329, 287);
            TelemetryPane.TabIndex = 8;
            TelemetryPane.TextColour = Color.Silver;
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
            // dbg
            // 
            dbg.AutoClear = true;
            dbg.BackColor = Color.FromArgb(16, 8, 8);
            dbg.Dock = DockStyle.Fill;
            dbg.Location = new Point(0, 0);
            dbg.Margin = new Padding(0);
            dbg.Name = "dbg";
            dbg.Size = new Size(1066, 287);
            dbg.TabIndex = 9;
            dbg.TextColour = Color.DarkGray;
            // 
            // signalViewer1
            // 
            signalViewer1.AutoClear = true;
            _Options1.AxesLabelVisible = true;
            _Options1.AxesVisible = true;
            _Options1.AxisColour = Color.FromArgb(80, 255, 255, 255);
            _Options1.GridColour = Color.FromArgb(8, 255, 255, 255);
            _Options1.GridSettings = MyAxesRenderer.GridFlags.VerticalLines | MyAxesRenderer.GridFlags.HorizontalLines | MyAxesRenderer.GridFlags.YaxisLabels | MyAxesRenderer.GridFlags.XaxisLabels;
            _Options1.GridVisible = true;
            _Options1.LabelColor = Color.FromArgb(80, 255, 255, 255);
            _Options1.LabelPadding = 70F;
            _Options1.TickColour = Color.FromArgb(140, 255, 255, 255);
            _Options1.TicksVisible = true;
            _Options1.XAxisLabelClipRightPadding = 40F;
            _Options1.XAxisUnitScale = 0.001F;
            _Options1.XFormat = "G5";
            _Options1.YFormat = "G5";
            signalViewer1.AxesOptions = _Options1;
            signalViewer1.BackColor = Color.FromArgb(32, 16, 16);
            signalViewer1.BorderStyle = BorderStyle.FixedSingle;
            signalViewer1.Dock = DockStyle.Bottom;
            signalViewer1.Location = new Point(0, 1031);
            signalViewer1.MaxInteractionXRange = float.PositiveInfinity;
            signalViewer1.MinInteractionXRange = 1E-06F;
            signalViewer1.Name = "signalViewer1";
            signalViewer1.Size = new Size(1395, 302);
            signalViewer1.TabIndex = 15;
            signalViewer1.TextColour = Color.FromArgb(128, 128, 128);
            // 
            // MainForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.FromArgb(16, 8, 8);
            ClientSize = new Size(1395, 1620);
            Controls.Add(dataControl);
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
        private DataTools.Controls.DataControl dataControl;
        private Panel pHeader;
        private Asano.MyGLTools.UserControls.MyTelemetryPane TelemetryPane;
        private Panel pDiagnostics;
        private DataTools.Controls.SignalViewer signalViewer1;
        private MyGLTools.UserControls.MyDebugPane dbg;
    }
}
