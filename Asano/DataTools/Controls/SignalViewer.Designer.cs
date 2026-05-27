namespace Asano.DataTools.Controls
{
    partial class SignalViewer
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
            cmStrip = new ContextMenuStrip(components);
            miExport = new ToolStripMenuItem();
            cmStrip.SuspendLayout();
            SuspendLayout();
            // 
            // cmStrip
            // 
            cmStrip.Items.AddRange(new ToolStripItem[] { miExport });
            cmStrip.Name = "cmStrip";
            cmStrip.Size = new Size(131, 26);
            // 
            // miExport
            // 
            miExport.Name = "miExport";
            miExport.Size = new Size(130, 22);
            miExport.Text = "&Export .csv";
            miExport.Click += miExport_Click;
            // 
            // SignalViewer
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.GhostWhite;
            ContextMenuStrip = cmStrip;
            Name = "SignalViewer";
            Size = new Size(765, 302);
            cmStrip.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion

        private ContextMenuStrip cmStrip;
        private ToolStripMenuItem miExport;
    }
}
