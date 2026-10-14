using System.Globalization;
using System.Text;

namespace PokerCalculator.Core;

public enum InputStatus { Empty, Incomplete, Invalid, Valid }
public sealed record AmountInput(InputStatus Status, double? Value = null, string? Message = null);

public sealed class AmountParser(string decimalSeparator = ".", Language language = Language.English)
{
    public const double Minimum = 0.001;
    public const double Maximum = 1_000_000_000_000;
    public const int MaximumLength = 128;
    public string DecimalSeparator { get; } = decimalSeparator;
    public Language Language { get; } = language;

    public AmountInput Parse(string source)
    {
        if (source.EnumerateRunes().Take(MaximumLength + 1).Count() > MaximumLength)
            return Invalid("amountTooLong");
        var text = source.Trim();
        if (text.Length == 0) return new(InputStatus.Empty);
        if (text is "+" or "-") return new(InputStatus.Incomplete);
        if (!IsValidSeparator(DecimalSeparator)) return Invalid("invalidDecimalSeparator");
        if (text == DecimalSeparator) return new(InputStatus.Incomplete);
        if (text.Any(char.IsWhiteSpace)) return Invalid("internalSpaces");
        if (text.Contains('e') || text.Contains('E')) return Invalid("exponentNotation");
        var parts = text.Split(DecimalSeparator, StringSplitOptions.None);
        if (parts.Length > 2) return Invalid("multipleSeparators");
        if (parts.Any(part => part.Any(c => c is < '0' or > '9')))
            return Invalid("invalidCharacters");
        var integer = parts[0].TrimStart('0');
        var fraction = parts.Length == 2 ? parts[1] : "";
        var hasFraction = fraction.Any(c => c != '0');
        if (integer.Length == 0 && !hasFraction) return Invalid("positiveAmount");
        if (integer.Length == 0 && fraction.Take(3).All(c => c == '0'))
            return Invalid("minimumAmount");
        const string limit = "1000000000000";
        if (integer.Length > limit.Length
            || (integer.Length == limit.Length && string.CompareOrdinal(integer, limit) > 0)
            || (integer == limit && hasFraction))
            return Invalid("maximumAmount");
        var normalized = (integer.Length == 0 ? "0" : integer) + (parts.Length == 2 ? "." + fraction : "");
        if (!double.TryParse(normalized, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value)
            || !double.IsFinite(value)) return Invalid("unrepresentableAmount");
        if (value <= 0) return Invalid("unrepresentableTinyAmount");
        if (value < Minimum || value > Maximum) return Invalid("inputRange");
        return new(InputStatus.Valid, value);
    }

    public static bool IsValidSeparator(string separator) =>
        separator.EnumerateRunes().Count() == 1 && separator != "-"
        && Rune.IsPunctuation(separator.EnumerateRunes().First());

    private AmountInput Invalid(string key) => new(InputStatus.Invalid, Message:
        Copy.Text(Language, key, ("separator", DecimalSeparator)));
}
