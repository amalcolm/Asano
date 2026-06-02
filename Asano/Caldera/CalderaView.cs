namespace Asano.Caldera
{
    public enum CalderaView
    {
        Circuit,
        Analysis,
    }

    internal static class CalderaViewNames
    {
        public const string Circuit = "circuit";
        public const string Analysis = "analysis";

        public static string ToQueryValue(CalderaView view)
            => view switch
            {
                CalderaView.Analysis => Analysis,
                _ => Circuit,
            };

        public static string ToTitle(CalderaView view)
            => view switch
            {
                CalderaView.Analysis => "Caldera Analysis",
                _ => "Caldera Circuit",
            };

        public static bool TryParse(string? value, out CalderaView view)
        {
            switch (value?.Trim().ToLowerInvariant())
            {
                case Analysis:
                    view = CalderaView.Analysis;
                    return true;
                case Circuit:
                    view = CalderaView.Circuit;
                    return true;
                default:
                    view = CalderaView.Circuit;
                    return false;
            }
        }
    }
}
