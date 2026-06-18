using Asano.MyGLTools.Helpers;
using System.Diagnostics;
using TheLib;
using TheLib.Math;
using static System.Net.Mime.MediaTypeNames;

namespace Asano.MyGLTools.UserControls
{
    public partial class MyMultichart : MyTLPChart
    {
        private static MySerialPort SP => Program.SerialPort ?? throw new InvalidOperationException("Serial port must be set before using MyMultichart.");
        private readonly object _lock = new();
        private readonly Dictionary<HeadState, MyChart> _chartsByState = [];
        private readonly Dictionary<HeadState, int> _initStates = [];
        private readonly Stopwatch _swInit = new();
        private readonly object _primaryChartTagLock = new();
        private readonly MethodInvoker _applyPrimaryChartTag;

        private FormState _state = FormState.None;
        private int _lastChartCount = -1;
        private string _pendingPrimaryChartTag = string.Empty;

        public event EventHandler<int>? ChartCountChanged;
        public bool SingleStateMode { get; private set; } = false;

        private enum FormState {  None, Initialising, Building, Running }

        public MyMultichart()
        {
            InitializeComponent();
            _applyPrimaryChartTag = ApplyPrimaryChartTag;

            
            SP.BlockPacketReceived += AddBlockPacket;
            SP.ConnectionChanged += ConnectionChanged;
            SP.ParsedParametersReceived += (data) => AddData(data);
            Clear();
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Scheduler.TargetFrameRate = this.GetCurrentRefreshRate();
        }

        public bool IsRunning => _state == FormState.Running;

        public IReadOnlyDictionary<HeadState, MyChart> Charts { get { lock (_lock) return new Dictionary<HeadState, MyChart>(_chartsByState); } }

        public void BeginInitialising()
        {
            RefreshSingleStateMode();

            if (_state == FormState.None) SetState(FormState.Initialising);
        }

        public void Clear() => SetState(FormState.None);
        
        private void ConnectionChanged(ConnectionState state)
        {
            switch (state)
            {
                case ConnectionState.Connected:
                case ConnectionState.Disconnected: Clear(); break;

                case ConnectionState.HandshakeSuccessful: BeginInitialising(); break;

            }
        }

        public void AddBlockPacket(BlockPacket blockPacket)
        {
            RefreshSingleStateMode();

            if (blockPacket.Count == 0) return;

            if (_state != FormState.Running)
            {
                Init_Packet(blockPacket);
                return;
            }

            Scheduler.UpdateLatestTime( blockPacket.BlockData[blockPacket.Count - 1].TimeStamp );


            MyChart? chart = SingleStateMode ? GetSingleStateChart(blockPacket.State)
                                             : GetOrAddChart(blockPacket.State);
            chart?.SP_DataReceived(blockPacket);
        }



        private void RefreshSingleStateMode() => SingleStateMode = Config.DEBUG_MODE == "SINGLE_STATE";

        public void AddData(Dictionary<string, double> data)   => PrimaryChart.AddData(data);
        public void AddData(Dictionary<string, XY> data)       => PrimaryChart.AddData(data);
        public void AddData(Dictionary<string, double[]> data) => PrimaryChart.AddData(data);

        public MyChart[] GetCharts() { lock (_lock) return [.. _chartsByState.OrderBy(pair => pair.Key).Select(pair => pair.Value)]; }

        private void SetState(FormState state)
        {
            _state = state;
            _swInit.Restart();

            switch (_state)
            {
                case FormState.None:     ClearState();         break;
                case FormState.Building: BuildInitialCharts(); break;
            }
        }

        private void ClearState()
        {
            lock (_lock)
            {
                _chartsByState.Clear();
                _initStates.Clear();
            }

            ResetCharts();
            OnChartCountChanged(1);
        }

        private void Init_Packet(BlockPacket blockPacket)
        {
            if (_state == FormState.None)
                SetState(FormState.Initialising);

            if (_state != FormState.Initialising) return;

            bool buildCharts;

            lock (_lock)
            {
                if (SingleStateMode)
                {
                    _initStates.Clear();
                    _initStates.Add(blockPacket.State, 3);
                }
                else if (_initStates.TryGetValue(blockPacket.State, out int count) == false)
                    _initStates.Add(blockPacket.State, 0);
                else
                    _initStates[blockPacket.State] = ++count;

                buildCharts = SingleStateMode
                           || _initStates[blockPacket.State] > 2
                           || _swInit.ElapsedMilliseconds > 1000;
            }

            if (buildCharts)
                SetState(FormState.Building);
        }

        private void BuildInitialCharts()
        {
            HeadState[] states;

            lock (_lock)
                states = [.. _initStates.Keys];

            if (states.Length == 0) return;

            Array.Sort(states);

            if (SingleStateMode && states.Length > 1)
                states = [states[^1]];

            RunOnUiThread(() =>
            {
                Dictionary<HeadState, MyChart> chartsByState = [];
                List<MyChart> charts = [];

                for (int i = 0; i < states.Length; i++)
                {
                    var state = states[i];
                    MyChart chart = i == 0 ? PrimaryChart : CreateChart(state.Description());

                    chart.ChartState = state;
                    chart.Tag = state.Description();

                    chartsByState[state] = chart;
                    charts.Add(chart);
                }

                lock (_lock)
                {
                    _chartsByState.Clear();

                    foreach (var pair in chartsByState)
                        _chartsByState[pair.Key] = pair.Value;
                }

                SetCharts(charts);
                OnChartCountChanged(charts.Count);
                SetState(FormState.Running);
            });
        }

        private MyChart? GetOrAddChart(HeadState state)
        {
            lock (_lock)
                if (_chartsByState.TryGetValue(state, out var existingChart))
                    return existingChart;

            return RunOnUiThread(() =>
            {
                lock (_lock)
                    if (_chartsByState.TryGetValue(state, out var existingChart))
                        return existingChart;

                MyChart chart = CreateChart(state.Description());
                chart.ChartState = state;

                lock (_lock)
                    _chartsByState[state] = chart;

                LayoutStateCharts();
                return chart;
            });
        }

        private MyChart? GetSingleStateChart(HeadState state)
        {
            string description = state.Description();
            PrimaryChart.ChartState = state;
            bool resetLayout;
            bool updateTag;

            lock (_lock)
            {
                resetLayout = _chartsByState.Count != 1 || !ContainsOnlyPrimaryChart();
                updateTag = (PrimaryChart.Tag as string) != description;
                bool updateState = resetLayout
                                || _chartsByState.TryGetValue(state, out var existingChart) == false
                                || existingChart != PrimaryChart;

                if (updateState)
                {
                    _chartsByState.Clear();
                    _chartsByState[state] = PrimaryChart;

                    _initStates.Clear();
                    _initStates[state] = 0;
                }
            }

            if (resetLayout)
            {
                ResetCharts();
                OnChartCountChanged(1);
            }

            if (updateTag)
                SetPrimaryChartTag(description);

            return PrimaryChart;
        }

        private void SetPrimaryChartTag(string description)
        {
            lock (_primaryChartTagLock)
            {
                _pendingPrimaryChartTag = description;
                RunOnUiThread(_applyPrimaryChartTag);
            }
        }

        private void ApplyPrimaryChartTag()
        {
            PrimaryChart.Tag = _pendingPrimaryChartTag;
        }

        private bool ContainsOnlyPrimaryChart()
        {
            foreach (var pair in _chartsByState)
                return pair.Value == PrimaryChart;

            return false;
        }

        private void LayoutStateCharts()
        {
            MyChart[] charts;

            lock (_lock)
                charts = [.. _chartsByState.OrderBy(pair => pair.Key).Select(pair => pair.Value)];

            SetCharts(charts);
            OnChartCountChanged(charts.Length);
        }

        private void OnChartCountChanged(int count)
        {
            if (_lastChartCount == count) return;

            _lastChartCount = count;
            ChartCountChanged?.Invoke(this, count);
        }
    }
}
