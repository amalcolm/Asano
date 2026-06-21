
namespace Asano.MyGLTools.UserControls
{
    public partial class MyTLPChart : UserControl
    {
        private readonly List<MyChart> _charts = [];
        private int _nextChartIndex = 1;

        protected MyChart PrimaryChart { get; }

        public MyTLPChart()
        {
            InitializeComponent();

            PrimaryChart = chart0;
            PrimaryChart.ActivateOnMouseDown = true;
            PrimaryChart.PauseSchedulerOnlyWhenActive = true;
            _charts.Add(PrimaryChart);
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);

            if (ParentForm != null)
            {
                BackColor = ParentForm.BackColor;
                PrimaryChart.BackColor = BackColor;
            }
        }

        protected MyChart CreateChart(string? tag = null)
        {
            MyChart chart = new()
            {
                AutoClear    = PrimaryChart.AutoClear,
                BackColor    = BackColor,
                BorderStyle  = BorderStyle.FixedSingle,
                Dock         = PrimaryChart.Dock,
                EnableLabels = PrimaryChart.EnableLabels,
                EnablePlots  = PrimaryChart.EnablePlots,
                Padding      = PrimaryChart.Padding,
                ActivateOnMouseDown = true,
                PauseSchedulerOnlyWhenActive = true,
                Tag          = tag,
                TextColour   = PrimaryChart.TextColour,
                Yscale       = PrimaryChart.Yscale
            };

            if (tag != null)
                chart.Name = $"chart{_nextChartIndex++}";

            return chart;
        }

        protected void SetCharts(IReadOnlyList<MyChart> charts)
        {
            if (charts.Count == 0)
                throw new ArgumentException("At least one chart is required.", nameof(charts));

            RunOnUiThread(() =>
            {
                _charts.Clear();
                _charts.AddRange(charts);

                if (MyChart.ActiveChart is not { } activeChart || !_charts.Contains(activeChart))
                    _charts[0].Activate();
                else
                    activeChart.Activate();

                ApplyChartLayout();
            });
        }

        protected void ResetCharts()
        {
            RunOnUiThread(() =>
            {
                MyChart[] chartsToRemove = [.. _charts.Where(chart => chart != PrimaryChart)];

                RecreateChartLayoutPanel();

                foreach (var chart in chartsToRemove)
                    DisposeChart(chart);

                _charts.Clear();
                _charts.Add(PrimaryChart);
                _nextChartIndex = 1;
                PrimaryChart.Activate();
                ApplyChartLayout();
            });
        }

        protected MyChart[] GetChartSnapshot()
        {
            MyChart[] snapshot = [];

            RunOnUiThread(() => snapshot = [.. _charts]);

            return snapshot;
        }

        private void ApplyChartLayout()
        {
            var (cols, rows) = GetLayoutSize(Math.Max(_charts.Count, 1));

            tlpCharts.SuspendLayout();

            try
            {
                ClearChartLayout();

                tlpCharts.ColumnCount = cols;
                tlpCharts.RowCount = rows;

                for (int c = 0; c < cols; c++)
                    tlpCharts.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100.0f / cols));

                for (int r = 0; r < rows; r++)
                    tlpCharts.RowStyles.Add(new RowStyle(SizeType.Percent, 100.0f / rows));

                for (int i = 0; i < _charts.Count; i++)
                {
                    MyChart chart = _charts[i];
                    int column = i % cols;
                    int row = i / cols;

                    chart.Dock = DockStyle.Fill;
                    chart.Visible = true;

                    tlpCharts.Controls.Add(chart, column, row);
                    tlpCharts.SetColumnSpan(chart, 1);
                    tlpCharts.SetRowSpan(chart, 1);
                }
            }
            finally
            {
                tlpCharts.ResumeLayout(true);
            }
        }

        private void ClearChartLayout()
        {
            ClearChartLayout(tlpCharts);
        }

        private static void ClearChartLayout(TableLayoutPanel panel)
        {
            panel.Controls.Clear();

            while (panel.ColumnStyles.Count > 0)
                panel.ColumnStyles.RemoveAt(panel.ColumnStyles.Count - 1);

            while (panel.RowStyles.Count > 0)
                panel.RowStyles.RemoveAt(panel.RowStyles.Count - 1);

            panel.ColumnCount = 0;
            panel.RowCount = 0;
        }

        private void RecreateChartLayoutPanel()
        {
            TableLayoutPanel oldPanel = tlpCharts;
            TableLayoutPanel newPanel = CreateChartLayoutPanel();

            SuspendLayout();
            oldPanel.SuspendLayout();

            try
            {
                ClearChartLayout(oldPanel);
                Controls.Remove(oldPanel);
                tlpCharts = newPanel;
                Controls.Add(tlpCharts);
                tlpCharts.BringToFront();
            }
            finally
            {
                oldPanel.ResumeLayout(false);
                oldPanel.Dispose();
                ResumeLayout(true);
            }
        }

        private static TableLayoutPanel CreateChartLayoutPanel()
            => new()
            {
                Dock = DockStyle.Fill,
                GrowStyle = TableLayoutPanelGrowStyle.FixedSize,
                Margin = new Padding(0),
                Name = "tlpCharts",
                TabIndex = 0,
            };

        private static (int Columns, int Rows) GetLayoutSize(int chartCount)
        {
            if (chartCount <= 1)
                return (1, 1);

            int columns = chartCount < 3
                ? 1
                : (int)Math.Ceiling(Math.Sqrt(chartCount));
            int rows = (int)Math.Ceiling((double)chartCount / columns);

            return (columns, rows);
        }

        protected void RunOnUiThread(MethodInvoker action)
        {
            if (IsDisposed) return;

            if (InvokeRequired)
            {
                if (IsHandleCreated == false) return;
                Invoke(action);
                return;
            }

            action();
        }

        protected T? RunOnUiThread<T>(Func<T> action)
        {
            if (IsDisposed) return default;

            if (InvokeRequired)
            {
                if (IsHandleCreated == false) return default;
                return Invoke(action);
            }

            return action();
        }

        private static void DisposeChart(MyChart chart)
        {
            chart.Close();
            chart.Dispose();
        }
    }
}
