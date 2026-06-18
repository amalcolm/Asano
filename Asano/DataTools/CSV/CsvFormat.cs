using System.Globalization;
using System.Text;

namespace Asano.DataTools.Csv
{
    public static class CsvFormat
    {
        public static Encoding Encoding { get; } = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

        public static void WriteValue(StreamWriter writer, string value)
        {
            writer.Write('"');
            writer.Write(value.Replace("\"", "\"\""));
            writer.Write('"');
        }

        public static void WriteValue(StreamWriter writer, double value)
            => writer.Write(value.ToString("G17", CultureInfo.InvariantCulture));

        public static void WriteValue(StreamWriter writer, int value)
            => writer.Write(value.ToString(CultureInfo.InvariantCulture));
    }
}
