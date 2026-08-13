using OpenTK.Graphics.OpenGL4;
using OpenTK.Mathematics;
using TheLib;
using TheLib.Math;
using TheLib.Packets;
using System.Collections.Concurrent;
using System.ComponentModel;
using System.Reflection;
using System.Text;
using Asano.MyGLTools.Backgrounds;
using Asano.MyGLTools.Fonts;
using Asano.MyGLTools.Helpers;

namespace Asano.MyGLTools.UserControls
{

    [ToolboxItem(true)]
    public partial class MyChart : MyPlotterWithAxes
    {
        private const int WindowSize = 0x10000;
        private const uint SingleStateKey = 0;

        public static MyChart? ActiveChart { get; set; } = null;

        public bool EnablePlots  { get; set; } = true;
        public bool EnableLabels { get; set; } = true;

        public MyColour LabelAreaColour { get; set; } = new(226, 176, 113, 255);

        private readonly ConcurrentDictionary<uint, double> _latestValues = [];
        private readonly ConcurrentDictionary<uint, Tuple<TextBlock, TextBlock>> _blocks = [];
        private readonly ConcurrentDictionary<uint, Color> _plotLabelColours = [];

        int _numLabels = 0;
        private readonly List<TextBlock> _textBlocksToRender = [];
        private readonly List<TextBlock> _textBlocksForBounds = [];
        private readonly List<ColouredTextBlock> _colouredLabelBlocksToRender = [];

        private readonly ConcurrentDictionary<uint, bool> _pendingStates = [];

        private LabelAreaRenderer? _labelAreaRenderer;

        private readonly struct ColouredTextBlock(TextBlock block, Color colour)
        {
            public TextBlock Block { get; } = block;
            public Color Colour { get; } = colour;
        }

        struct DataSelectorInfo
        {
            public string    Name;
            public FieldEnum Selector;
            public uint      AdditionalMask;
        }

        static readonly List<DataSelectorInfo> dataSelectorsToOutput = [];
        static readonly List<DataSelectorInfo> dataSelectorsToPlot = [];
        static readonly List<DataSelectorInfo> dataSelectorsForLabels = [];

        private readonly object _lock = new();

        static readonly string[] dataFieldsToPlot = [
//            "Top"   , "Bot" , "Mid",
//            "Offset", "Gain",
              "RawSensor1", // "Sensor1",
              "RawSensor2", // "Sensor2",
            ];

        static readonly string[] dataFieldsForLabels = [
              "Top"   , "Bot" , "Mid",
              "Offset", "Gain",
              "RawSensor1", // "Sensor1",
              "RawSensor2", // "Sensor2",
            ];

        private readonly float _labelLineSpacing = 35f;
        private readonly float _labelTopMargin   = 20f;
        private uint _lastSingleStateLabelState = uint.MaxValue;

        public WipersChangedMessage   LastWipersChange   { get; private set; } = new();
        public VoltagesChangedMessage LastVoltagesChange { get; private set; } = new();
        public HeadState? ChartState { get; set; }
        public bool PauseSchedulerOnlyWhenActive { get; set; }
        private bool _activateOnMouseDown;
        public bool ActivateOnMouseDown
        {
            get => _activateOnMouseDown;
            set
            {
                if (_activateOnMouseDown == value)
                    return;

                _activateOnMouseDown = value;

                if (Program.IsRunning == false || MyGL == null)
                    return;

                if (value)
                {
                    MouseDown += ActivateChart;
                    MyGL.MouseDown += ActivateChart;
                }
                else
                {
                    MouseDown -= ActivateChart;
                    MyGL.MouseDown -= ActivateChart;
                }
            }
        }

        public void Activate()
        {
            if (ReferenceEquals(ActiveChart, this))
            {
                SetChartActive(true);
                PostActiveChartState();
                return;
            }

            ActiveChart?.SetChartActive(false);
            ActiveChart = this;
            SetChartActive(true);
            PostActiveChartState();
        }

        private void ActivateChart(object? sender, EventArgs e)
        {
            Activate();
        }


        Padding onePadding = new(1);
        private void SetChartActive(bool active)
        {
            this.BorderStyle = active ? BorderStyle.Fixed3D : BorderStyle.FixedSingle;
            this.Margin = active ? Padding.Empty : onePadding;
        }

        protected override bool ShouldPauseSchedulerOnMouseDown(MouseEventArgs e)
            => !PauseSchedulerOnlyWhenActive || ReferenceEquals(ActiveChart, this);

        private void PostActiveChartState()
        {
            if (ChartState.HasValue)
                Program.Caldera?.PostStateChange(unchecked((int)ChartState.Value), force: true);
        }

        public void CopyLatestCalderaMessages(
            WipersChangedMessage wipersChange,
            VoltagesChangedMessage voltagesChange)
        {
            ArgumentNullException.ThrowIfNull(wipersChange);
            ArgumentNullException.ThrowIfNull(voltagesChange);

            lock (_lock)
            {
                wipersChange.CopyFrom(LastWipersChange);
                voltagesChange.CopyFrom(LastVoltagesChange);
            }
        }

        public MyChart()
        {
            InitializeComponent();
            
            if (Program.SerialPort == null) return;

            Program.SerialPort.ConnectionChanged += SP_ConnectionChanged;

            var properties = typeof(DataPacket).GetProperties(BindingFlags.Public | BindingFlags.Instance);

            if (dataSelectorsToOutput.Count > 0) return;

            var allDataFields = dataFieldsToPlot
                .Concat(dataFieldsForLabels)
                .Distinct()
                .ToArray();

            for (uint count = 1; count <= allDataFields.Length; count++)
            {
                
                var match = properties.Where(p => p.Name == allDataFields[count - 1]);
                if (!match.Any()) throw new Exception($"Invalid field name '{allDataFields[count - 1]}'.");

                var property = match.First();
                if (Enum.TryParse<FieldEnum>(property.Name, ignoreCase: true, out var field) == false) continue;

                var dsInfo = new DataSelectorInfo
                {
                    Name = property.Name,
                    Selector = field,
                    AdditionalMask = count << 12 // 12 > number of red LEDs.  top bit < 16 (IR1) so as not to overlap state bits
                };

                dataSelectorsToOutput.Add(dsInfo); // for latest values tracking, which handles both plots and labels

                if (dataFieldsToPlot   .Contains(property.Name)) dataSelectorsToPlot   .Add(dsInfo);
                if (dataFieldsForLabels.Contains(property.Name)) dataSelectorsForLabels.Add(dsInfo);
            }

            this.Resize += (s, e) =>
            {
                lock (_lock)
                {
                    uint[] orderedKeys = [.. _blocks.Keys.OrderByDescending(k => _blocks[k].Item1.Y)];

                    int index = 1;
                    foreach (var key in orderedKeys)
                    {
                        float yPos = Height - _labelTopMargin -  index * _labelLineSpacing;
                        float valueYPos = yPos + 0.01f; // to maintain ordering
                        var tuple = _blocks[key];

                        if (tuple.Item1.Y != yPos || tuple.Item2.Y != valueYPos)
                        {
                            tuple.Item1.Y = yPos;
                            tuple.Item2.Y = valueYPos;  
                            tuple.Item1.Bounds = RectangleF.Empty;
                            tuple.Item2.Bounds = RectangleF.Empty;
                            maxBounds = RectangleF.Empty;
                        }

                        index++;
                    }

                }
            };
        }

        public void SP_DataReceived(BlockPacket packet)
        {
            if (IsLoaded == false) return;  // ignore packets until control is fully loaded (i.e. GL.Init called, otherwise Task.Enqueue gets Inits out of order)

            if (packet.Count == 0) return;

            bool singleStateMode = Config.DEBUG_MODE == DebugMode.SINGLE_STATE;
            uint labelState = (uint)packet  .State;
            uint state = singleStateMode ? SingleStateKey : labelState;

            if (EnablePlots)
                lock (PlotsLock)
                {
                    if (Plots.ContainsKey(state) == false)
                        if (TestAndSetPending(state) == false)
                        {
                            AddPlotWithLabelColour(state, new MyPlot(WindowSize, this), MyColour.GetFieldColour(FieldEnum.C0));

                            foreach (var info in dataSelectorsToPlot)
                                AddPlotWithLabelColour(state | info.AdditionalMask, new MyPlot(WindowSize, this)
                                {
                                    Yscale = 1.0,
                                    Colour = MyColour.GetNextColour(),
                                    Selector = info.Selector
                                }, MyColour.GetFieldColour(info.Selector));
                        }
                        else
                            return;

                    Plots[state].Add(packet);
                    foreach (var info in dataSelectorsToPlot)
                        Plots[state | info.AdditionalMask].Add(packet);


                }

            if (EnableLabels == false || font == null) return;  // packet received before GL is initialized

            bool updateLabels = _blocks.ContainsKey(state) == false
                             || (singleStateMode && _lastSingleStateLabelState != labelState);

            if (updateLabels)
            {
                string description = packet.State.Description();
                CreateOrUpdateTextBlocksForLabel(state, description + " A2D %", "0.0%");

                foreach (var info in dataSelectorsForLabels)
                    CreateOrUpdateTextBlocksForLabel(state | info.AdditionalMask, description + " " + info.Name, "F2");

                if (singleStateMode)
                    _lastSingleStateLabelState = labelState;
            }



            if (packet.Count > 0)
            {
                ref DataPacket data = ref packet.BlockData[packet.Count - 1];

                float c0_percentage = (float)(data.Channel[0] * 100.0 * Config.ChannelScale);

                lock (_lock)
                {
                    _latestValues[state] = c0_percentage;
                    foreach (var info in dataSelectorsToOutput)
                        _latestValues[state | info.AdditionalMask] = data.get(info.Selector);

                    LastWipersChange.CopyFrom(packet);
                    LastVoltagesChange.CopyFrom(packet);

                    if (LastWipersChange.IsValid == false || LastVoltagesChange.IsValid == false)
                    {
                        System.Diagnostics.Debug.WriteLine($"Invalid WipersChangedMessage or VoltagesChangedMessage in MyChart after receiving BlockPacket. WipersValid: {LastWipersChange.IsValid}, VoltagesValid: {LastVoltagesChange.IsValid}");
                    }
                }
            }


        }

        public void AddData(Dictionary<string, double> data)
        {
            var timeKey = data.Keys.FirstOrDefault(k => k.Equals("Time", StringComparison.OrdinalIgnoreCase));
            double timeValue = 0;
            var hasTime = timeKey is not null && data.TryGetValue(timeKey!, out timeValue);

            foreach (var (key, value) in data)
            {
                if (string.IsNullOrWhiteSpace(key))
                    continue;

                uint stateHash = (uint)key.GetHashCode();

                if (!_blocks.ContainsKey(stateHash)) 
                    CreateTextBlocksForLabel(stateHash, key);

                lock (_lock)
                    _latestValues[stateHash] = value;


                if (key.StartsWith('-')) continue;  // label only

                if (!Plots.TryGetValue(stateHash, out var plot))
                {
                    if (TestAndSetPending(stateHash))
                        continue;

                    plot = new(WindowSize, this) { Yscale = 1.0, AutoScaling = key.StartsWith('+'), SharedScaling = key.StartsWith('*') };

                    lock (PlotsLock)
                        AddPlotWithLabelColour(stateHash, plot);
                }

                if (hasTime && !key.Equals(timeKey, StringComparison.OrdinalIgnoreCase))
                    plot.Add(timeValue, value);
                else if (!hasTime)
                    plot.Add(value);
            }
        }

        public void AddData(Dictionary<string, XY> data)
        {
            foreach (var (key, xy) in data)
            {
                if (string.IsNullOrWhiteSpace(key))
                    continue;
                uint stateHash = (uint)key.GetHashCode();
                if (!_blocks.ContainsKey(stateHash))
                    CreateTextBlocksForLabel(stateHash, key);


                lock (_lock)
                    _latestValues[stateHash] = xy.y;

                if (key.StartsWith('-')) continue;  // label only
                if (!Plots.TryGetValue(stateHash, out var plot))
                {
                    if (TestAndSetPending(stateHash))
                        continue;
                    plot = new(WindowSize, this) { Yscale = 1.0, AutoScaling = key.StartsWith('+'), SharedScaling = key.StartsWith('*') };
                    lock (PlotsLock)
                        AddPlotWithLabelColour(stateHash, plot);
                }
                plot.Add(xy.x, xy.y);
            }
        }

        public void AddData(Dictionary<string, double[]> data)
        {
            // Find Time series (case-insensitive) in a single pass
            string? timeKey = null;
            double[]? timeValues = null;

            foreach (var kv in data)
            {
                if (kv.Key.Equals("Time", StringComparison.OrdinalIgnoreCase))
                {
                    timeKey = kv.Key;       // preserve actual key casing used in the dictionary
                    timeValues = kv.Value;
                    break;
                }
            }

            bool hasTime = timeValues is { Length: > 0 };
            double timeValue = hasTime ? timeValues![^1] : 0.0;

            foreach (var (key, values) in data)
            {
                if (string.IsNullOrWhiteSpace(key))
                    continue;

                // Don't treat Time as a plot series
                if (timeKey is not null && key.Equals(timeKey, StringComparison.OrdinalIgnoreCase))
                    continue;

                if (values is null || values.Length == 0)
                    continue; // nothing to add, also avoids Last()

                uint stateHash = unchecked((uint)key.GetHashCode());

                if (!Plots.TryGetValue(stateHash, out var plot))
                {
                    if (TestAndSetPending(stateHash))
                        continue;

                    plot = new(WindowSize, this) { Yscale = 1.0 };

                    lock (PlotsLock)
                        AddPlotWithLabelColour(stateHash, plot);

                    CreateTextBlocksForLabel(stateHash, key);
                }

                if (hasTime && timeValues!.Length == values.Length)    for (int i = 1; i < values.Length; i++)  plot.Add(timeValues[i], values[i]);
                else if (hasTime)                                      for (int i = 0; i < values.Length; i++)  plot.Add(timeValue    , values[i]);
                else                                                   for (int i = 0; i < values.Length; i++)  plot.Add(values[i]);

                // Last sample for this series
                double last = values[^1];
                lock (_lock)
                    _latestValues[stateHash] = last;
            }
        }


        private bool TestAndSetPending(uint state)
        {
            lock (_lock)
            {
                if (_pendingStates.ContainsKey(state)) return true;
                _pendingStates[state] = true;
                return false;
            }
        }

        private void AddPlotWithLabelColour(uint state, MyPlot plot, MyColour? labelColour = null)
        {
            AddPlot(state, plot);
            _plotLabelColours[state] = (labelColour ?? plot.Colour).ToColor();
        }

        protected override void Init()
        {
            base.Init();
            _labelAreaRenderer = new(this);
        }

        protected override void Shutdown()
        {
            base.Shutdown();
            _labelAreaRenderer?.Shutdown();
        }

        private void CreateTextBlocksForLabel(uint state, string label, string valueFormat = "F2")
        {
            if (font == null) return;

            string labelText = $": {label}";

            lock (_lock)
            {
                _numLabels++;
                float yPos = MyGL.Height - _labelTopMargin - (_numLabels * _labelLineSpacing);

                var labelBlock = new TextBlock(labelText, 126, 0, font);
                var valueBlock = new TextBlock("0.00", 120, 0, font, TextAlign.Right, valueFormat);

                labelBlock.Y = yPos;
                valueBlock.Y = yPos + 0.01f;  // to maintain ordering

                _blocks[state] = Tuple.Create(labelBlock, valueBlock);
            }
            _pendingStates.TryRemove(state, out _);
        }

        private void CreateOrUpdateTextBlocksForLabel(uint state, string label, string valueFormat = "F2")
        {
            lock (_lock)
            {
                if (_blocks.TryGetValue(state, out var tuple))
                {
                    tuple.Item1.SetValue($": {label}");
                    return;
                }

                CreateTextBlocksForLabel(state, label, valueFormat);
            }
        }


        uint[] _keyCache = [];

        protected override void DrawText()
        {
            base.DrawText();

            if (font == null) return;

            _textBlocksToRender.Clear();
            _textBlocksForBounds.Clear();
            _colouredLabelBlocksToRender.Clear();

            lock (_lock)
            {
                int index = 1;

                if (_keyCache.Length != _latestValues.Count)
                    _keyCache = [.. _latestValues.Keys];

                for (int i = 0; i < _latestValues.Count; i++)
                {
                    uint stateKey = _keyCache[i];
                    if (_blocks.TryGetValue(stateKey, out var tuple))
                    {
                        tuple.Item2.SetValue(_latestValues[stateKey]);

                        _textBlocksForBounds.Add(tuple.Item1);
                        _textBlocksForBounds.Add(tuple.Item2);

                        if (_plotLabelColours.TryGetValue(stateKey, out Color labelColour))
                            _colouredLabelBlocksToRender.Add(new ColouredTextBlock(tuple.Item1, labelColour));
                        else
                            _textBlocksToRender.Add(tuple.Item1);

                        _textBlocksToRender.Add(tuple.Item2);

                        index++;
                    }
                }
            }

            if (_textBlocksForBounds.Count == 0) return;

            // 2. Calculate the total bounding box for all visible labels.
            RectangleF totalBounds = _textBlocksForBounds.CalculateTotalBounds(ref maxBounds);

            // 3. Render the background with padding.
            if (!totalBounds.IsEmpty)
            {
                float padding = 10f;
                var paddedBounds = new RectangleF(
                    totalBounds.X - padding,
                    totalBounds.Y - padding,
                    totalBounds.Width + (padding * 2),
                    totalBounds.Height + (padding * 2)
                );
                var projection = Matrix4.CreateOrthographicOffCenter(0, MyGL.DisplayRectangle.Width, 0, MyGL.DisplayRectangle.Height, -1.0f, 1.0f);

                _labelAreaRenderer?.Render(paddedBounds, projection, LabelAreaColour);

                GL.UseProgram(_textShaderProgram);
            }

            if (_textBlocksToRender.Count > 0)
                fontRenderer.RenderText(_textBlocksToRender);

            RenderColouredLabels();
        }

        RectangleF maxBounds = RectangleF.Empty;

        // Return this helper method inside the MyChart class

        private void RenderColouredLabels()
        {
            if (_colouredLabelBlocksToRender.Count == 0)
                return;

            Color oldColour = TextColour;

            foreach (var item in _colouredLabelBlocksToRender)
            {
                TextColour = item.Colour;
                fontRenderer.RenderText(item.Block);
            }

            TextColour = oldColour;
        }

        protected override void SP_ConnectionChanged(ConnectionState state)
        {
            base.SP_ConnectionChanged(state);

            if (state == ConnectionState.Connected || state == ConnectionState.Disconnected)
                lock (_lock)
                {
                    _blocks.Clear();
                    _latestValues.Clear();
                    _plotLabelColours.Clear();
                    _pendingStates.Clear();
                    _keyCache = [];
                    maxBounds = RectangleF.Empty;
                    _numLabels = 0;
                    _lastSingleStateLabelState = uint.MaxValue;
                    MyColour.Reset();
                }
        }

        public void ResetData()
        {
            SP_ConnectionChanged(ConnectionState.Disconnected);
            ClearGL();
        }

        public AString getDebugOutput(int index)
        {
            StringBuilder sb = new();
            sb.Append($"Chart {Tag}: ");
            lock (PlotsLock)
            {
                var orderedPlots = Plots.OrderBy(p => p.Key);

                for (int i = 0; i < orderedPlots.Count(); i++)
                {
                    uint   key  = orderedPlots.ElementAt(i).Key;
                    MyPlot plot = orderedPlots.ElementAt(i).Value;

                    plot.Visible = i != (index % orderedPlots.Count());

                    sb.Append($"S:0x{(key>>12) & 0xF:X1} ({plot.DBG})  ");
                }
            }
            return AString.FromStringBuilder(sb);
        }
    }
}
