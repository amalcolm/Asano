
using Asano.DataTools;
using Asano.MyGLTools.Fonts;
using Asano.MyGLTools.UserControls;
using OpenTK.Mathematics;
using System.Buffers;
using System.Collections.Concurrent;
using TheLib;

namespace Asano.MyGLTools.Helpers
{
    public class Log
    {
        public static Log? Instance { get; private set; }


        public Log(MyGLControl control)
        {
            if (Instance != null) throw new InvalidOperationException("Only one instance of Log is allowed.");
            Instance = this;
            this.control = control;
            
        }
        private readonly MyGLControl control;
        public const int Margin = 8;
        public const double LineSpacing = 1.2;
        int lineHeight;
        LineVertices Elipses;

        public bool isInitialized { get; private set; } = false;
        public void Init()
        {
            var fr = control.fontRenderer;
            lineHeight = (int)(fr.Font.LineHeight * fr.Scaling * LineSpacing);

            MaxNumberOfLines = Math.Max(0, (control.Height - 2 * Margin) / lineHeight);
            Clear();

            string elipsesStr = "...";
            var buf = VertexPool.Rent(elipsesStr.Length * 6);
            float x = 20;
            float y = control.Height - lineHeight - Margin / 2;

            int numVerts = FontVertex.BuildString(buf, 0, elipsesStr.AsSpan(), FontFile.Default, x, y, control.fontRenderer.Scaling, TextAlign.Left);

            Elipses = new LineVertices { Vertices = buf, Length = numVerts };

            control.AutoClear = false;
            isInitialized = true;
        }

        public void Shutdown()
        {
            Clear();
            VertexPool.Return(Elipses.Vertices);
            Elipses = default;
        }

        public static void Clear() => Instance?._Clear();

        private void _Clear()
        {
            while (qStringsToAdd.TryDequeue(out AString? s))
                s?.Dispose();

            for (int i = 0; i < LineBuffers.Length; i++)
                ReturnLine(ref LineBuffers[i]);

            LineBuffers = new LineVertices[MaxNumberOfLines];

            UsedLines = 0;
            scrolledLines = 0;
            linesSinceUpdate = 0;
            baseHeight = -PrecisionBoundary;
            nextHeight = baseHeight + control.Height - Margin - lineHeight;
            UpdateViewport();
        }

        private int MaxNumberOfLines;  // number of lines that fit in the control
        private volatile int nextHeight = 0;  // height of the next line to add
        private volatile int baseHeight = 0;  // base height offset for scrolling
        private int UsedLines = 0;     // total number of lines added so far
        private int scrolledLines = 0; // total line-height scrolls applied to the viewport
        private int linesSinceUpdate = 0;

        readonly ArrayPool<FontVertex> VertexPool = ArrayPool<FontVertex>.Shared;

        private const int PrecisionBoundary = 0x200000;
        private LineVertices[] LineBuffers = [];

        struct LineVertices
        {
            public FontVertex[] Vertices;
            public int Length;
        }

        private readonly ConcurrentQueue<AString> qStringsToAdd = [];

        public static void Add(string str) => Add(AString.FromString(str));
        public static void Add(AString? str) => Instance?._Add(str);
        private void _Add(AString? str)
        {
            if (str?.Length > 0)
            {
                qStringsToAdd.Enqueue(str);
                Interlocked.Increment(ref linesSinceUpdate);
            }
            else
                str?.Dispose();
        }

        public void Update()
        {
            if (MaxNumberOfLines <= 0) return;  // safety for weird resize states

            DrainIncomingStrings();
            UpdateViewport();

            control.ClearViewport();
        }

        private void DrainIncomingStrings()
        {
            int linesAvailable = qStringsToAdd.Count;
            int linesToSkip = Math.Max(0, linesAvailable - MaxNumberOfLines);

            for (int i = 0; i < linesToSkip; i++)
            {
                if (!qStringsToAdd.TryDequeue(out AString? str)) return;

                str?.Dispose();

                UsedLines++;
                nextHeight -= lineHeight;
            }

            int linesToBuild = linesAvailable - linesToSkip;

            for (int i = 0; i < linesToBuild; i++)
            {
                if (!qStringsToAdd.TryDequeue(out AString? str)) break;

                if (str?.Length > 0)
                    AddLine(str);
                else
                    str?.Dispose();
            }

            if (UsedLines > 8 && LogForm.IsOpen == false)
            {
                parentControl ??= control.Parent;
                if (parentControl != null)
                    parentControl.Invoke(() =>
                    {
                        parentControl.Controls.Remove(control);
                        LogForm.Open(control);
                        LogForm.OnClose += LogForm_Close;
                    });
            }
        }

        void LogForm_Close(object? sender, EventArgs e)
        {
             parentControl?.Invoke(() =>
            {
                LogForm.OnClose -= LogForm_Close;
                parentControl.Controls.Add(control);
                parentControl = null;
            });
        }

        Control? parentControl = null;

        private void AddLine(AString str)
        {
            if (str.Length <= 0) return;

            int thisLine = UsedLines % MaxNumberOfLines;
            ReturnLine(ref LineBuffers[thisLine]);

            try
            {
                var buf = VertexPool.Rent(str.Length * 6);
                int numVerts = FontVertex.BuildString(buf, 0, str.Buffer.AsSpan(), FontFile.Default, 0, nextHeight, control.fontRenderer.Scaling, TextAlign.Left);

                LineBuffers[thisLine] = new LineVertices { Vertices = buf, Length = numVerts };
            }
            finally
            {
                str.Dispose();
                UsedLines++;
                nextHeight -= lineHeight;
            }
        }

        private void ReturnLine(ref LineVertices line)
        {
            if (line.Vertices == null) return;

            VertexPool.Return(line.Vertices);
            line = default;
        }

        private void UpdateViewport()
        {
            int targetScrollLines = Math.Max(0, UsedLines - MaxNumberOfLines);
            int newScrollLines = targetScrollLines - scrolledLines;

            if (newScrollLines > 0)
            {
                baseHeight -= newScrollLines * lineHeight;
                scrolledLines = targetScrollLines;
            }

            RebaseIfNeeded();
            var fr = control.fontRenderer;
            float fMargin = Margin;

            fr.ProjectionMatrix = Matrix4.CreateOrthographicOffCenter(
                -fMargin, control.Width - fMargin,
                fMargin + baseHeight, fMargin + control.Height + baseHeight,
                -1, 1);
        }


        public void Draw()
        {
            var fr = control.fontRenderer;

            int activeLines = Math.Min(UsedLines, MaxNumberOfLines);
            for (int i = 0; i < activeLines; i++)
            {
                ref var line = ref LineBuffers[i];
                if (line.Vertices != null)
                    fr.RenderText(line.Vertices, line.Length);
            }

            if (Interlocked.Exchange(ref linesSinceUpdate, 0) == 0) return;

            var proj = Matrix4.CreateOrthographicOffCenter(
                0, control.Width, control.Height, 0, -1, 1); // Y-down for text


            control.SetTextProjection(proj);
            fr.RenderText(Elipses.Vertices, Elipses.Length);
        }

        private void RebaseIfNeeded()
        {
            if (baseHeight > -2 * PrecisionBoundary) return;

            int offset = -PrecisionBoundary - baseHeight;
            baseHeight += offset;
            nextHeight += offset;

            foreach (ref var line in LineBuffers.AsSpan())
                if (line.Vertices != null)
                    for (int i = 0; i < line.Length; i++)
                        line.Vertices[i].Position.Y += offset;
        }
    }

}
