using TheLib.Packets;
using System.Globalization;
using System.Text.Json;

namespace Asano.Caldera
{
    internal static class CalderaJson
    {
        private const string ObjectEnd = "}}";

        private const string WipersPrefix = "{\"type\":\"wipersChanged\",\"wipers\":{\"top\":";
        private const string WipersBot = ",\"bot\":";
        private const string WipersMid = ",\"mid\":";
        private const string WipersOffset = ",\"offset\":";
        private const string WipersGain = ",\"gain\":";

        private const string VoltagesPrefix = "{\"type\":\"voltagesChanged\",\"voltages\":{\"sensor1\":";
        private const string VoltagesSensor2 = ",\"sensor2\":";

        private const string StateChangedPrefix = "{\"type\":\"stateChanged\",\"state\":";
        private const string MessageEnd = "}";
        private const string VoltageFormat = "F6";

        public static string CreateWipersChanged(WiperValues wipers)
        {
            var length = WipersPrefix.Length + GetIntLength(wipers.Top)
                       + WipersBot.Length + GetIntLength(wipers.Bot)
                       + WipersMid.Length + GetIntLength(wipers.Mid)
                       + WipersOffset.Length + GetIntLength(wipers.Offset)
                       + WipersGain.Length + GetIntLength(wipers.Gain)
                       + ObjectEnd.Length;

            return string.Create(
                length,
                (wipers.Top, wipers.Bot, wipers.Mid, wipers.Offset, wipers.Gain),
                static (span, state) =>
                {
                    Append(ref span, WipersPrefix);
                    Append(ref span, state.Top);
                    Append(ref span, WipersBot);
                    Append(ref span, state.Bot);
                    Append(ref span, WipersMid);
                    Append(ref span, state.Mid);
                    Append(ref span, WipersOffset);
                    Append(ref span, state.Offset);
                    Append(ref span, WipersGain);
                    Append(ref span, state.Gain);
                    Append(ref span, ObjectEnd);
                });
        }

        public static string CreateVoltagesChanged(VoltageValues voltages)
        {
            var length = VoltagesPrefix.Length + GetFloatLength(voltages.Sensor1)
                       + VoltagesSensor2.Length + GetFloatLength(voltages.Sensor2)
                       + ObjectEnd.Length;

            return string.Create(
                length,
                (Sensor1: voltages.Sensor1, Sensor2: voltages.Sensor2),
                static (span, state) =>
                {
                    Append(ref span, VoltagesPrefix);
                    Append(ref span, state.Sensor1);
                    Append(ref span, VoltagesSensor2);
                    Append(ref span, state.Sensor2);
                    Append(ref span, ObjectEnd);
                });
        }

        public static string CreateStateChanged(StateChangedMessage message)
            => CreateStateChanged((int)message.State);

        private static string CreateStateChanged(int state)
        {
            var length = StateChangedPrefix.Length + GetIntLength(state) + MessageEnd.Length;

            return string.Create(
                length,
                state,
                static (span, state) =>
                {
                    Append(ref span, StateChangedPrefix);
                    Append(ref span, state);
                    Append(ref span, MessageEnd);
                });
        }

        private static int GetIntLength(int value)
        {
            Span<char> buffer = stackalloc char[16];
            value.TryFormat(buffer, out var length, provider: CultureInfo.InvariantCulture);
            return length;
        }

        private static int GetFloatLength(float value)
        {
            if (!float.IsFinite(value))
                return 4;

            Span<char> buffer = stackalloc char[32];
            value.TryFormat(buffer, out var length, VoltageFormat, CultureInfo.InvariantCulture);
            return length;
        }

        private static void Append(ref Span<char> span, string value)
        {
            value.AsSpan().CopyTo(span);
            span = span[value.Length..];
        }

        private static void Append(ref Span<char> span, int value)
        {
            value.TryFormat(span, out var length, provider: CultureInfo.InvariantCulture);
            span = span[length..];
        }

        private static void Append(ref Span<char> span, float value)
        {
            if (!float.IsFinite(value))
            {
                Append(ref span, "null");
                return;
            }

            value.TryFormat(span, out var length, VoltageFormat, CultureInfo.InvariantCulture);
            span = span[length..];
        }
    }

}
