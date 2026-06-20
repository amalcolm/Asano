namespace Asano.MyGLTools.Helpers
{
    internal sealed class MySchedulerClock
    {
        private const double ClockScaleSmoothing = 0.02;
        private const double ClockPhaseSmoothing = 0.08;
        private const double ClockScaleSampleIntervalSeconds = 1.0;
        private const double MaxClockPhaseCorrectionSeconds = 0.005;
        private const double MinClockScale = 0.98;
        private const double MaxClockScale = 1.02;

        private readonly object _lock = new();

        private bool _hasPacketClockSample;
        private double _latestPacketTime;
        private double _latestPacketHostTime;
        private double _scaleSamplePacketTime;
        private double _scaleSampleHostTime;
        private double _lastClockUpdateHostTime;
        private double _timeScale = 1.0;
        private double _time;

        public double Time
        {
            get
            {
                lock (_lock)
                    return _time;
            }
        }

        public void Reset()
        {
            lock (_lock)
            {
                _time = 0.0;
                _timeScale = 1.0;
                _hasPacketClockSample = false;
                _latestPacketTime = 0.0;
                _latestPacketHostTime = 0.0;
                _scaleSamplePacketTime = 0.0;
                _scaleSampleHostTime = 0.0;
                _lastClockUpdateHostTime = 0.0;
            }
        }

        public void UpdateFromPacket(double packetTime, double hostTime)
        {
            if (!double.IsFinite(packetTime) || !double.IsFinite(hostTime)) return;

            lock (_lock)
            {
                if (!_hasPacketClockSample)
                {
                    _hasPacketClockSample = true;
                    _latestPacketTime = packetTime;
                    _latestPacketHostTime = hostTime;
                    _scaleSamplePacketTime = packetTime;
                    _scaleSampleHostTime = hostTime;
                    _lastClockUpdateHostTime = hostTime;
                    _time = packetTime;
                    return;
                }

                if (packetTime <= _latestPacketTime) return;

                _latestPacketTime = packetTime;
                _latestPacketHostTime = hostTime;

                double hostDelta = hostTime - _scaleSampleHostTime;
                double packetDelta = packetTime - _scaleSamplePacketTime;

                if (hostDelta < ClockScaleSampleIntervalSeconds || packetDelta <= 0.0)
                    return;

                double measuredScale = packetDelta / hostDelta;
                if (double.IsFinite(measuredScale))
                {
                    measuredScale = Math.Clamp(measuredScale, MinClockScale, MaxClockScale);
                    _timeScale = (1.0 - ClockScaleSmoothing) * _timeScale
                               + ClockScaleSmoothing * measuredScale;
                }

                _scaleSamplePacketTime = packetTime;
                _scaleSampleHostTime = hostTime;
            }
        }

        public void Advance(double hostTime)
        {
            if (!double.IsFinite(hostTime)) return;

            lock (_lock)
            {
                double hostDelta = Math.Max(0.0, hostTime - _lastClockUpdateHostTime);
                _lastClockUpdateHostTime = hostTime;

                double mappedTime = _time + hostDelta * _timeScale;

                if (!_hasPacketClockSample)
                {
                    if (double.IsFinite(mappedTime))
                        _time = mappedTime;

                    return;
                }

                double timeSincePacket = Math.Max(0.0, hostTime - _latestPacketHostTime);
                double packetMappedTime = _latestPacketTime + timeSincePacket * _timeScale;
                double phaseError = packetMappedTime - mappedTime;
                double phaseCorrection = Math.Clamp(
                    phaseError * ClockPhaseSmoothing,
                    -MaxClockPhaseCorrectionSeconds,
                     MaxClockPhaseCorrectionSeconds);

                mappedTime += phaseCorrection;

                if (double.IsFinite(mappedTime))
                    _time = Math.Max(_time, mappedTime);
            }
        }
    }
}
