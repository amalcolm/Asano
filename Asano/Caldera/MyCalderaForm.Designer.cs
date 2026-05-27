namespace Asano.Caldera
{
    partial class MyCalderaForm
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
            calderaControl = new CalderaControl();
            SuspendLayout();
            // 
            // calderaControl
            // 
            calderaControl.Dock = DockStyle.Fill;
            calderaControl.Location = new Point(0, 0);
            calderaControl.Name = "calderaControl";
            calderaControl.Size = new Size(800, 1185);
            calderaControl.TabIndex = 0;
            // 
            // MyCalderaForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(800, 1185);
            Controls.Add(calderaControl);
            Name = "MyCalderaForm";
            Text = "MyCalderaForm";
            ResumeLayout(false);
        }

        #endregion

        private CalderaControl calderaControl;
    }
}