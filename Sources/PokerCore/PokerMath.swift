import Foundation

public struct StreetSizing: Equatable, Sendable {
    public let streets: Int
    /// Fraction of the pot before each bet, with one matching caller per street.
    public let fraction: Double
    /// Current pot multiplied by the unrounded fraction.
    public let firstBet: Double
    /// Individual street bets after one matching call each time; the last uses the remaining stack.
    public let bets: [Double]
}

public struct GeometricSizing: Equatable, Sendable {
    /// Effective remaining stack divided by the current pot, without rounding.
    public let spr: Double
    public let twoStreet: StreetSizing
    public let threeStreet: StreetSizing
}

public enum RaiseKind: String, CaseIterable, Identifiable, Sendable {
    case fourBetIP
    case fourBetOOP
    case threeBetIP
    case threeBetOOP

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .fourBetIP, .fourBetOOP: "4-bet"
        case .threeBetIP, .threeBetOOP: "3-bet"
        }
    }

    public var positionLabel: String {
        positionLabel(in: .english)
    }

    public func positionLabel(in language: AppLanguage) -> String {
        switch self {
        case .fourBetIP, .threeBetIP: language.text(.inPosition)
        case .fourBetOOP, .threeBetOOP: language.text(.outOfPosition)
        }
    }

    public var multiplier: Double {
        switch self {
        case .fourBetIP: 2.4
        case .fourBetOOP: 2.6
        case .threeBetIP: 3
        case .threeBetOOP: 4
        }
    }

    public var multiplierLabel: String {
        switch self {
        case .fourBetIP: "2.4x"
        case .fourBetOOP: "2.6x"
        case .threeBetIP: "3x"
        case .threeBetOOP: "4x"
        }
    }
}

public struct RaiseSize: Equatable, Sendable {
    public let kind: RaiseKind
    /// Total raise-to amount, not an amount added to the facing bet.
    public let amount: Double
}

/// Explicit domain and representability failures; no default numeric results.
public enum PokerMathError: Error, Equatable, Sendable, LocalizedError {
    case invalidAmount(String)
    case invalidStreetCount
    case sprOverflow
    case sprUnderflow
    case fractionOverflow
    case fractionUnderflow
    case firstBetOverflow
    case firstBetUnderflow
    case insufficientPrecision
    case raiseOverflow

    public var message: String {
        message(in: .english)
    }

    public func message(in language: AppLanguage) -> String {
        language.text(.mathError(self))
    }

    public var errorDescription: String? { message }
}

public enum PokerMath {
    /// Stable geometric fraction for a positive SPR and positive street count.
    ///
    /// Uses expm1/log1p without display rounding. Finite positive subnormal
    /// results are supported; a result that underflows to zero is rejected.
    public static func fraction(spr: Double, streets: Int) throws -> Double {
        try checkedFraction(spr: spr, streets: streets)
    }

    /// Two- and three-street sizing with a single matching caller each street.
    /// Inputs may be outside the parser's entry bounds but must be finite and positive.
    /// Subnormal intermediates must still exhaust the stack within 1e-12 relative
    /// error; more coarsely quantized results throw `insufficientPrecision`.
    public static func geometric(pot: Double, effectiveStack: Double) throws -> GeometricSizing {
        try checkedGeometric(pot: pot, effectiveStack: effectiveStack)
    }

    /// Fixed total raise-to mappings, completely independent of pot, stack, or SPR.
    /// The entire result is rejected if any raise amount would overflow.
    public static func preflop(facingBet: Double) throws -> [RaiseSize] {
        try checkedPreflop(facingBet: facingBet)
    }

    static func checkedFraction(spr: Double, streets: Int) throws(PokerMathError) -> Double {
        try requirePositive(spr, name: "SPR")
        guard streets > 0 else { throw .invalidStreetCount }
        if streets == 1 { return spr }

        let count = Double(streets)
        let fraction: Double
        if spr <= Double.leastNormalMagnitude * count {
            // The nonlinear correction is below representable precision here.
            // Dividing once avoids double rounding and spurious subnormal zeros.
            fraction = spr / count
        } else {
            let growth: Double
            if spr <= Double.greatestFiniteMagnitude / 2 {
                growth = log1p(2 * spr)
            } else {
                // The logarithm stays finite even when doubling the SPR would overflow.
                growth = log(spr) + log(2 + 1 / spr)
            }
            fraction = expm1(growth / count) / 2
        }

        guard fraction.isFinite else { throw .fractionOverflow }
        guard fraction > 0 else { throw .fractionUnderflow }
        return fraction
    }

    static func checkedGeometric(
        pot: Double,
        effectiveStack: Double
    ) throws(PokerMathError) -> GeometricSizing {
        try requirePositive(pot, name: "pot")
        try requirePositive(effectiveStack, name: "effective stack")

        let spr = effectiveStack / pot
        guard spr.isFinite else { throw .sprOverflow }
        guard spr > 0 else { throw .sprUnderflow }

        let twoStreet = try sizing(pot: pot, effectiveStack: effectiveStack, spr: spr, streets: 2)
        let threeStreet = try sizing(pot: pot, effectiveStack: effectiveStack, spr: spr, streets: 3)
        return GeometricSizing(spr: spr, twoStreet: twoStreet, threeStreet: threeStreet)
    }

    static func checkedPreflop(facingBet: Double) throws(PokerMathError) -> [RaiseSize] {
        try requirePositive(facingBet, name: "facing bet")
        var sizes: [RaiseSize] = []
        for kind in RaiseKind.allCases {
            let amount = facingBet * kind.multiplier
            guard amount.isFinite else { throw .raiseOverflow }
            sizes.append(RaiseSize(kind: kind, amount: amount))
        }
        return sizes
    }

    private static func sizing(
        pot: Double,
        effectiveStack: Double,
        spr: Double,
        streets: Int
    ) throws(PokerMathError) -> StreetSizing {
        let fraction = try checkedFraction(spr: spr, streets: streets)
        let firstBet = pot * fraction
        guard firstBet.isFinite else { throw .firstBetOverflow }
        guard firstBet > 0 else { throw .firstBetUnderflow }
        guard firstBet < effectiveStack else { throw .insufficientPrecision }

        if spr.isSubnormal || fraction.isSubnormal || firstBet.isSubnormal {
            // A nonzero subnormal can still lose too much precision to size a hand.
            // Sum shares of the stack so that the check itself does not underflow.
            var currentPot = pot
            var committedShare = 0.0
            for street in 0..<streets {
                let bet = currentPot * fraction
                guard bet.isFinite, bet > 0 else { throw .insufficientPrecision }
                committedShare += bet / effectiveStack
                if street + 1 < streets {
                    currentPot += 2 * bet
                    guard currentPot.isFinite else { throw .insufficientPrecision }
                }
            }
            guard committedShare.isFinite, abs(committedShare - 1) <= 1e-12 else {
                throw .insufficientPrecision
            }
        }

        var bets = [firstBet]
        var remaining = effectiveStack - firstBet
        var previousBet = firstBet
        let growth = 1 + 2 * fraction
        for _ in 1..<(streets - 1) {
            // Advancing the bet directly avoids overflowing an intermediate pot.
            let bet = previousBet * growth
            guard bet.isFinite, bet > 0, bet < remaining else { throw .insufficientPrecision }
            bets.append(bet)
            remaining -= bet
            previousBet = bet
        }
        guard remaining.isFinite, remaining > 0 else { throw .insufficientPrecision }
        bets.append(remaining)
        return StreetSizing(streets: streets, fraction: fraction, firstBet: firstBet, bets: bets)
    }

    private static func requirePositive(
        _ value: Double,
        name: String
    ) throws(PokerMathError) {
        guard value.isFinite, value > 0 else { throw .invalidAmount(name) }
    }
}
