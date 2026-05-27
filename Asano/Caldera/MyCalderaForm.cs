
namespace Asano.Caldera
{
    public partial class MyCalderaForm : Form
    {
        public MyCalderaForm()
        {
            InitializeComponent();



            switch (Environment.MachineName)
            {
                case "BOX":
                    this.StartPosition = FormStartPosition.Manual;
                    this.Location = new Point(3840, -200);
                    this.WindowState = FormWindowState.Maximized;
                    calderaControl.Height = 1280;
                    break;

                case "PSYC-ANDREW":
                    this.StartPosition = FormStartPosition.Manual;
                    this.Location = new Point(2800, 0);
                    this.Size = new Size(2560, 2160);
                    this.WindowState = FormWindowState.Normal;
                    break;
            }
        }
    }
}
