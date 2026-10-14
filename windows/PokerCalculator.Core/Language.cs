using System.Reflection;
using System.Text.Json;

namespace PokerCalculator.Core;

public enum Language { English, Hebrew }

public static class Copy
{
    private static readonly Dictionary<string, Dictionary<string, string>> Catalog = Load();

    private static Dictionary<string, Dictionary<string, string>> Load()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("PokerCalculator.Core.Strings.json")
            ?? throw new InvalidOperationException("The built-in English/Hebrew catalog is missing.");
        return JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string>>>(stream)
            ?? throw new InvalidOperationException("The built-in language catalog is invalid.");
    }

    public static string Text(Language language, string key, params (string Key, string Value)[] values)
    {
        var text = Catalog[language == Language.English ? "en" : "he"][key];
        foreach (var (name, value) in values)
            text = text.Replace("{" + name + "}", value, StringComparison.Ordinal);
        return text;
    }

    public static IReadOnlyCollection<string> Keys => Catalog["en"].Keys;
    public static string Token(Language language, string value) =>
        language == Language.Hebrew ? "\u2066" + value + "\u2069" : value;
}
