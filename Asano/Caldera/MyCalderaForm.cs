
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
                    this.WindowState = FormWindowState.Normal;
                    this.StartPosition = FormStartPosition.Manual;
                    this.Location = new Point(2560, 0);
                    this.Size = new Size(1280, 2160-32);
                    break;
            }
        }
    }
}
