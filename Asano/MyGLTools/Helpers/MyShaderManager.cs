using OpenTK.Graphics.OpenGL4;

namespace Asano.MyGLTools.Helpers
{
    internal static class MyShaderManager
    {
        private const string ShaderDirectoryName = "Shaders";
        private static readonly ThreadLocal<Dictionary<string, int>> _allShaderPrograms = new(
            () => new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase),
            trackAllValues: true);

        public static int Get(string name)
        {
            var shaderPrograms = _allShaderPrograms.Value!;
            if (shaderPrograms.Count == 0) Init(shaderPrograms);

            if (shaderPrograms.TryGetValue(name, out var programId))
                return programId;

            var loadedPrograms = string.Join(", ", shaderPrograms.Keys.OrderBy(static key => key));
            throw new KeyNotFoundException($"Shader program '{name}' not found. Loaded programs: {loadedPrograms}");
        }

        private static void Init(Dictionary<string, int> shaderPrograms)
        {
            var shaderDirectory = GetShaderDirectory();
            var fragmentFiles = Directory.GetFiles(shaderDirectory, "*.frag", SearchOption.AllDirectories);
            var vertexFiles = Directory.GetFiles(shaderDirectory, "*.vert", SearchOption.AllDirectories);

            Array.Sort(fragmentFiles, StringComparer.OrdinalIgnoreCase);
            Array.Sort(vertexFiles, StringComparer.OrdinalIgnoreCase);

            if (fragmentFiles.Length == 0)
                throw new InvalidOperationException($"No fragment shaders were found in '{shaderDirectory}'.");

            var orphanVertexFiles = vertexFiles
                .Where(static vertexFile => !File.Exists(Path.ChangeExtension(vertexFile, ".frag")))
                .ToArray();

            if (orphanVertexFiles.Length > 0)
            {
                var missingShaders = string.Join(Environment.NewLine, orphanVertexFiles);
                throw new FileNotFoundException($"Vertex shader(s) without matching fragment shader(s):{Environment.NewLine}{missingShaders}");
            }

            foreach (var fragFile in fragmentFiles)
            {
                var name = Path.GetFileNameWithoutExtension(fragFile);
                var vertFile = Path.ChangeExtension(fragFile, ".vert");

                if (!File.Exists(vertFile))
                    throw new FileNotFoundException($"Vertex shader matching '{fragFile}' was not found.", vertFile);

                if (shaderPrograms.ContainsKey(name))
                    throw new InvalidOperationException($"Duplicate shader program name '{name}' found in '{fragFile}'.");

                var vertexSource = File.ReadAllText(vertFile);
                var fragmentSource = File.ReadAllText(fragFile);

                shaderPrograms.Add(name, CompileShaders(name, vertFile, fragFile, vertexSource, fragmentSource));
            }
        }

        public static void Clear()
        {
            foreach (var shaderPrograms in _allShaderPrograms.Values)
            {
                foreach (var programId in shaderPrograms.Values)
                    GL.DeleteProgram(programId);

                shaderPrograms.Clear();
            }
        }


        private static string GetShaderDirectory()
        {
            var shaderDirectory = Path.Combine(AppContext.BaseDirectory, "Resources", ShaderDirectoryName);
            if (Directory.Exists(shaderDirectory))
                return shaderDirectory;

            throw new DirectoryNotFoundException(
                $"Shader directory '{shaderDirectory}' was not found. Ensure shader files are copied to the output directory.");
        }

        private static int CompileShaders(
            string name,
            string vertexPath,
            string fragmentPath,
            string vertexSource,
            string fragmentSource)
        {
            var vertexShader = 0;
            var fragmentShader = 0;
            var program = 0;
            var linked = false;

            try
            {
                vertexShader = CompileShader(ShaderType.VertexShader, vertexSource, vertexPath);
                fragmentShader = CompileShader(ShaderType.FragmentShader, fragmentSource, fragmentPath);

                program = GL.CreateProgram();
                GL.AttachShader(program, vertexShader);
                GL.AttachShader(program, fragmentShader);
                GL.LinkProgram(program);

                GL.GetProgram(program, GetProgramParameterName.LinkStatus, out var status);
                if (status == 0)
                {
                    var infoLog = GL.GetProgramInfoLog(program);
                    throw new InvalidOperationException($"Failed to link shader program '{name}'.{Environment.NewLine}{infoLog}");
                }

                linked = true;
                return program;
            }
            finally
            {
                if (program != 0)
                {
                    if (vertexShader != 0) GL.DetachShader(program, vertexShader);
                    if (fragmentShader != 0) GL.DetachShader(program, fragmentShader);
                    if (!linked) GL.DeleteProgram(program);
                }

                if (vertexShader != 0) GL.DeleteShader(vertexShader);
                if (fragmentShader != 0) GL.DeleteShader(fragmentShader);
            }
        }

        private static int CompileShader(ShaderType shaderType, string source, string path)
        {
            var shader = GL.CreateShader(shaderType);
            GL.ShaderSource(shader, source);
            GL.CompileShader(shader);

            GL.GetShader(shader, ShaderParameter.CompileStatus, out var status);
            if (status != 0)
                return shader;

            var infoLog = GL.GetShaderInfoLog(shader);
            GL.DeleteShader(shader);
            throw new InvalidOperationException($"Failed to compile {shaderType} '{path}'.{Environment.NewLine}{infoLog}");
        }

        public static void Dispose() => Clear();

    }
}
