namespace PokerCalculator.Core;

public sealed class HandState
{
    public string Pot { get; set; } = "";
    public string Stack { get; set; } = "";
    public string FacingBet { get; set; } = "";
    public bool IsPinned { get; set; }
    public Language Language { get; set; } = Language.English;

    public void Reset() => (Pot, Stack, FacingBet) = ("", "", "");
}

public sealed class HandEvaluation
{
    public AmountInput Pot { get; }
    public AmountInput Stack { get; }
    public AmountInput FacingBet { get; }
    public GeometricSizing? Geometric { get; }
    public RaiseSize[]? Preflop { get; }
    public string? GeometricError { get; }
    public string? PreflopError { get; }

    public HandEvaluation(HandState hand, string decimalSeparator)
    {
        var parser = new AmountParser(decimalSeparator, hand.Language);
        Pot = parser.Parse(hand.Pot);
        Stack = parser.Parse(hand.Stack);
        FacingBet = parser.Parse(hand.FacingBet);
        if (Pot.Status == InputStatus.Invalid)
            GeometricError = Copy.Text(hand.Language, "potError", ("message", Pot.Message!));
        else if (Stack.Status == InputStatus.Invalid)
            GeometricError = Copy.Text(hand.Language, "stackError", ("message", Stack.Message!));
        else if (Pot.Value is double pot && Stack.Value is double stack)
        {
            try { Geometric = PokerMath.Geometric(pot, stack); }
            catch (PokerException error) { GeometricError = error.MessageIn(hand.Language); }
        }
        if (FacingBet.Status == InputStatus.Invalid)
            PreflopError = Copy.Text(hand.Language, "facingBetError", ("message", FacingBet.Message!));
        else if (FacingBet.Value is double facing)
        {
            try { Preflop = PokerMath.Preflop(facing); }
            catch (PokerException error) { PreflopError = error.MessageIn(hand.Language); }
        }
    }
}
