using TheLib;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace Asano.MyGLTools.Helpers
{
    internal class SocketWatcher
    {
        private static UdpClient listener = default!;
        private const int Port = 11000;

        public static bool ReceivedDisconnect { get; private set; } = false;

        private static readonly CancellationTokenSource cts = new();

        public static TeensySerial? SP { get; set; }

        public static void StartListening()
        {
            if (SP == null) throw new InvalidOperationException("IO must be set before starting the listener.");

            // Run the listener on a background thread
            Task.Run(async () =>
            {
                try
                {
                    listener = new UdpClient(Port);
                    IPEndPoint groupEP = new(IPAddress.Any, Port);

                    while (cts.IsCancellationRequested == false)
                    {
                        var result = await listener.ReceiveAsync(cts.Token);
                        if (cts.IsCancellationRequested || result.Buffer.Length == 0)
                            continue;
                        string message = Encoding.ASCII.GetString(result.Buffer, 0, result.Buffer.Length);

                        await ProcessCommand(message);
                    }

                    Debugger.Break();
                }
                catch (SocketException ex)
                {
                    // Handle exceptions, e.g., socket closed
                    Debug.WriteLine(ex.Message);
                }
            }, cts.Token);
        }

        // This method runs on the UI thread
        private static async Task ProcessCommand(string command)
        {
            switch (command.ToUpper())
            {
                case "DISCONNECT":
                    // Your logic to close the serial Port
                    Debug.WriteLine("Received DISCONNECT. Closing port.");
                    if (SP?.IsOpen == true)
                        await SP.CloseAsync();
                    ReceivedDisconnect = true;
                    break;
                case "RECONNECT":
                    // Your logic to try reopening the serial Port
                    Debug.WriteLine("Received RECONNECT. Attempting to open port.");
                    if (SP?.IsOpen == false)
                        await SP.OpenAsync();
                    ReceivedDisconnect = false;
                    break;
            }
        }

        // Call this when your application closes
        public static void StopListening()
        {
            cts.Cancel();

            Thread.Sleep(100); 

            listener?.Close();
        }
    }
}
