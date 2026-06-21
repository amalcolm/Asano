namespace Asano.MyGLTools.UserControls
{
    partial class DataForm
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
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
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(DataForm));
            chartHostPanel = new Panel();
            multiChart = new MyMultichart();
            calderaControl = new Asano.Caldera.CalderaControl();
            chartHostPanel.SuspendLayout();
            SuspendLayout();
            //
            // chartHostPanel
            //
            chartHostPanel.Controls.Add(multiChart);
            chartHostPanel.Dock = DockStyle.Fill;
            chartHostPanel.Location = new Point(0, 0);
            chartHostPanel.Name = "chartHostPanel";
            chartHostPanel.Size = new Size(800, 813);
            chartHostPanel.TabIndex = 2;
            //
            // multiChart
            // 
            multiChart.BackColor = Color.FromArgb(24, 23, 18);
            multiChart.Dock = DockStyle.Fill;
            multiChart.Location = new Point(0, 0);
            multiChart.Name = "multiChart";
            multiChart.Size = new Size(800, 813);
            multiChart.TabIndex = 0;
            // 
            // calderaControl
            // 
            calderaControl.BackColor = Color.FromArgb(16, 16, 8);
            calderaControl.Dock = DockStyle.Bottom;
            calderaControl.ForeColor = Color.Silver;
            calderaControl.Location = new Point(0, 813);
            calderaControl.Name = "calderaControl";
            calderaControl.Size = new Size(800, 422);
            calderaControl.TabIndex = 1;
            calderaControl.View = Caldera.CalderaView.Circuit;
            // 
            // DataForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.FromArgb(24, 23, 18);
            ClientSize = new Size(800, 1235);
            Controls.Add(chartHostPanel);
            Controls.Add(calderaControl);
            Icon = (Icon)resources.GetObject("$this.Icon");
            Location = new Point(3840, -400);
            Name = "DataForm";
            StartPosition = FormStartPosition.Manual;
            chartHostPanel.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion

        private Panel chartHostPanel;
        private Asano.MyGLTools.UserControls.MyMultichart multiChart;
        private Caldera.CalderaControl calderaControl;
    }
}
