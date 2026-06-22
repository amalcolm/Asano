using TheLib;
using TheLib.Math;
using Asano.MyGLTools.Helpers;
using Asano.MyGLTools.UserControls;

namespace Asano.DataTools
{

    internal class SignalExtractor : IDisposable
    {

        public  readonly Dictionary<string, XY> telemetry = [];
        private readonly HeadState _state;
        private readonly string _stateLabel_Raw;
        private readonly string _stateLabel_Signal;


        private readonly ZFixer fixer = new();
        private const double scale_C0 = 1.0 / 4660.100;
        private const double delta_Offset2 = 368.0;

        private const uint ra_Size = 512;

        public sealed class StateData
        {
            public RunningAverage RA     = new(ra_Size);
            public XY[]           Buffer = new XY[ra_Size];
            public uint           Index  = 0;
            public double         LastTimestamp = double.NaN;
        }

        private static readonly object StatsLock = new();
        public static Dictionary<HeadState, StateData> Stats { get; } = [];

        public static void ClearStats()
        {
            lock (StatsLock)
            {
                Stats.Clear();
                MyPlot.ResetSharedScaling();
            }
        }

        public SignalExtractor(HeadState state)
        {
            _state = state;
            _stateLabel_Raw    = $"*{       state.Description()}";  // * means shared scaling, + means own auto-scaling
            _stateLabel_Signal = $"*Signal {state.Description()}";

            fixer.Telemetry = telemetry;
        }


        public void Dispose()
        {
            if (_isDisposed) return;

            _isDisposed = true;
            fixer.Dispose();
            RemoveStats(_state);
        }
        private  bool _isDisposed = false;

        public MyChart? Chart { get; set; } = null;
        public bool chartSet = false;


        int lastOffset2 = 0;
        public bool Process(DataPacket packet)
        {
            if (_isDisposed) return false;
            SetChart(packet); 

//            double C0 = packet.Channel[0] * scale_C0;
//            bool isDiscontinuity = packet.Stage2_Offset != lastOffset2;

            lastOffset2 = packet.Offset;

            double x = packet.TimeStamp;
            double y = packet.LightEnvelope;
            bool changed = false;

//            if (isDiscontinuity)
//                fixer.Predict(ref x, ref y);
//            else
//                changed = fixer.Fix(ref x, ref y);
            
            telemetry["-Time"] = new XY(x, x);  // - means label only, do not graph.  Also, output time (x) as value, hence x,x.

            telemetry[_stateLabel_Raw] = new XY(x, y);

            lock (StatsLock)
            {
                var stateData = Stats.TryGetValue(_state, out var sd) ? sd : Stats[_state] = new StateData();

                var ra = stateData.RA;
                var _buffer = stateData.Buffer;
                var _ra_index = stateData.Index;

                ra.Add(y);
                stateData.LastTimestamp = x;
                _buffer[_ra_index++] = new XY(x, y);
                if (_ra_index == ra_Size) _ra_index = 0;

                if (ra.Count == ra_Size)
                {
                    uint delay = (ra_Size - 1) / 2;
                    uint bufferIndex = (_ra_index + delay) % ra_Size;
//                    telemetry[_stateLabel_Signal] = new XY(_buffer[bufferIndex].x, _buffer[bufferIndex].y - ra.Average);
                }


                stateData.Index = _ra_index;

                PruneStaleStats(x);
                UpdateSharedScaleFromStats();
            }

            Chart?.AddData(telemetry);

            return changed;
        }


        private static void RemoveStats(HeadState state)
        {
            lock (StatsLock)
            {
                if (Stats.Remove(state))
                    UpdateSharedScaleFromStats();
            }
        }

        private static void PruneStaleStats(double currentTimestamp)
        {
            if (!double.IsFinite(currentTimestamp))
                return;

            double maxAge = Math.Max(1.0, MyPlotter.Window * 1.1);
            List<HeadState>? staleStates = null;

            foreach (var pair in Stats)
            {
                double lastTimestamp = pair.Value.LastTimestamp;
                if (!double.IsFinite(lastTimestamp))
                    continue;

                double age = currentTimestamp - lastTimestamp;
                if (age <= maxAge && age >= -1.0)
                    continue;

                staleStates ??= [];
                staleStates.Add(pair.Key);
            }

            if (staleStates == null)
                return;

            foreach (HeadState state in staleStates)
                Stats.Remove(state);
        }

        private static void UpdateSharedScaleFromStats()
        {
            if (Stats.Count == 0)
            {
                MyPlot.ResetSharedScaling();
                return;
            }

            double min = double.MaxValue;
            double max = double.MinValue;

            foreach (StateData stat in Stats.Values)
            {
                if (stat.RA.Count == 0)
                    continue;

                if (stat.RA.Min < min) min = stat.RA.Min;
                if (stat.RA.Max > max) max = stat.RA.Max;
            }

            if (!double.IsFinite(min) || !double.IsFinite(max) || min == double.MaxValue || max == double.MinValue)
            {
                MyPlot.ResetSharedScaling();
                return;
            }

            MyPlot.Shared_MinY = min;
            MyPlot.Shared_MaxY = max;
        }


        private bool SetChart(DataPacket packet)
        {
            if (chartSet) return true;

            if (Chart?.GetMetrics() is var metrics && metrics != null)
            {
                lastOffset2 = packet.Offset;
                chartSet = true;

                return true;
            }
            else
                return false;
            
        }
    }
}
