using System.Globalization;
using System.Text.Json;
using PokerCalculator.Core;

var assertions = 0;
void Check(bool condition, string description)
{
    assertions++;
    if (!condition) throw new InvalidOperationException(description);
}
void Near(double actual, double expected, string description, double tolerance = 2e-12) =>
    Check(Math.Abs(actual / expected - 1) <= tolerance, $"{description}: {actual:R} != {expected:R}");
void Fails(Action operation, string key)
{
    try { operation(); }
    catch (PokerException e)
    {
        Check(e.Key == key, $"Expected {key}, got {e.Key}");
        return;
    }
    throw new InvalidOperationException("Expected failure: " + key);
}

using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "SwiftParity.json")));
foreach (var hand in fixture.RootElement.GetProperty("hands").EnumerateArray())
{
    var pot = hand.GetProperty("pot").GetDouble();
    var stack = hand.GetProperty("stack").GetDouble();
    var result = PokerMath.Geometric(pot, stack);
    var format = new PokerFormat();
    Near(result.Spr, hand.GetProperty("spr").GetDouble(), "Swift SPR");
    Check(format.Spr(result.Spr) == hand.GetProperty("sprText").GetString(), "Swift SPR display");
    foreach (var plan in hand.GetProperty("plans").EnumerateArray())
    {
        var actual = plan.GetProperty("streets").GetInt32() == 2 ? result.TwoStreet : result.ThreeStreet;
        Near(actual.Fraction, plan.GetProperty("fraction").GetDouble(), "Swift fraction");
        Check(format.Percent(actual.Fraction) == plan.GetProperty("percent").GetString(),
            $"Swift percent at pot {pot}, stack {stack}, {actual.Streets} streets: {format.Percent(actual.Fraction)} != {plan.GetProperty("percent")}");
        var expectedBets = plan.GetProperty("bets").EnumerateArray().Select(x => x.GetDouble()).ToArray();
        var expectedAmounts = plan.GetProperty("amounts").EnumerateArray().Select(x => x.GetString()).ToArray();
        Check(actual.Bets.Length == actual.Streets, "Full all-in sequence");
        double remaining = stack, growingPot = pot;
        for (var i = 0; i < actual.Bets.Length; i++)
        {
            var bet = actual.Bets[i];
            Near(bet, expectedBets[i], "Swift per-street bet");
            Check(format.Amount(bet) == expectedAmounts[i], $"Swift amount: {format.Amount(bet)} != {expectedAmounts[i]}");
            Near(bet, growingPot * actual.Fraction, "One matching caller recurrence");
            Check(bet > 0 && bet <= remaining, "Bet must not exceed remaining stack");
            remaining -= bet;
            growingPot += 2 * bet;
        }
        Check(remaining == 0, "Final bet exhausts the stack exactly");
    }
}
foreach (var input in fixture.RootElement.GetProperty("inputs").EnumerateArray())
{
    var language = input.GetProperty("language").GetString() == "he" ? Language.Hebrew : Language.English;
    var parser = new AmountParser(input.GetProperty("separator").GetString()!, language);
    var actual = parser.Parse(input.GetProperty("text").GetString()!);
    Check(actual.Status.ToString() == input.GetProperty("status").GetString(), "Swift input classification");
    var value = input.GetProperty("value");
    Check(actual.Value == (value.ValueKind == JsonValueKind.Null ? null : value.GetDouble()), "Swift parsed value");
    var message = input.GetProperty("message");
    Check(actual.Message == (message.ValueKind == JsonValueKind.Null ? null : message.GetString()), "Exact Swift validation translation");
}
foreach (var item in fixture.RootElement.GetProperty("formats").EnumerateArray())
{
    var value = double.Parse(item.GetProperty("value").GetString()!, CultureInfo.InvariantCulture);
    var format = new PokerFormat();
    Check(format.Amount(value) == item.GetProperty("amount").GetString(), $"Amount rounding parity for {value:R}");
    Check(format.Spr(value) == item.GetProperty("spr").GetString(), $"SPR rounding parity for {value:R}");
    Check(format.Percent(value) == item.GetProperty("percent").GetString(), $"Percent rounding parity for {value:R}: {format.Percent(value)} != {item.GetProperty("percent")}");
    var copy = item.GetProperty("copy");
    Check(format.CopyAmount(value) == (copy.ValueKind == JsonValueKind.Null ? null : copy.GetString()), "Clipboard parity");
}

foreach (var invalid in new[] { 0d, -1, double.NaN, double.PositiveInfinity, double.NegativeInfinity })
{
    Fails(() => PokerMath.Geometric(invalid, 1), "mathInvalidPot");
    Fails(() => PokerMath.Geometric(1, invalid), "mathInvalidStack");
    Fails(() => PokerMath.Preflop(invalid), "mathInvalidFacing");
    Check(new PokerFormat().CopyAmount(invalid) is null, "Invalid clipboard disabled");
}
Fails(() => PokerMath.Fraction(1, 0), "mathStreetCount");
Fails(() => PokerMath.Geometric(double.Epsilon, double.MaxValue), "mathSPROverflow");
Fails(() => PokerMath.Geometric(double.MaxValue, double.Epsilon), "mathSPRUnderflow");
Fails(() => PokerMath.Fraction(double.Epsilon, 3), "mathFractionUnderflow");
Fails(() => PokerMath.Preflop(double.MaxValue), "mathRaiseOverflow");
Fails(() => PokerMath.Geometric(1e223, 1e-100), "mathPrecision");
foreach (var spr in new[] { 1e-15, 1e-100, 1e-300 })
    foreach (var streets in new[] { 2, 3 })
        Near(PokerMath.Fraction(spr, streets), spr / streets, "Tiny ratio precision");
foreach (var (pot, stack) in new[]
{
    (double.MaxValue, double.MaxValue), (1d, double.MaxValue),
    (double.MaxValue, 1d), (PokerMath.LeastNormal, PokerMath.LeastNormal)
})
{
    var sizing = PokerMath.Geometric(pot, stack);
    foreach (var plan in new[] { sizing.TwoStreet, sizing.ThreeStreet })
    {
        var remaining = stack;
        foreach (var bet in plan.Bets)
        {
            Check(double.IsFinite(bet) && bet > 0 && bet <= remaining, "Finite extreme bet");
            remaining -= bet;
        }
        Check(remaining == 0, "Extreme all-in exhaustion");
    }
}
var forty = PokerMath.Geometric(100, 241.6).ThreeStreet;
Check(forty.Bets.Select(new PokerFormat().Amount).SequenceEqual(["40.0", "72.0", "129.6"]), "40% acceptance path");
var mappings = PokerMath.Preflop(10);
Check(mappings.Select(x => x.Amount).SequenceEqual([24d, 26, 30, 40]), "Legacy multipliers preserved");
foreach (var size in mappings) Check(size.Amount == 10 * size.Kind.Multiplier(), "Total raise target, not extra chips");

var handState = new HandState { Pot = "100", Stack = "241.6", FacingBet = "3", IsPinned = true, Language = Language.Hebrew };
var valid = new HandEvaluation(handState, ".");
Check(valid.Geometric is not null && valid.Preflop?.Length == 4, "Independent live calculators");
handState.Pot = "oops";
var badPot = new HandEvaluation(handState, ".");
Check(badPot.Geometric is null && badPot.Preflop?.Length == 4 && badPot.GeometricError!.Contains("קופה:"), "Hebrew error without stale geometric result");
handState.Pot = "100";
handState.FacingBet = "oops";
var badRaise = new HandEvaluation(handState, ".");
Check(badRaise.Geometric is not null && badRaise.Preflop is null && badRaise.PreflopError!.Contains("הימור מולך:"), "Independent invalid preflop");
handState.Reset();
Check(handState.Pot == "" && handState.Stack == "" && handState.FacingBet == "" && handState.IsPinned && handState.Language == Language.Hebrew, "Reset preserves pin and language");
Check(new HandState().Language == Language.English, "English default");
foreach (var key in Copy.Keys)
{
    var english = Copy.Text(Language.English, key);
    var hebrew = Copy.Text(Language.Hebrew, key);
    Check(english.Length > 0 && hebrew.Any(c => c is >= '\u05d0' and <= '\u05ea'), "Complete Hebrew catalog: " + key);
    Check(!english.Contains("Command") && !hebrew.Contains('⌘'), "Windows-local shortcuts: " + key);
}
foreach (var separator in new[] { ".", "," })
{
    foreach (var value in new[] { 0.001, 0.05, 129.6, 1234.56, 1e12 })
    {
        var english = new PokerFormat(separator);
        var hebrew = new PokerFormat(separator, Language.Hebrew);
        Check(english.Amount(value) == hebrew.Amount(value) && english.CopyAmount(value) == hebrew.CopyAmount(value), "LTR numeric format independent of language");
    }
}
Console.WriteLine($"PASS: {assertions} assertions, including {fixture.RootElement.GetProperty("hands").GetArrayLength()} hands exported from Swift; both languages and all legacy features.");
