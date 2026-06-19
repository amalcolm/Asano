using Asano.MyGLTools.Helpers;

namespace Asano
{
    internal static class Program
    {
        public static readonly MySerialPort SerialPort = new();

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

            if (SerialPort == null) return;

            Application.ThreadException += (sender, e) =>
            {
                MessageBox.Show(e.Exception.Message);
                SerialPort?.Close();
            };

            IsRunning = true;
            

            SocketWatcher.SP = SerialPort;

            SocketWatcher.StartListening();

            Application.Run(new MainForm());
            
            IsRunning = false;
            SocketWatcher.StopListening();

            SerialPort.Dispose();
        }
    }
}
