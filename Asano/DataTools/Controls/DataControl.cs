
using TheLib;
using Asano.Caldera;
using Asano.MyGLTools.Helpers;

namespace Asano.DataTools.Controls
{
    public partial class DataControl : UserControl
    {
        private readonly Dictionary<HeadState, SignalExtractor> _extractors = [];

        public DataControl()
        {
            InitializeComponent();

            MyColour colour = chart.BackColor;
            chart.BackColor = colour.Darken(0.4).ToColor();
        }

         

        private void ProcessBlockPacket(BlockPacket blockPacket)
        {
            if (blockPacket.Count == 0) return;

            DataPacket packet = blockPacket.BlockData[blockPacket.Count - 1];

            if (_extractors.TryGetValue(packet.State, out var extractor) == false)
                _extractors[packet.State] = extractor = new SignalExtractor(packet.State) { Chart = chart };

            extractor.Process(packet);
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);

            if (ParentForm == null || Program.SerialPort == null) return;

            ParentForm.FormClosing += (_, _) =>
            {
                foreach (var extractor in _extractors.Values)
                    extractor.Dispose();
                _extractors.Clear();
            };

            Program.SerialPort.BlockPacketReceived += ProcessBlockPacket;

        }

        protected override void OnHandleDestroyed(EventArgs e)
        {
            base.OnHandleDestroyed(e);

            if (Program.IsRunning == false) return;

            foreach (var extractor in _extractors.Values)
                extractor.Dispose();
            _extractors.Clear();
        }



        #region Mouse dragging to scroll
        bool isMouseDown = false;
        int original_Y = 0;

        private void DataControl_MouseDown(object sender, MouseEventArgs e)
        {
            isMouseDown = true;
            original_Y = e.Y;
        }

        private void DataControl_MouseMove(object sender, MouseEventArgs e)
        {
            if (!isMouseDown) return;

        }

        private void DataControl_MouseUp(object sender, MouseEventArgs e)
        {
            if (e.Y == original_Y) return;
            isMouseDown = false;
        }


        readonly MouseEventArgs dummy = new(MouseButtons.Left, 1, 0, 0, 0);
        private void DataControl_MouseLeave(object sender, EventArgs e) => DataControl_MouseUp(sender, dummy);
        #endregion
    }
}
