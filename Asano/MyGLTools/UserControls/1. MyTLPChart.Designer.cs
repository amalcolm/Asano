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
            components = new System.ComponentModel.Container();
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
            chart0.BackColor = Color.Cornsilk;
            chart0.BorderStyle = BorderStyle.FixedSingle;
            chart0.Dock = DockStyle.Fill;
            chart0.EnableLabels = true;
            chart0.EnablePlots = true;
            chart0.Location = new Point(3, 3);
            chart0.Name = "chart0";
            chart0.Padding = new Padding(4);
            chart0.Size = new Size(144, 144);
            chart0.TabIndex = 0;
            chart0.Yscale = 1F;
            //
            // MyTLPChart
            //
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
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
