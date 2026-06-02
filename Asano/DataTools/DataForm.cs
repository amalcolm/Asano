using TheLib;
using Asano.DataTools;
using Asano.MyGLTools.Helpers;

namespace Asano.MyGLTools.UserControls
{
    public partial class DataForm : Form
    {
        private readonly Dictionary<HeadState, SignalExtractor> _extractors = [];

        public DataForm()
        {
            InitializeComponent();

            MyColour colour = chart.BackColor;

            chart.BackColor = colour.Darken(0.4).ToColor();


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
                    this.Location = new Point(2560, 1280);
                    this.Size = new Size(1280, 2160);
                    break;
            }


            FormClosing += (_, _) =>
            {
                foreach (var extractor in _extractors.Values)
                    extractor.Dispose();
                _extractors.Clear();
            };
        }

        public void Process(BlockPacket blockPacket)
        {
            if (blockPacket.Count == 0) return;

            DataPacket packet = blockPacket.BlockData[blockPacket.Count - 1];
            
            if (_extractors.TryGetValue(packet.State, out var extractor) == false)
                _extractors[packet.State] = extractor = new SignalExtractor(packet.State) { Chart = chart };

            extractor.Process(packet);
        }

        public Task ShutdownCalderaAsync()
            => calderaControl.ShutdownAsync();

        bool isMouseDown = false;
        int original_Y = 0;

        private void DataForm_MouseDown(object sender, MouseEventArgs e)
        {
            isMouseDown = true;
            original_Y = e.Y;
        }

        private void DataForm_MouseMove(object sender, MouseEventArgs e)
        {   if (!isMouseDown) return;

        }

        private void DataForm_MouseUp(object sender, MouseEventArgs e)
        {
            if (e.Y == original_Y) return;  
            isMouseDown = false;
        }


        readonly MouseEventArgs dummy = new(MouseButtons.Left, 1, 0, 0, 0);
        private void DataForm_MouseLeave(object sender, EventArgs e)
            => DataForm_MouseUp(sender, dummy);
    }
}
