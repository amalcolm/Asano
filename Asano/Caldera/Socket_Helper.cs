using System.Diagnostics;
using System.Net.Sockets;

namespace Asano.Caldera
{
    internal sealed class Socket_Helper(string host, int port) : IDisposable
    {
        private const int BufferSize = 1024 * 1024;
        private const int MaxReadLength = 64 * 1024;

        private readonly Caldera _caldera = Program.Caldera
            ?? throw new InvalidOperationException("Caldera instance is not set.");
        private readonly Socket _socket = new(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
        private readonly byte[] _buffer = new byte[BufferSize];
        private readonly CancellationTokenSource _cts = new();
        private readonly object _sendLock = new();

        private Task? _listener;
        private int _bufferedBytes;
        private bool _disposed;

        public void Connect()
        {
            ObjectDisposedException.ThrowIf(_disposed, this);

            if (_listener is not null)
                throw new InvalidOperationException("Socket listener is already running.");

            _socket.Connect(host, port);
            _listener = Task.Run(Listen, _cts.Token);
        }

        public void Send(byte[] data)
        {
            ArgumentNullException.ThrowIfNull(data);
            Send(data.AsSpan());
        }

        public void Send(ReadOnlySpan<byte> data)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);

            lock (_sendLock)
            {
                while (!data.IsEmpty)
                {
                    int sent = _socket.Send(data);
                    if (sent <= 0)
                        throw new SocketException((int)SocketError.ConnectionReset);

                    data = data[sent..];
                }
            }
        }

        public byte[] Receive(int bufferSize)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);

            byte[] receiveBuffer = new byte[bufferSize];
            int bytesRead = _socket.Receive(receiveBuffer);
            Array.Resize(ref receiveBuffer, bytesRead);
            return receiveBuffer;
        }

        public void Close()
        {
            Dispose();
        }

        public void Dispose()
        {
            if (_disposed)
                return;

            _disposed = true;
            _cts.Cancel();

            try
            {
                if (_socket.Connected)
                    _socket.Shutdown(SocketShutdown.Both);
            }
            catch (SocketException)
            {
            }
            catch (ObjectDisposedException)
            {
            }

            _socket.Dispose();
            _cts.Dispose();
        }

        private void Listen()
        {
            try
            {
                while (!_cts.IsCancellationRequested)
                {
                    CompactBufferIfFull();

                    int bytesRead = _socket.Receive(
                        _buffer.AsSpan(_bufferedBytes, Math.Min(MaxReadLength, BufferSize - _bufferedBytes)),
                        SocketFlags.None,
                        out SocketError error);

                    if (error != SocketError.Success)
                    {
                        Debug.WriteLine($"Socket receive error: {error}");
                        break;
                    }

                    if (bytesRead == 0)
                        break;

                    _bufferedBytes += bytesRead;
                    DispatchBufferedPackets();
                }
            }
            catch (ObjectDisposedException) when (_disposed)
            {
            }
            catch (SocketException ex) when (_cts.IsCancellationRequested || _disposed)
            {
                Debug.WriteLine($"Socket listener stopped: {ex.Message}");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Socket listener error: {ex}");
            }
        }

        private void DispatchBufferedPackets()
        {
            while (TryGetPacket(out IPacket? packet))
            {
                if (packet is null)
                    continue;

                using (packet)
                {
                    _caldera.HandlePacket(packet);
                }
            }
        }

        private bool TryGetPacket(out IPacket? packet)
        {
            packet = null;

            while (_bufferedBytes > 0)
            {
                int start = FindNextPacketStart();
                if (start < 0)
                {
                    KeepPossiblePartialHeader();
                    return false;
                }

                if (start > 0)
                    DiscardBufferedBytes(start);

                PacketDecodeStatus status = PacketDecoder.TryDecode(
                    _buffer.AsSpan(0, _bufferedBytes),
                    out packet,
                    out int bytesConsumed);

                switch (status)
                {
                    case PacketDecodeStatus.Success:
                        DiscardBufferedBytes(bytesConsumed);
                        return true;

                    case PacketDecodeStatus.NeedMore:
                        return false;

                    case PacketDecodeStatus.Invalid:
                        DiscardBufferedBytes(1);
                        break;
                }
            }

            return false;
        }

        private int FindNextPacketStart()
        {
            for (int i = 0; i < _bufferedBytes; i++)
            {
                if (PacketDecoder.IsPossiblePacketStart(_buffer.AsSpan(i, _bufferedBytes - i)))
                    return i;
            }

            return -1;
        }

        private void KeepPossiblePartialHeader()
        {
            int keep = 0;

            if (_bufferedBytes > 0)
            {
                byte last = _buffer[_bufferedBytes - 1];
                if (last == 0xAA || last == 0xB4)
                    keep = 1;
            }

            if (keep > 0 && keep < _bufferedBytes)
                _buffer[0] = _buffer[_bufferedBytes - 1];

            _bufferedBytes = keep;
        }

        private void CompactBufferIfFull()
        {
            if (_bufferedBytes < BufferSize)
                return;

            KeepPossiblePartialHeader();
        }

        private void DiscardBufferedBytes(int count)
        {
            if (count <= 0)
                return;

            if (count >= _bufferedBytes)
            {
                _bufferedBytes = 0;
                return;
            }

            Buffer.BlockCopy(_buffer, count, _buffer, 0, _bufferedBytes - count);
            _bufferedBytes -= count;
        }
    }
}
