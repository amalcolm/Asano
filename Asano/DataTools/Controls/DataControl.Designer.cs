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
            MyGLTools.Helpers.MyAxesRenderer._Options _Options1 = new MyGLTools.Helpers.MyAxesRenderer._Options();
            chart = new Asano.MyGLTools.UserControls.MyChart();
            SuspendLayout();
            // 
            // chart
            // 
            chart.AutoClear = true;
            _Options1.AxesLabelVisible = true;
            _Options1.AxesVisible = true;
            _Options1.AxisColour = Color.FromArgb(80, 255, 255, 255);
            _Options1.GridColour = Color.FromArgb(8, 255, 255, 255);
            _Options1.GridSettings = MyGLTools.Helpers.MyAxesRenderer.GridFlags.VerticalLines | MyGLTools.Helpers.MyAxesRenderer.GridFlags.HorizontalLines | MyGLTools.Helpers.MyAxesRenderer.GridFlags.YaxisLabels | MyGLTools.Helpers.MyAxesRenderer.GridFlags.XaxisLabels;
            _Options1.GridVisible = true;
            _Options1.LabelColor = Color.FromArgb(80, 255, 255, 255);
            _Options1.LabelPadding = 60F;
            _Options1.TickColour = Color.FromArgb(140, 255, 255, 255);
            _Options1.TicksVisible = true;
            _Options1.XAxisLabelClipRightPadding = 0F;
            _Options1.XAxisUnitScale = 1F;
            chart.AxesOptions = _Options1;
            chart.BackColor = Color.FromArgb(80, 32,24,10);
            chart.BorderStyle = BorderStyle.FixedSingle;
            chart.Dock = DockStyle.Fill;
            chart.EnableLabels = true;
            chart.EnablePlots = true;
            chart.Location = new Point(0, 0);
            chart.Name = "chart";
            chart.Size = new Size(842, 1016);
            chart.TabIndex = 0;
            chart.TextColour = Color.Silver;
            chart.Yscale = 1F;
            chart.MouseDown += DataControl_MouseDown;
            chart.MouseLeave += DataControl_MouseLeave;
            chart.MouseMove += DataControl_MouseMove;
            chart.MouseUp += DataControl_MouseUp;
            // 
            // DataControl
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            Controls.Add(chart);
            Name = "DataControl";
            Size = new Size(842, 1016);
            MouseDown += DataControl_MouseDown;
            MouseLeave += DataControl_MouseLeave;
            MouseMove += DataControl_MouseMove;
            MouseUp += DataControl_MouseUp;
            ResumeLayout(false);
        }

        #endregion

        private MyGLTools.UserControls.MyChart chart;
    }
}
