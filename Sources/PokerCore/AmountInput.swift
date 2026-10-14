import Foundation

public enum AmountInput: Equatable, Sendable {
    case empty
    case incomplete
    case invalid(String)
    case valid(Double)

    public var value: Double? {
        if case .valid(let value) = self { return value }
        return nil
    }

    public var message: String? {
        if case .invalid(let message) = self { return message }
        return nil
    }
}

/// Parses ungrouped, unsigned, ordinary decimal amounts, never exponent notation.
///
/// The entry bounds are inclusive and are checked against the decimal text before
/// converting to Double, so rounding cannot admit an amount outside the bounds.
/// Arithmetic in `PokerMath` is not restricted to these user-entry bounds.
public struct AmountParser: Sendable {
    /// The smallest supported chip or big-blind entry.
    public static let minimumAmount: Double = 0.001

    /// The largest supported chip or big-blind entry.
    public static let maximumAmount: Double = 1_000_000_000_000

    /// Maximum input length in Unicode scalars, including surrounding whitespace.
    public static let maximumInputLength = 128

    /// One exact punctuation character, such as "." or ","; no separator guessing.
    public let decimalSeparator: String
    public let language: AppLanguage

    public init(decimalSeparator: String = ".", language: AppLanguage = .english) {
        self.decimalSeparator = decimalSeparator
        self.language = language
    }

    public func parse(_ text: String) -> AmountInput {
        guard text.unicodeScalars.prefix(Self.maximumInputLength + 1).count
                <= Self.maximumInputLength else {
            return .invalid(language.text(.amountTooLong(Self.maximumInputLength)))
        }

        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return .empty }
        if text == "+" || text == "-" { return .incomplete }

        guard DecimalSeparator.isValid(decimalSeparator) else {
            return .invalid(language.text(.invalidDecimalSeparator))
        }
        if text == decimalSeparator { return .incomplete }

        if text.unicodeScalars.contains(where: CharacterSet.whitespacesAndNewlines.contains) {
            return .invalid(language.text(.internalSpaces))
        }
        if text.contains("e") || text.contains("E") {
            return .invalid(language.text(.exponentNotation))
        }

        let parts = text.components(separatedBy: decimalSeparator)
        guard parts.count <= 2 else {
            return .invalid(language.text(.multipleSeparators(decimalSeparator)))
        }
        guard parts.allSatisfy({ $0.unicodeScalars.allSatisfy(DecimalSeparator.isASCIIDigit) }) else {
            return .invalid(language.text(.invalidCharacters(decimalSeparator)))
        }

        let integer = String(parts[0].drop(while: { $0 == "0" }))
        let fraction = parts.count == 2 ? parts[1] : ""
        let hasFraction = fraction.contains(where: { $0 != "0" })

        guard !integer.isEmpty || hasFraction else {
            return .invalid(language.text(.positiveAmount))
        }
        if integer.isEmpty && fraction.prefix(3).allSatisfy({ $0 == "0" }) {
            return .invalid(language.text(.minimumAmount(decimalSeparator)))
        }

        let maximumInteger = "1000000000000"
        if integer.count > maximumInteger.count
            || (integer.count == maximumInteger.count && integer > maximumInteger)
            || (integer == maximumInteger && hasFraction) {
            return .invalid(language.text(.maximumAmount(maximumInteger)))
        }

        let normalized = (integer.isEmpty ? "0" : integer)
            + (parts.count == 2 ? "." + fraction : "")
        guard let value = Double(normalized), value.isFinite else {
            return .invalid(language.text(.unrepresentableAmount))
        }
        guard value > 0 else {
            return .invalid(language.text(.unrepresentableTinyAmount(decimalSeparator)))
        }
        guard value >= Self.minimumAmount, value <= Self.maximumAmount else {
            return .invalid(language.text(.inputRange(separator: decimalSeparator, maximum: maximumInteger)))
        }
        return .valid(value)
    }
}

enum DecimalSeparator {
    static func isValid(_ separator: String) -> Bool {
        guard separator.unicodeScalars.count == 1,
              let scalar = separator.unicodeScalars.first else {
            return false
        }
        return CharacterSet.punctuationCharacters.contains(scalar) && separator != "-"
    }

    static func isASCIIDigit(_ scalar: Unicode.Scalar) -> Bool {
        (48...57).contains(scalar.value)
    }
}
