namespace PokerCalculator.Core;

public sealed record StreetSizing(int Streets, double Fraction, double[] Bets)
{
    public double FirstBet => Bets[0];
}

public sealed record GeometricSizing(double Spr, StreetSizing TwoStreet, StreetSizing ThreeStreet);
public enum RaiseKind { FourBetIP, FourBetOOP, ThreeBetIP, ThreeBetOOP }
public sealed record RaiseSize(RaiseKind Kind, double Amount);

public static class Raises
{
    public static double Multiplier(this RaiseKind kind) => kind switch
    {
        RaiseKind.FourBetIP => 2.4,
        RaiseKind.FourBetOOP => 2.6,
        RaiseKind.ThreeBetIP => 3,
        RaiseKind.ThreeBetOOP => 4,
        _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };

    public static string Id(this RaiseKind kind) => char.ToLowerInvariant(kind.ToString()[0]) + kind.ToString()[1..];
    public static string Title(this RaiseKind kind) => kind is RaiseKind.FourBetIP or RaiseKind.FourBetOOP ? "4-bet" : "3-bet";
    public static bool InPosition(this RaiseKind kind) => kind is RaiseKind.FourBetIP or RaiseKind.ThreeBetIP;
    public static string MultiplierLabel(this RaiseKind kind) => kind.Multiplier().ToString("0.#", System.Globalization.CultureInfo.InvariantCulture) + "x";
}

public sealed class PokerException(string key) : Exception(key)
{
    public string Key { get; } = key;
    public string MessageIn(Language language) => Copy.Text(language, Key);
}

public static class PokerMath
{
    public const double LeastNormal = 2.2250738585072014E-308;

    public static double Fraction(double spr, int streets)
    {
        Positive(spr, "mathInvalidSPR");
        if (streets <= 0) throw new PokerException("mathStreetCount");
        if (streets == 1) return spr;
        double fraction;
        if (spr <= LeastNormal * streets)
            fraction = spr / streets;
        else
        {
            var growth = spr <= double.MaxValue / 2
                ? LogOnePlus(2 * spr)
                : Math.Log(spr) + Math.Log(2 + 1 / spr);
            fraction = ExpMinusOne(growth / streets) / 2;
        }
        if (!double.IsFinite(fraction)) throw new PokerException("mathFractionOverflow");
        if (fraction <= 0) throw new PokerException("mathFractionUnderflow");
        return fraction;
    }

    public static GeometricSizing Geometric(double pot, double stack)
    {
        Positive(pot, "mathInvalidPot");
        Positive(stack, "mathInvalidStack");
        var spr = stack / pot;
        if (!double.IsFinite(spr)) throw new PokerException("mathSPROverflow");
        if (spr <= 0) throw new PokerException("mathSPRUnderflow");
        return new(spr, Size(pot, stack, spr, 2), Size(pot, stack, spr, 3));
    }

    public static RaiseSize[] Preflop(double facingBet)
    {
        Positive(facingBet, "mathInvalidFacing");
        return Enum.GetValues<RaiseKind>().Select(kind =>
        {
            var amount = facingBet * kind.Multiplier();
            if (!double.IsFinite(amount)) throw new PokerException("mathRaiseOverflow");
            return new RaiseSize(kind, amount);
        }).ToArray();
    }

    private static StreetSizing Size(double pot, double stack, double spr, int streets)
    {
        var fraction = Fraction(spr, streets);
        var first = pot * fraction;
        if (!double.IsFinite(first)) throw new PokerException("mathFirstOverflow");
        if (first <= 0) throw new PokerException("mathFirstUnderflow");
        if (first >= stack) throw new PokerException("mathPrecision");
        if (double.IsSubnormal(spr) || double.IsSubnormal(fraction) || double.IsSubnormal(first))
        {
            double currentPot = pot, committedShare = 0;
            for (var street = 0; street < streets; street++)
            {
                var bet = currentPot * fraction;
                if (!double.IsFinite(bet) || bet <= 0) throw new PokerException("mathPrecision");
                committedShare += bet / stack;
                if (street + 1 < streets)
                {
                    currentPot += 2 * bet;
                    if (!double.IsFinite(currentPot)) throw new PokerException("mathPrecision");
                }
            }
            if (!double.IsFinite(committedShare) || Math.Abs(committedShare - 1) > 1e-12)
                throw new PokerException("mathPrecision");
        }
        var bets = new double[streets];
        bets[0] = first;
        double remaining = stack - first, previous = first;
        for (var street = 1; street < streets - 1; street++)
        {
            var bet = previous * (1 + 2 * fraction);
            if (!double.IsFinite(bet) || bet <= 0 || bet >= remaining)
                throw new PokerException("mathPrecision");
            bets[street] = bet;
            remaining -= bet;
            previous = bet;
        }
        if (!double.IsFinite(remaining) || remaining <= 0) throw new PokerException("mathPrecision");
        bets[^1] = remaining;
        return new(streets, fraction, bets);
    }

    private static void Positive(double value, string error)
    {
        if (!double.IsFinite(value) || value <= 0) throw new PokerException(error);
    }

    private static double LogOnePlus(double value)
    {
        var sum = 1 + value;
        if (sum == 1) return value;
        return Math.Log(sum) * (value / (sum - 1));
    }

    private static double ExpMinusOne(double value)
    {
        if (value >= 0.5) return Math.Exp(value) - 1;
        // Some .NET runtimes implement ExpM1 as Exp(x)-1, losing small-SPR precision.
        double term = value, sum = value;
        for (var divisor = 2; divisor <= 64; divisor++)
        {
            term *= value / divisor;
            var next = sum + term;
            if (next == sum) return sum;
            sum = next;
        }
        throw new PokerException("mathPrecision");
    }
}
