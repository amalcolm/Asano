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
            chart = new MyChart();
            calderaControl = new Asano.Caldera.CalderaControl();
            SuspendLayout();
            // 
            // chart
            // 
            chart.AutoClear = true;
            chart.BackColor = Color.DarkSlateGray;
            chart.BorderStyle = BorderStyle.FixedSingle;
            chart.Dock = DockStyle.Fill;
            chart.EnableLabels = true;
            chart.EnablePlots = true;
            chart.Location = new Point(0, 0);
            chart.Name = "chart";
            chart.Size = new Size(800, 813);
            chart.TabIndex = 0;
            chart.Yscale = 1F;
            chart.MouseDown += DataForm_MouseDown;
            chart.MouseMove += DataForm_MouseMove;
            chart.MouseUp += DataForm_MouseUp;
            // 
            // calderaControl
            // 
            calderaControl.Dock = DockStyle.Bottom;
            calderaControl.Location = new Point(0, 813);
            calderaControl.Name = "calderaControl1";
            calderaControl.Size = new Size(800, 422);
            calderaControl.TabIndex = 1;
            // 
            // DataForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(800, 1235);
            Controls.Add(chart);
            Controls.Add(calderaControl);
            Location = new Point(3840, -400);
            Name = "DataForm";
            StartPosition = FormStartPosition.Manual;
            Text = "MyTallForm";
            MouseDown += DataForm_MouseDown;
            MouseLeave += DataForm_MouseLeave;
            MouseMove += DataForm_MouseMove;
            MouseUp += DataForm_MouseUp;
            ResumeLayout(false);
        }

        #endregion

        private MyChart chart;
        private Caldera.CalderaControl calderaControl;
    }
}