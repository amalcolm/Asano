namespace Asano.DataTools.Controls
{
    partial class DataControl
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

        #region Component Designer generated code

        /// <summary> 
        /// Required method for Designer support - do not modify 
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            chart = new Asano.MyGLTools.UserControls.MyChart();
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
            chart.MouseDown += DataControl_MouseDown;
            chart.MouseMove += DataControl_MouseMove;
            chart.MouseUp += DataControl_MouseUp;
            chart.MouseLeave += DataControl_MouseLeave;

            // 
            // DataControl
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            Controls.Add(chart);
            Name = "DataControl";
            Size = new Size(842, 1016);
            MouseDown += DataControl_MouseDown;
            MouseMove += DataControl_MouseMove;
            MouseUp += DataControl_MouseUp;
            MouseLeave += DataControl_MouseLeave;
            ResumeLayout(false);
        }

        #endregion

        private MyGLTools.UserControls.MyChart chart;
    }
}
