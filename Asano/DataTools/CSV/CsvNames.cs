
using System.Text;

namespace Asano.DataTools.Csv
{

    public static class CsvNames
    {
        private static readonly HashSet<char> InvalidFilenameCharacters = [.. Path.GetInvalidFileNameChars().Concat("<>:\"/\\|?*".ToCharArray())];

        public static string Sanitize(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return "state";

            StringBuilder builder = new(value.Length);
            bool previousWasUnderscore = false;

            foreach (char c in value.Trim())
            {
                bool replace = char.IsWhiteSpace(c) || InvalidFilenameCharacters.Contains(c);

                if (replace)
                {
                    if (!previousWasUnderscore && builder.Length > 0)
                    {
                        builder.Append('_');
                        previousWasUnderscore = true;
                    }

                    continue;
                }

                builder.Append(c);
                previousWasUnderscore = c == '_';
            }

            string result = builder.ToString().Trim('_');
            return string.IsNullOrWhiteSpace(result) ? "state" : result;
        }
    }
}
