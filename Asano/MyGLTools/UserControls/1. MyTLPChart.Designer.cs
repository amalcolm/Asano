namespace Asano.MyGLTools.UserControls
{
    partial class MyTLPChart
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
            Helpers.PlotAxesRenderer._Options _Options1 = new Helpers.PlotAxesRenderer._Options();
            tlpCharts = new TableLayoutPanel();
            chart0 = new MyChart();
            tlpCharts.SuspendLayout();
            SuspendLayout();
            // 
            // tlpCharts
            // 
            tlpCharts.ColumnCount = 1;
            tlpCharts.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            tlpCharts.Controls.Add(chart0, 0, 0);
            tlpCharts.Dock = DockStyle.Fill;
            tlpCharts.GrowStyle = TableLayoutPanelGrowStyle.FixedSize;
            tlpCharts.Location = new Point(0, 0);
            tlpCharts.Name = "tlpCharts";
            tlpCharts.RowCount = 1;
            tlpCharts.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            tlpCharts.Size = new Size(150, 150);
            tlpCharts.TabIndex = 0;
            // 
            // chart0
            // 
            chart0.AutoClear = true;
            _Options1.AxesLabelVisible = true;
            _Options1.AxesVisible = true;
            _Options1.AxisColour = Color.FromArgb(40, 255, 255, 255);
            _Options1.GridColour = Color.FromArgb(4, 255, 255, 255);
            _Options1.GridSettings = Helpers.PlotAxesRenderer.GridFlags.VerticalLines | Helpers.PlotAxesRenderer.GridFlags.XaxisLabels;
            _Options1.GridVisible = true;
            _Options1.LabelColor = Color.FromArgb(40, 255, 255, 255);
            _Options1.LabelPadding = 60F;
            _Options1.TickColour = Color.FromArgb(40, 255, 255, 255);
            _Options1.TicksVisible = true;
            _Options1.XAxisLabelClipRightPadding = 0F;
            _Options1.XAxisUnitScale = 1F;
            chart0.AxesOptions = _Options1;
            chart0.BackColor = Color.FromArgb(16, 8, 8);
            chart0.BorderStyle = BorderStyle.FixedSingle;
            chart0.Dock = DockStyle.Fill;
            chart0.EnableLabels = true;
            chart0.EnablePlots = true;
            chart0.Location = new Point(3, 3);
            chart0.Name = "chart0";
            chart0.Padding = new Padding(4);
            chart0.Size = new Size(144, 144);
            chart0.TabIndex = 0;
            chart0.TextColour = Color.Silver;
            chart0.Yscale = 1F;
            // 
            // MyTLPChart
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            Controls.Add(tlpCharts);
            Name = "MyTLPChart";
            tlpCharts.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion
        private TableLayoutPanel tlpCharts;
        private MyChart chart0;
    }
}
