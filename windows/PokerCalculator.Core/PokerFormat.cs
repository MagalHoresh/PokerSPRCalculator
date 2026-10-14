using System.Globalization;

namespace PokerCalculator.Core;

public sealed class PokerFormat(string decimalSeparator = ".", Language language = Language.English)
{
    public string DecimalSeparator { get; } = decimalSeparator;
    public Language Language { get; } = language;
    public string Amount(double value) => Render(value, true).Text;
    public string? CopyAmount(double value)
    {
        var result = Render(value, true);
        return result.IsNumber ? result.Text : null;
    }
    public string Spr(double value) => Render(value, false).Text;
    public string Percent(double fraction)
    {
        var percent = fraction * 100;
        var result = Render(percent, percent < 100);
        return result.IsNumber || result.IsBelowResolution ? result.Text + "%" : result.Text;
    }

    private Formatted Render(double value, bool minimumDecimal)
    {
        if (!double.IsFinite(value) || value <= 0) return new(Copy.Text(Language, "outOfRange"));
        if (!AmountParser.IsValidSeparator(DecimalSeparator))
            return new(Copy.Text(Language, "invalidDecimalSeparator"));
        if (value < 0.05) return new("<0" + DecimalSeparator + "1", IsBelowResolution: true);
        if (value >= 4503599627370496)
            return new(ExpandInteger(value) + (minimumDecimal ? DecimalSeparator + "0" : ""), true);
        // Round the shortest decimal representation once, like Foundation's half-up display.
        var decimalValue = decimal.Parse(value.ToString("R", CultureInfo.InvariantCulture),
            NumberStyles.Float, CultureInfo.InvariantCulture);
        var rounded = decimal.Round(decimalValue, 1, MidpointRounding.AwayFromZero);
        var text = rounded.ToString(minimumDecimal ? "0.0" : "0.#", CultureInfo.InvariantCulture)
            .Replace(".", DecimalSeparator, StringComparison.Ordinal);
        return new(text, true);
    }

    private sealed record Formatted(string Text, bool IsNumber = false, bool IsBelowResolution = false);

    private static string ExpandInteger(double value)
    {
        // Match Foundation's fixed-point expansion of the shortest round-trip decimal.
        var parts = value.ToString("R", CultureInfo.InvariantCulture).Split('E');
        if (parts.Length == 1) return parts[0];
        var dot = parts[0].IndexOf('.');
        var decimals = dot < 0 ? 0 : parts[0].Length - dot - 1;
        var exponent = int.Parse(parts[1], CultureInfo.InvariantCulture);
        return parts[0].Replace(".", "", StringComparison.Ordinal) + new string('0', exponent - decimals);
    }
}
