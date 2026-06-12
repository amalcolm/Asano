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
            multiChart = new MyMultichart();
            calderaControl = new Asano.Caldera.CalderaControl();
            SuspendLayout();
            // 
            // multiChart
            // 
            multiChart.BackColor = Color.DarkSlateGray;
            multiChart.BorderStyle = BorderStyle.FixedSingle;
            multiChart.Dock = DockStyle.Fill;
            multiChart.Location = new Point(0, 0);
            multiChart.Name = "multiChart";
            multiChart.Size = new Size(800, 813);
            multiChart.TabIndex = 0;
            // 
            // calderaControl
            // 
            calderaControl.Dock = DockStyle.Bottom;
            calderaControl.Location = new Point(0, 813);
            calderaControl.Name = "calderaControl";
            calderaControl.QueryParameters = (IReadOnlyDictionary<string, string>)resources.GetObject("calderaControl.QueryParameters");
            calderaControl.Size = new Size(800, 422);
            calderaControl.TabIndex = 1;
            calderaControl.View = Caldera.CalderaView.Circuit;
            // 
            // DataForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.FromArgb(16, 8, 8);
            ClientSize = new Size(800, 1235);
            Controls.Add(multiChart);
            Controls.Add(calderaControl);
            Location = new Point(3840, -400);
            Name = "DataForm";
            StartPosition = FormStartPosition.Manual;
            Text = "MyTallForm";
            ResumeLayout(false);
        }

        #endregion

        private Asano.MyGLTools.UserControls.MyMultichart multiChart;
        private Caldera.CalderaControl calderaControl;
    }
}