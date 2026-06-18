using TheLib;
using TheLib.Packets;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Threading.Tasks;
using Asano.Caldera;
using Asano.MyGLTools.UserControls;

namespace Asano.MyGLTools.Helpers
{
    public static class Scheduler
    {
        private static readonly List<MyGLThread> _threads = [];
        private static readonly object _lock = new();
        private static CancellationTokenSource? cts = null;

        private static readonly ConcurrentQueue<MyGLThread> _pendingThreads = new();
        private static readonly ConcurrentQueue<MyGLThread> _exitingThreads = new();

        public static double TargetFrameRate
        {
            get => _targetFrameRate;
            set
            {
                if (_targetFrameRate != value)
                {
                    _targetFrameRate = value;
                    _targetFrameRateIsDirty.Set();
                }
            }
        }
        private static double _targetFrameRate = 60.0;
        private static MyFlag _targetFrameRateIsDirty = 0;
        private static readonly MyTimer frameTimer = MyTimer.From_S(1.0 / TargetFrameRate);

        public static bool IsPaused { get; set; } = false;
        public static void Register(MyGLThread thread)
        {
            _pendingThreads.Enqueue(thread);
            lock (_lock)
            {
                if (cts == null)
                    StartScheduler();
            }
        }

        public static void Unregister(MyGLThread thread)
        {
            _exitingThreads.Enqueue(thread);
        }

        private static void StartScheduler()
        {
            cts = new CancellationTokenSource();
            SW.Restart();
            Interlocked.Increment(ref _resetVersion);
            Task.Run(Run, cts.Token);
        }

        public static void Reset()
        {
            SW.Restart();
            Interlocked.Increment(ref _resetVersion);
        }


        private static readonly Stopwatch SW = new();
        public static double Time { get; private set; } = 0.0;
        private static int _resetVersion;
        private static double latestPacketTime = 0.0;

        private static double TimeScale = 1.0;
        private static void Run()
        {
            var token = cts?.Token ?? throw new InvalidOperationException("Scheduler not started.");
            double nextFrameTime = SW.Elapsed.TotalSeconds;
            int resetVersion = _resetVersion;

            while (token.IsCancellationRequested == false)
            {
                double latestTime = latestPacketTime;
                double currentTime = SW.Elapsed.TotalSeconds;

                double newRatio = latestTime / currentTime;

                double t = 0.0001;

                TimeScale = (1-t) * TimeScale + t * newRatio;



                Time = SW.Elapsed.TotalSeconds * TimeScale;

                while (_pendingThreads.TryDequeue(out var pending))
                    _threads.Add(pending);

                while (_exitingThreads.TryDequeue(out var exiting))
                    _threads.Remove(exiting);

                if (_threads.Count == 0)
                    break;

                if (!IsPaused)
                {
                    foreach (var thread in _threads)
                    {
                        if (thread?.IsDisposed ?? true)
                            continue;

                        try
                        {
                            if (thread.RequestFrame())
                                thread.WaitForFrame(token);
                        }
                        catch (Exception ex)
                        {
                            Debug.WriteLine($"RenderScheduler: {ex.Message}");
                        }
                    }

                    PostToCaldera();
                }


                if (_targetFrameRateIsDirty.TestAndClear())
                { 
                    frameTimer.Period = 1.0 / TargetFrameRate;
                }

                frameTimer.Wait(token);

            }

            lock (_lock)
            {
                cts?.Dispose();
                cts = null;

                if (!_pendingThreads.IsEmpty)
                    StartScheduler();
            }
        }
        public static void UpdateLatestTime(double time)
        {
            if (time > latestPacketTime)
                latestPacketTime = time;
        }


        private static readonly WipersChangedMessage     lastWipersChangeSent   = new();
        private static readonly VoltagesChangedMessage lastVoltagesChangeSent   = new();
        private static readonly WipersChangedMessage      pendingWipersChange   = new();
        private static readonly VoltagesChangedMessage  pendingVoltagesChange   = new();


        private static readonly double PostIntervalMs = 50.0;
        private static readonly Stopwatch swPost = Stopwatch.StartNew();

        private static MyFlag forceNextWipersPost = 0;

        public static void RequestWipersRefresh()
        {
            forceNextWipersPost.Set();
            Program.SerialPort?.Write(new XCMD_SetWipers());
        }

        private static void PostToCaldera()
        {
            var caldera     = Program.Caldera;
            var activeChart = MyChart.ActiveChart;
            if (caldera == null || activeChart == null) return;
            if (swPost.Elapsed.TotalMilliseconds < PostIntervalMs) return;

            var forceWipers = forceNextWipersPost.TestAndClear();

            swPost.Restart();
            
            activeChart.CopyLatestCalderaMessages(pendingWipersChange, pendingVoltagesChange);

            WipersChangedMessage     wipersChange = pendingWipersChange;
            VoltagesChangedMessage voltagesChange = pendingVoltagesChange;

            if (wipersChange != null && (forceWipers || wipersChange.IsValid))
                if (forceWipers || !wipersChange.Equals(lastWipersChangeSent))
                {
                    if (caldera.PostWipersChange(wipersChange, forceWipers))
                        lastWipersChangeSent.CopyFrom(wipersChange);
                }

            if (voltagesChange != null && voltagesChange.IsValid)
                if (!voltagesChange.Equals(lastVoltagesChangeSent))
                {
                    if (caldera.PostVoltagesChange(voltagesChange))
                        lastVoltagesChangeSent.CopyFrom(voltagesChange);
                }

        }
    }
}
