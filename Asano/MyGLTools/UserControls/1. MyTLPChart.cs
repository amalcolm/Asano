
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
            _charts.Add(PrimaryChart);
        }

        protected MyChart CreateChart(string? tag = null)
        {
            MyChart chart = new()
            {
                AutoClear    = true,
                BackColor    = Color.Cornsilk,
                BorderStyle  = BorderStyle.FixedSingle,
                Dock         = DockStyle.Fill,
                EnableLabels = true,
                EnablePlots  = true,
                Padding      = new Padding(4),
                Tag          = tag,
                Yscale       = 1.0f
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
                ApplyChartLayout();
            });
        }

        protected void ResetCharts()
        {
            RunOnUiThread(() =>
            {
                MyChart[] chartsToRemove = [.. _charts.Where(chart => chart != PrimaryChart)];

                _charts.Clear();
                _charts.Add(PrimaryChart);
                ApplyChartLayout();

                foreach (var chart in chartsToRemove)
                    DisposeChart(chart);
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
            int n = Math.Max(_charts.Count, 1);
            int cols = n < 3 ? 1 : (int)Math.Ceiling(Math.Sqrt(n));
            int rows = (int)Math.Ceiling((double)n / cols);

            tlpCharts.SuspendLayout();

            tlpCharts.Controls.Clear();
            tlpCharts.ColumnStyles.Clear();
            tlpCharts.RowStyles.Clear();

            tlpCharts.ColumnCount = cols;
            tlpCharts.RowCount = rows;

            for (int c = 0; c < cols; c++)
                tlpCharts.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100.0f / cols));

            for (int r = 0; r < rows; r++)
                tlpCharts.RowStyles.Add(new RowStyle(SizeType.Percent, 100.0f / rows));

            for (int i = 0; i < _charts.Count; i++)
            {
                int c = i % cols;
                int r = i / cols;
                tlpCharts.Controls.Add(_charts[i], c, r);
            }

            tlpCharts.ResumeLayout(true);
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
