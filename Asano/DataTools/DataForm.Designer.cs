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
            splitContainer1 = new SplitContainer();
            calderaControl = new Asano.Caldera.CalderaControl();
            multiChart = new MyMultichart();
            chartHostPanel.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)splitContainer1).BeginInit();
            splitContainer1.Panel1.SuspendLayout();
            splitContainer1.Panel2.SuspendLayout();
            splitContainer1.SuspendLayout();
            SuspendLayout();
            // 
            // chartHostPanel
            // 
            chartHostPanel.Controls.Add(splitContainer1);
            chartHostPanel.Dock = DockStyle.Fill;
            chartHostPanel.Location = new Point(0, 0);
            chartHostPanel.Name = "chartHostPanel";
            chartHostPanel.Size = new Size(800, 1235);
            chartHostPanel.TabIndex = 2;
            // 
            // splitContainer1
            // 
            splitContainer1.Dock = DockStyle.Fill;
            splitContainer1.Location = new Point(0, 0);
            splitContainer1.Name = "splitContainer1";
            splitContainer1.Orientation = Orientation.Horizontal;
            // 
            // splitContainer1.Panel1
            // 
            splitContainer1.Panel1.Controls.Add(multiChart);
            // 
            // splitContainer1.Panel2
            // 
            splitContainer1.Panel2.Controls.Add(calderaControl);
            splitContainer1.Size = new Size(800, 1235);
            splitContainer1.SplitterDistance = 617;
            splitContainer1.TabIndex = 1;
            // 
            // calderaControl
            // 
            calderaControl.BackColor = Color.FromArgb(16, 16, 8);
            calderaControl.Dock = DockStyle.Fill;
            calderaControl.ForeColor = Color.Silver;
            calderaControl.Location = new Point(0, 0);
            calderaControl.Name = "calderaControl";
            calderaControl.Size = new Size(800, 614);
            calderaControl.TabIndex = 2;
            calderaControl.View = Caldera.CalderaView.Circuit;
            // 
            // multiChart
            // 
            multiChart.BackColor = Color.FromArgb(24, 23, 18);
            multiChart.Dock = DockStyle.Fill;
            multiChart.Location = new Point(0, 0);
            multiChart.Name = "multiChart";
            multiChart.Size = new Size(800, 617);
            multiChart.TabIndex = 1;
            // 
            // DataForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.FromArgb(24, 23, 18);
            ClientSize = new Size(800, 1813);
            Controls.Add(chartHostPanel);
            Icon = (Icon)resources.GetObject("$this.Icon");
            Location = new Point(3840, -400);
            Name = "DataForm";
            StartPosition = FormStartPosition.Manual;
            chartHostPanel.ResumeLayout(false);
            splitContainer1.Panel1.ResumeLayout(false);
            splitContainer1.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)splitContainer1).EndInit();
            splitContainer1.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion

        private Panel chartHostPanel;
        private SplitContainer splitContainer1;
        private MyMultichart multiChart;
        private Caldera.CalderaControl calderaControl;
    }
}
