using System.Runtime.InteropServices;

namespace Asano.MyGLTools.Helpers
{
    internal static class ScreenHelper
    {
        public static int GetCurrentRefreshRate(Control control)
        {
            if (control == null) return 0;

            try
            {
                Point controlMidPoint = new(control.Width / 2, control.Height / 2);
                Point screenMidPoint = control.PointToScreen(controlMidPoint);

                IntPtr monitorHandle = MonitorFromPoint(screenMidPoint, MONITOR_DEFAULTTONEAREST);
                MONITORINFOEX monitorInfo = new() { cbSize = (uint)Marshal.SizeOf(typeof(MONITORINFOEX)) };
                DEVMODE devMode = new() { dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)) };

                if (monitorHandle != IntPtr.Zero)
                    if (GetMonitorInfo(monitorHandle, ref monitorInfo))
                        if (EnumDisplaySettings(monitorInfo.szDevice, ENUM_CURRENT_SETTINGS, ref devMode))
                            return devMode.dmDisplayFrequency;
            }
            catch (Exception) { }

            return 60;
        }

        #region P/Invoke Declarations

        private const int ENUM_CURRENT_SETTINGS = -1;
        private const int MONITOR_DEFAULTTONEAREST = 2;

        [DllImport("user32.dll")]
        private static extern IntPtr MonitorFromPoint(Point pt, uint dwFlags);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX lpmi);

        [DllImport("user32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool EnumDisplaySettings(
            [MarshalAs(UnmanagedType.LPStr)] string lpszDeviceName,
            int iModeNum,
            ref DEVMODE lpDevMode);


        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int x;
            public int y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int left;
            public int top;
            public int right;
            public int bottom;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        private struct MONITORINFOEX
        {
            public uint cbSize;
            public RECT rcMonitor;
            public RECT rcWork;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
            public string szDevice;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct DEVMODE
        {
            private const int CCHDEVICENAME = 32;
            private const int CCHFORMNAME = 32;

            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCHDEVICENAME)]
            public string dmDeviceName;
            public short dmSpecVersion;
            public short dmDriverVersion;
            public short dmSize;
            public short dmDriverExtra;
            public int dmFields;
            public int dmPositionX;
            public int dmPositionY;
            public int dmDisplayOrientation;
            public int dmDisplayFixedOutput;
            public short dmColor;
            public short dmDuplex;
            public short dmYResolution;
            public short dmTTOption;
            public short dmCollate;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCHFORMNAME)]
            public string dmFormName;
            public short dmLogPixels;
            public int dmBitsPerPel;
            public int dmPelsWidth;
            public int dmPelsHeight;
            public int dmDisplayFlags;
            public int dmDisplayFrequency;
            public int dmICMMethod;
            public int dmICMIntent;
            public int dmMediaType;
            public int dmDitherType;
            public int dmReserved1;
            public int dmReserved2;
            public int dmPanningWidth;
            public int dmPanningHeight;
        }

        #endregion
    }
}