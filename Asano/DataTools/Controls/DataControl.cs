
using System.Diagnostics;
using TheLib;
using Asano.Caldera;
using Asano.MyGLTools.Helpers;

namespace Asano.DataTools.Controls
{
    public partial class DataControl : UserControl
    {
        private readonly Dictionary<HeadState, SignalExtractor> _extractors = [];
        private readonly object _extractorsLock = new();
        private long _packetHoldUntilTimestamp;

        public DataControl()
        {
            InitializeComponent();

            MyColour colour = chart.BackColor;
            chart.BackColor = colour.Darken(0.3).ToColor();

            Program.SerialPort.BlockPacketReceived += ProcessBlockPacket;
        }



        private void ProcessBlockPacket(BlockPacket blockPacket)
        {
            if (IsPacketHoldActive())
                return;

            if (blockPacket.Count == 0) return;

            DataPacket packet = blockPacket.BlockData[blockPacket.Count - 1];

            lock (_extractorsLock)
            {
                if (_extractors.TryGetValue(packet.State, out var extractor) == false)
                    _extractors[packet.State] = extractor = new SignalExtractor(packet.State) { Chart = chart };

                extractor.Process(packet);
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);

            if (ParentForm == null || Program.SerialPort == null) return;

            ParentForm.FormClosing += (_, _) =>
            {
                ClearExtractors();
            };


        }

        protected override void OnHandleDestroyed(EventArgs e)
        {
            base.OnHandleDestroyed(e);

            if (Program.IsRunning == false) return;

            ClearExtractors();
        }

        public void Clear(int holdMilliseconds = 0)
        {
            if (holdMilliseconds > 0)
                BeginPacketHold(holdMilliseconds);

            ClearExtractors();
            chart.ResetData();
        }

        private void BeginPacketHold(int milliseconds)
        {
            long holdTicks = Stopwatch.Frequency * Math.Max(1L, milliseconds) / 1000L;
            System.Threading.Interlocked.Exchange(ref _packetHoldUntilTimestamp, Stopwatch.GetTimestamp() + holdTicks);
        }

        private bool IsPacketHoldActive()
        {
            long holdUntil = System.Threading.Interlocked.Read(ref _packetHoldUntilTimestamp);
            return holdUntil > 0 && Stopwatch.GetTimestamp() < holdUntil;
        }

        private void ClearExtractors()
        {
            lock (_extractorsLock)
            {
                foreach (var extractor in _extractors.Values)
                    extractor.Dispose();
                _extractors.Clear();
                SignalExtractor.ClearStats();
            }
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
