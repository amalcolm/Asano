namespace Asano.Caldera
{
    partial class CalderaControl
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
            web = new Microsoft.Web.WebView2.WinForms.WebView2();
            ((System.ComponentModel.ISupportInitialize)web).BeginInit();
            SuspendLayout();
            // 
            // web
            // 
            web.AllowExternalDrop = true;
            web.CreationProperties = null;
            web.DefaultBackgroundColor = Color.White;
            web.Dock = DockStyle.Fill;
            web.Location = new Point(0, 0);
            web.Name = "web";
            web.Size = new Size(150, 150);
            web.TabIndex = 1;
            web.ZoomFactor = 1D;
            // 
            // CalderaControl
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            Controls.Add(web);
            Name = "CalderaControl";
            ((System.ComponentModel.ISupportInitialize)web).EndInit();
            ResumeLayout(false);
        }

        #endregion

        private Microsoft.Web.WebView2.WinForms.WebView2 web;
    }
}
