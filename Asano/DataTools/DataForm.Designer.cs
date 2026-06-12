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
            dataControl = new DataTools.Controls.DataControl();
            calderaControl = new Asano.Caldera.CalderaControl();
            SuspendLayout();
            // 
            // dataControl
            // 
            dataControl.BackColor = Color.DarkSlateGray;
            dataControl.BorderStyle = BorderStyle.FixedSingle;
            dataControl.Dock = DockStyle.Fill;
            dataControl.Location = new Point(0, 0);
            dataControl.Name = "dataControl";
            dataControl.Size = new Size(800, 813);
            dataControl.TabIndex = 0;
            // 
            // calderaControl
            // 
            calderaControl.Dock = DockStyle.Bottom;
            calderaControl.Location = new Point(0, 813);
            calderaControl.Name = "calderaControl";
            calderaControl.Size = new Size(800, 422);
            calderaControl.TabIndex = 1;
            // 
            // DataForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(800, 1235);
            Controls.Add(dataControl);
            Controls.Add(calderaControl);
            Location = new Point(3840, -400);
            Name = "DataForm";
            StartPosition = FormStartPosition.Manual;
            Text = "MyTallForm";
            ResumeLayout(false);
        }

        #endregion

        private Asano.DataTools.Controls.DataControl dataControl;
        private Caldera.CalderaControl calderaControl;
    }
}