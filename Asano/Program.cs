using TheLib;
using Asano.MyGLTools.Helpers;

namespace Asano
{
    internal static class Program
    {
        public static readonly TeensySerial? serialPort = new();

        public static bool IsRunning = false;
        public static Caldera.Caldera? Caldera = null;


        /// <summary>
        ///  The main entry point for the application.
        /// </summary>
        [STAThread]
        static void Main()
        {
            ApplicationConfiguration.Initialize();

//            ZFixer.DoTest(); return;

            Application.ThreadException += (sender, e) =>
            {
                MessageBox.Show(e.Exception.Message);
                serialPort?.Close();
            };

            IsRunning = true;
            SocketWatcher.SP = serialPort;

            if (serialPort != null)
            {
                SocketWatcher.StartListening();

                Application.Run(new MainForm());

                IsRunning = false;
                SocketWatcher.StopListening();
            }

            Caldera?.Dispose();
            Caldera = null;
            serialPort?.Close();
        }
    }
}
