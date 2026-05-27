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



        private readonly ConcurrentDictionary<uint, double> _latestValues = [];
        private readonly ConcurrentDictionary<uint, Tuple<TextBlock, TextBlock>> _blocks = [];

        int _numLabels = 0;
        private readonly List<TextBlock> _textBlocksToRender = [];

        private readonly ConcurrentDictionary<uint, bool> _pendingStates = [];

        private LabelAreaRenderer? _labelAreaRenderer;

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
              "RawSensor1", // "RawSensor1",
              "RawSensor2", // "RawSensor2",
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
            AxesOptions.GridSettings = PlotAxesRenderer.GridFlags.VerticalLines | PlotAxesRenderer.GridFlags.XaxisLabels;
            AxesOptions.LabelColor = Color.FromArgb(32, 32, 32, 32);

            if (SP == null) return;
            ActiveChart ??= this;

            SP.ConnectionChanged += SP_ConnectionChanged;

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
                    AdditionalMask = count << 12 // 12 > number of red LEDs, and < 16 (IR1) so as not to overlap state bits
                };

                dataSelectorsToOutput.Add(dsInfo); // for latest values tracking, which handles both plots and labels

                if (dataFieldsToPlot   .Contains(property.Name)) dataSelectorsToPlot   .Add(dsInfo);
                if (dataFieldsForLabels.Contains(property.Name)) dataSelectorsForLabels.Add(dsInfo);
            }

            this.Resize += (s, e) =>
            {
                lock (PlotsLock)
                {
                    int index = 1;

                    uint[] orderedKeys = [.. _blocks.Keys.OrderBy(k => -_blocks[k].Item1.Y)];

                    foreach (var key in orderedKeys)
                    {
                        float yPos = Height - _labelTopMargin -  index * _labelLineSpacing;

                        _blocks[key].Item1.Y = yPos;
                        _blocks[key].Item2.Y = yPos + 0.01f;  // to maintain ordering
                        index++;
                    }
                }
            };
        }

        public void SP_DataReceived(IPacket packet)
        {
            if (IsLoaded == false) return;  // ignore packets until control is fully loaded (i.e. GL.Init called, otherwise Task.Enqueue gets Inits out of order)

            if (packet is not BlockPacket blockPacket) return;
            if (blockPacket.Count == 0) return;

            bool singleStateMode = Config.DEBUG_MODE == "SINGLE_STATE";
            uint labelState = (uint)blockPacket.State;
            uint state = singleStateMode ? SingleStateKey : labelState;

            if (EnablePlots)
                lock (PlotsLock)
                {
                    if (Plots.ContainsKey(state) == false)
                        if (TestAndSetPending(state) == false)
                        {
                            AddPlot(state, new MyPlot(WindowSize, this));

                            foreach (var info in dataSelectorsToPlot)
                                AddPlot(state | info.AdditionalMask, new MyPlot(WindowSize, this)
                                {
                                    Yscale = 1.0,
                                    Colour = MyColour.GetNextColour(),
                                    Selector = info.Selector
                                });
                        }
                        else
                            return;

                    Plots[state].Add(blockPacket);
                    foreach (var info in dataSelectorsToPlot)
                        Plots[state | info.AdditionalMask].Add(blockPacket);


                }

            if (EnableLabels == false || font == null) return;  // packet received before GL is initialized

            bool updateLabels = _blocks.ContainsKey(state) == false
                             || (singleStateMode && _lastSingleStateLabelState != labelState);

            if (updateLabels)
            {
                string description = blockPacket.State.Description();

                CreateOrUpdateTextBlocksForLabel(state, description + " A2D %", "0.0%");

                foreach (var info in dataSelectorsForLabels)
                    CreateOrUpdateTextBlocksForLabel(state | info.AdditionalMask, description + " " + info.Name, "F2");

                if (singleStateMode)
                    _lastSingleStateLabelState = labelState;
            }



            if (blockPacket.Count > 0)
            {
                ref DataPacket data = ref blockPacket.BlockData[blockPacket.Count - 1];

                float c0_percentage = (float)(data.Channel[0] * 100.0 * Config.ChannelScale);

                lock (_lock)
                {
                    _latestValues[state] = c0_percentage;
                    foreach (var info in dataSelectorsToOutput)
                        _latestValues[state | info.AdditionalMask] = data.get(info.Selector);

                    LastWipersChange.CopyFrom(blockPacket);
                    LastVoltagesChange.CopyFrom(blockPacket);
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
                        AddPlot(stateHash, plot);
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
                        AddPlot(stateHash, plot);
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
                        AddPlot(stateHash, plot);

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
        protected override void Init()
        {
            base.Init();
            _labelAreaRenderer = new(this, "Resources/Backgrounds/LabelArea.png");
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

                        _textBlocksToRender.Add(tuple.Item1);
                        _textBlocksToRender.Add(tuple.Item2);

                        index++;
                    }
                }
            }

            if (_textBlocksToRender.Count == 0) return;

            // 2. Calculate the total bounding box for all visible labels.
            RectangleF totalBounds = _textBlocksToRender.CalculateTotalBounds(ref maxBounds);

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
                var projection = Matrix4.CreateOrthographicOffCenter(0, MyGL.ClientSize.Width, 0, MyGL.ClientSize.Height, -1.0f, 1.0f);

                _labelAreaRenderer?.Render(paddedBounds, projection);

                GL.UseProgram(_textShaderProgram);
            }

            fontRenderer.RenderText(_textBlocksToRender);
        }

        RectangleF maxBounds = RectangleF.Empty;

        // Return this helper method inside the MyChart class

        protected override void SP_ConnectionChanged(ConnectionState state)
        {
            base.SP_ConnectionChanged(state);

            if (state == ConnectionState.Connected || state == ConnectionState.Disconnected)
                lock (_lock)
                {
                    _blocks.Clear();
                    _latestValues.Clear();
                    _pendingStates.Clear();
                    _keyCache = [];
                    _numLabels = 0;
                    _lastSingleStateLabelState = uint.MaxValue;
                    MyColour.Reset();
                }
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
