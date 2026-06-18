using TheLib;

namespace Asano.DataTools.Csv
{
    public class CsvSample
    {
        public double Timestamp        { get; private set; }
        public string StateDescription { get; private set; } = string.Empty;
        public int    Top              { get; private set; }
        public int    Bot              { get; private set; }
        public int    Mid              { get; private set; }
        public int    Offset           { get; private set; }
        public int    Gain             { get; private set; }
        public double Sensor1          { get; private set; }
        public double Sensor2          { get; private set; }
        public double LightEnvelope    { get; private set; }

        public void CopyFrom(BlockPacket blockPacket, DataPacket data)
        {
            Timestamp        = data.TimeStamp;
            StateDescription = blockPacket.State.Description();
            Top              = data.Top;
            Bot              = data.Bot;
            Mid              = data.Mid;
            Offset           = data.Offset;
            Gain             = data.Gain;
            Sensor1          = data.Sensor1;
            Sensor2          = data.Sensor2;
            LightEnvelope    = data.LightEnvelope;
        }

        public void Reset()
        {
            Timestamp        = 0.0;
            StateDescription = string.Empty;
            Top              = 0;
            Bot              = 0;
            Mid              = 0;
            Offset           = 0;
            Gain             = 0;
            Sensor1          = 0.0;
            Sensor2          = 0.0;
            LightEnvelope    = 0.0;
        }
    }

}
