using System.Diagnostics;
using System.Net.Sockets;
using System.Text;

namespace Asano.Caldera
{
    internal class DevServer
    {
        public const int Port = 5174;
        public const string Host = "127.0.0.1";

        public static string URL { get; private set; } = $"http://{Host}:{Port}";

        public static string GetUrl(
            CalderaView view,
            IReadOnlyDictionary<string, string?>? queryParameters = null)
        {
            var parameters = new List<string>
            {
                $"view={Uri.EscapeDataString(CalderaViewNames.ToQueryValue(view))}"
            };

            if (queryParameters != null)
            {
                foreach (var (key, value) in queryParameters)
                {
                    if (string.IsNullOrWhiteSpace(key) || string.IsNullOrEmpty(value))
                        continue;

                    parameters.Add($"{Uri.EscapeDataString(key)}={Uri.EscapeDataString(value)}");
                }
            }

            return $"{URL}?{string.Join("&", parameters)}";
        }

        private void ViteOutputDataReceived(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null) Debug.WriteLine("[vite] " + e.Data);
        }

        private void ViteErrorDataReceived(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null) Debug.WriteLine("[vite] " + e.Data);
        }



        public async Task EnsureViteRunningAsync()
        {

            if (await IsPortOpenAsync(Host, Port))
                return;

            _viteProcess = StartViteDirect(Path.Combine(BuildPaths.SolutionDir, "Caldera"));

            // Wait briefly for the dev server to come up.
            for (int i = 0; i < 40; i++)
            {
                if (await IsPortOpenAsync(Host, Port, 100))
                    return;

                await Task.Delay(100);
            }


            throw new TimeoutException("Vite did not start listening on port 5174.");
        }


        private Process? _viteProcess;
        private bool _viteWasStartedByMe;

        private Process StartViteDirect(string calderaDir)
        {
            string viteJs = Path.Combine(
                calderaDir,
                "node_modules",
                "vite",
                "bin",
                "vite.js");

            if (!File.Exists(viteJs))
                viteJs = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "npm",
                    "node_modules",
                    "vite",
                    "dist",
                    "bin",
                    "vite.js");

            if (!File.Exists(viteJs))
                throw new FileNotFoundException("Could not find Vite. Has npm install been run?", viteJs);

            var psi = new ProcessStartInfo
            {
                FileName = "node.exe",
                Arguments = $"\"{viteJs}\" --host 0.0.0.0 --port 5174 --strictPort --clearScreen false",
                WorkingDirectory = calderaDir,

                UseShellExecute = false,
                CreateNoWindow = true,

                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,

                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };

            psi.Environment["NO_COLOR"] = "1";
            psi.Environment["FORCE_COLOR"] = "0";

            var p = new Process
            {
                StartInfo = psi,
                EnableRaisingEvents = true
            };

            p.OutputDataReceived += ViteOutputDataReceived;
            p.ErrorDataReceived += ViteErrorDataReceived;

            p.Start();
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();

            _viteWasStartedByMe = true;

            return p;
        }

        public void StopViteIfStartedByMe()
        {
            if (!_viteWasStartedByMe)
                return;

            var p = _viteProcess;

            _viteWasStartedByMe = false;
            _viteProcess = null;

            if (p is null)
                return;

            try
            {
                // Stop async stream readers first, otherwise Node/Vite shutdown noise
                // may still arrive via events while/after the process is being killed.
                try { p.CancelOutputRead(); } catch { }
                try { p.CancelErrorRead(); } catch { }

                p.OutputDataReceived -= ViteOutputDataReceived;
                p.ErrorDataReceived -= ViteErrorDataReceived;

                try { p.StandardInput.Close(); } catch { }

                if (!p.HasExited)
                {
                    p.Kill(entireProcessTree: true);

                    // Optional, but helps avoid disposing while Windows is still cleaning up.
                    try { p.WaitForExit(1000); } catch { }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine("Error stopping Vite: " + ex);
            }
            finally
            {
                p.Dispose();
            }
        }



        private static async Task<bool> IsPortOpenAsync(string host, int port, int timeoutMs = 200)
        {
            try
            {
                using var client = new TcpClient();

                var connectTask = client.ConnectAsync(host, port);
                var timeoutTask = Task.Delay(timeoutMs);

                var completed = await Task.WhenAny(connectTask, timeoutTask);

                return completed == connectTask && client.Connected;
            }
            catch
            {
                return false;
            }
        }
    }
}
