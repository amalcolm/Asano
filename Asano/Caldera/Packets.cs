using System.Buffers.Binary;
using Asano.MyGLTools.Helpers;

namespace Asano.Caldera
{
    internal interface IPacket : IDisposable
    {
        byte PacketId { get; }
    }

    internal readonly struct NoiseSample(int startTick, int sample, int endTick)
    {
        public int StartTick { get; } = startTick;
        public int Sample { get; } = sample;
        public int EndTick { get; } = endTick;
    }

    internal sealed class NoisePacket : IPacket
    {
        public const byte PacketID = 0x01;
        public const int MaxDataSize = 4096;

        internal const int PayloadHeaderSize = sizeof(double) + sizeof(uint) + sizeof(uint);
        internal const int SampleWireSize = sizeof(int) + sizeof(int) + sizeof(int);

        private static readonly MyPool<NoisePacket> Pool = new(
            64,
            static () => new NoisePacket(),
            static packet => packet.Reset()
        );

        private int _returnedToPool;

        private NoisePacket()
        {
        }

        public byte PacketId => PacketID;
        public double TimeStamp { get; private set; }
        public uint State { get; private set; }
        public int Count { get; private set; }
        public NoiseSample[] Data { get; } = new NoiseSample[MaxDataSize];
        public ReadOnlySpan<NoiseSample> Samples => Data.AsSpan(0, Count);

        public static NoisePacket Rent()
        {
            var packet = Pool.Rent();
            packet._returnedToPool = 0;
            return packet;
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _returnedToPool, 1) == 0)
                Pool.Return(this);
        }

        internal static bool TryGetPayloadSize(ReadOnlySpan<byte> payloadHeader, out int payloadSize)
        {
            payloadSize = 0;

            if (payloadHeader.Length < PayloadHeaderSize)
                return false;

            uint count = BinaryPrimitives.ReadUInt32LittleEndian(
                payloadHeader.Slice(sizeof(double) + sizeof(uint), sizeof(uint)));

            if (count > MaxDataSize)
                return false;

            payloadSize = PayloadHeaderSize + checked((int)count * SampleWireSize);
            return true;
        }

        internal bool TryReadPayload(ReadOnlySpan<byte> payload)
        {
            if (!TryGetPayloadSize(payload, out int payloadSize) || payload.Length < payloadSize)
                return false;

            TimeStamp = BitConverter.Int64BitsToDouble(
                BinaryPrimitives.ReadInt64LittleEndian(payload.Slice(0, sizeof(double))));
            State = BinaryPrimitives.ReadUInt32LittleEndian(
                payload.Slice(sizeof(double), sizeof(uint)));
            Count = (int)BinaryPrimitives.ReadUInt32LittleEndian(
                payload.Slice(sizeof(double) + sizeof(uint), sizeof(uint)));

            int offset = PayloadHeaderSize;
            for (int i = 0; i < Count; i++)
            {
                int startTick = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(offset, sizeof(int)));
                offset += sizeof(int);

                int sample = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(offset, sizeof(int)));
                offset += sizeof(int);

                int endTick = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(offset, sizeof(int)));
                offset += sizeof(int);

                Data[i] = new NoiseSample(startTick, sample, endTick);
            }

            return true;
        }

        private void Reset()
        {
            TimeStamp = 0.0;
            State = 0;
            Count = 0;
        }
    }

    internal enum PacketDecodeStatus
    {
        NeedMore,
        Success,
        Invalid,
    }

    internal static class PacketDecoder
    {
        private const byte DraftMagic0 = 0xAA;
        private const byte DraftMagic1 = 0xBB;
        private const byte DraftMagic3 = 0xFF;
        private const int DraftHeaderSize = 4;

        private const uint NativeDebugFrameStart = 0xED01FAB4;
        private const uint NativeDebugFrameEnd = 0xED02FAB4;
        private const int NativeFrameSize = sizeof(uint);

        public static bool IsPossiblePacketStart(ReadOnlySpan<byte> buffer)
        {
            if (buffer.Length == 0)
                return false;

            if (buffer.Length == 1)
                return buffer[0] == DraftMagic0 || buffer[0] == 0xB4;

            return (buffer[0] == DraftMagic0 && buffer[1] == DraftMagic1)
                || (buffer[0] == 0xB4 && buffer[1] == 0xFA);
        }

        public static PacketDecodeStatus TryDecode(
            ReadOnlySpan<byte> buffer,
            out IPacket? packet,
            out int bytesConsumed)
        {
            packet = null;
            bytesConsumed = 0;

            if (buffer.Length < DraftHeaderSize)
                return PacketDecodeStatus.NeedMore;

            if (IsDraftHeader(buffer))
                return TryDecodeDraftPacket(buffer, out packet, out bytesConsumed);

            if (IsNativeDebugHeader(buffer))
                return TryDecodeNativeDebugPacket(buffer, out packet, out bytesConsumed);

            return PacketDecodeStatus.Invalid;
        }

        private static bool IsDraftHeader(ReadOnlySpan<byte> buffer)
            => buffer.Length >= DraftHeaderSize
            && buffer[0] == DraftMagic0
            && buffer[1] == DraftMagic1
            && buffer[3] == DraftMagic3;

        private static bool IsNativeDebugHeader(ReadOnlySpan<byte> buffer)
            => buffer.Length >= NativeFrameSize
            && BinaryPrimitives.ReadUInt32LittleEndian(buffer.Slice(0, NativeFrameSize)) == NativeDebugFrameStart;

        private static PacketDecodeStatus TryDecodeDraftPacket(
            ReadOnlySpan<byte> buffer,
            out IPacket? packet,
            out int bytesConsumed)
        {
            packet = null;
            bytesConsumed = 0;

            return buffer[2] switch
            {
                NoisePacket.PacketID => TryDecodeNoisePayload(
                    buffer,
                    DraftHeaderSize,
                    hasNativeFooter: false,
                    out packet,
                    out bytesConsumed),
                _ => PacketDecodeStatus.Invalid,
            };
        }

        private static PacketDecodeStatus TryDecodeNativeDebugPacket(
            ReadOnlySpan<byte> buffer,
            out IPacket? packet,
            out int bytesConsumed)
        {
            packet = null;
            bytesConsumed = 0;

            return TryDecodeNoisePayload(
                buffer,
                NativeFrameSize,
                hasNativeFooter: true,
                out packet,
                out bytesConsumed);
        }

        private static PacketDecodeStatus TryDecodeNoisePayload(
            ReadOnlySpan<byte> buffer,
            int payloadOffset,
            bool hasNativeFooter,
            out IPacket? packet,
            out int bytesConsumed)
        {
            packet = null;
            bytesConsumed = 0;

            int minimumLength = payloadOffset + NoisePacket.PayloadHeaderSize;
            if (buffer.Length < minimumLength)
                return PacketDecodeStatus.NeedMore;

            if (!NoisePacket.TryGetPayloadSize(buffer[payloadOffset..], out int payloadSize))
                return PacketDecodeStatus.Invalid;

            int packetSize = payloadOffset + payloadSize + (hasNativeFooter ? NativeFrameSize : 0);
            if (buffer.Length < packetSize)
                return PacketDecodeStatus.NeedMore;

            if (hasNativeFooter)
            {
                uint frameEnd = BinaryPrimitives.ReadUInt32LittleEndian(
                    buffer.Slice(payloadOffset + payloadSize, NativeFrameSize));

                if (frameEnd != NativeDebugFrameEnd)
                    return PacketDecodeStatus.Invalid;
            }

            var noisePacket = NoisePacket.Rent();
            if (!noisePacket.TryReadPayload(buffer.Slice(payloadOffset, payloadSize)))
            {
                noisePacket.Dispose();
                return PacketDecodeStatus.Invalid;
            }

            packet = noisePacket;
            bytesConsumed = packetSize;
            return PacketDecodeStatus.Success;
        }
    }
}
