using System.Collections.Concurrent;

using OpenTK.Graphics.OpenGL4;
using OpenTK.Mathematics;

using TheLib;

using Asano.MyGLTools.Backgrounds;
using Asano.MyGLTools.Fonts;
using Asano.MyGLTools.Helpers;

namespace Asano.MyGLTools.UserControls
{
    public partial class MyTelemetryPane : MyGLControl
    {

        private readonly ConcurrentDictionary<uint, double> _latestValues = [];
        private readonly ConcurrentDictionary<uint, Tuple<TextBlock, TextBlock>> _blocks = [];
        private readonly List<TextBlock> _textBlocksToRender = [];

        private volatile int labelCount = 0;
        private readonly ConcurrentDictionary<uint, bool> _pendingStates = [];

        private readonly MyColour LabelAreaColour = new(216,201,178, 255);

        private LabelAreaRenderer? _labelAreaRenderer;

        private readonly object _lock = new();
        private volatile bool needUpdate = true;

        public MyTelemetryPane()
        {
            InitializeComponent();
        }
        public void SP_DataReceived(IPacket packet)
        {
            if (font == null) return;

            if (packet is TelemetryPacket telePacket == false) return;
            var key = telePacket.Key; if (key == 0) return;

            if (_blocks.ContainsKey(key) == false)
                if (TestAndSetPending(key) == false)
                    CreateTextBlocksForLabel(key, telePacket, "0.00");

            if (_latestValues.TryGetValue(key, out var existingValue))
                if (Math.Abs(existingValue - telePacket.Value) < 0.00001) return;

            _latestValues[key] = telePacket.Value;
            needUpdate = true;
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

        private void CreateTextBlocksForLabel(uint key, TelemetryPacket telePacket, string valueFormat)
        {

            string labelText = $": {telePacket.Description()}";

            lock (_lock)
            {
                Interlocked.Increment(ref labelCount);
                float yPos = MyGL.Height - 20 - labelCount * 32;

                var labelBlock = new TextBlock(labelText, 126, yPos, font);
                var valueBlock = new TextBlock("0.00"   , 120, yPos, font, TextAlign.Right, valueFormat);

                _blocks[key] = Tuple.Create(labelBlock, valueBlock);
            }
            _pendingStates.TryRemove(key, out _);
        }

        protected override void Init()
        {
            base.Init();
            _labelAreaRenderer = new(this) { FillBackground = true };
            AutoClear = false;
        }

        const int RedrawCount = 2;
        int redrawCounter = 0;

        uint[] _keyCache = [];
        protected override void DrawText()
        {
            if (font == null || needUpdate == false) return;

            _textBlocksToRender.Clear();
            // 1. Populate the list of blocks to render and flag if their content has changed.
            lock (_lock)
            {
                if (_keyCache.Length != _latestValues.Count)
                    _keyCache = [.. _latestValues.Keys];


                for (int i = 0; i < _latestValues.Count; i++)
                {
                    uint key = _keyCache[i];
                    if (_blocks.TryGetValue(key, out var tuple))
                    {
                        var item = _latestValues[key];

                        // Check
                        tuple.Item2.SetValue(item);

                        _textBlocksToRender.Add(tuple.Item1);
                        _textBlocksToRender.Add(tuple.Item2);
                    }
                }
            }

            if (!_textBlocksToRender.Any()) return;

            ClearViewport();
            if (++redrawCounter >= RedrawCount)
            {
                needUpdate = false;
                redrawCounter = 0;
            }

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

                _labelAreaRenderer?.Render(paddedBounds, projection, LabelAreaColour);

                GL.UseProgram(_textShaderProgram);
            }

            fontRenderer.RenderText(_textBlocksToRender);
        }


        RectangleF maxBounds = RectangleF.Empty;
    }
}
