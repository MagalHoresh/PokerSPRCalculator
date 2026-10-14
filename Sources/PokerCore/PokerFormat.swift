import Foundation

/// Ungrouped, fixed-point formatting of finite positive values.
///
/// Rounding is half-up using a POSIX Foundation formatter, with an explicitly
/// configured decimal separator. Amounts have one decimal place. Percentages
/// and SPR have at most one decimal place. Positive values rounding to zero
/// use a "<0.1" indicator rather than adding more digits or displaying zero.
///
/// Large Doubles whose spacing is at least 1 are already exact integers. They
/// are rendered in full fixed-point form, avoiding formatter significant-digit
/// limits, scientific notation, and abbreviated clipboard values.
public struct PokerFormat: Sendable {
    public let decimalSeparator: String
    public let language: AppLanguage

    public init(decimalSeparator: String = ".", language: AppLanguage = .english) {
        self.decimalSeparator = decimalSeparator
        self.language = language
    }

    public func amount(_ value: Double) -> String {
        formattedAmount(value).text
    }

    /// Exactly the displayed amount precision and separator, with no grouping.
    /// Indicators and invalid values are not numeric clipboard successes.
    public func copyAmount(_ value: Double) -> String? {
        if case .number(let text) = formattedAmount(value) { return text }
        return nil
    }

    public func percent(_ fraction: Double) -> String {
        guard fraction.isFinite, fraction > 0 else { return language.text(.outOfRange) }
        let percent = fraction * 100
        switch render(percent, minimumPlaces: percent >= 100 ? 0 : 1, maximumPlaces: 1) {
        case .number(let text), .belowResolution(let text): return text + "%"
        case .failure(let message): return message
        }
    }

    public func spr(_ value: Double) -> String {
        render(value, minimumPlaces: 0, maximumPlaces: 1).text
    }

    private func formattedAmount(_ value: Double) -> Formatted {
        render(value, minimumPlaces: 1, maximumPlaces: 1)
    }

    private func render(
        _ value: Double,
        minimumPlaces: Int,
        maximumPlaces: Int
    ) -> Formatted {
        guard value.isFinite, value > 0 else { return .failure(language.text(.outOfRange)) }
        guard DecimalSeparator.isValid(decimalSeparator) else {
            return .failure(language.text(.invalidDecimalSeparator))
        }

        let resolution = "0" + decimalSeparator
            + String(repeating: "0", count: maximumPlaces - 1) + "1"
        if value < pow(10, -Double(maximumPlaces)) / 2 {
            return .belowResolution("<" + resolution)
        }

        if value >= 0x1p52 {
            let integer = String(format: "%.0f", locale: Locale(identifier: "en_US_POSIX"), value)
            guard !integer.isEmpty,
                  integer.unicodeScalars.allSatisfy(DecimalSeparator.isASCIIDigit) else {
                return .failure(language.text(.formattingFailed))
            }
            return .number(integer + (minimumPlaces == 0
                ? ""
                : decimalSeparator + String(repeating: "0", count: minimumPlaces)))
        }

        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.numberStyle = .decimal
        formatter.decimalSeparator = decimalSeparator
        formatter.usesGroupingSeparator = false
        formatter.usesSignificantDigits = false
        formatter.minimumIntegerDigits = 1
        formatter.maximumIntegerDigits = 309
        formatter.minimumFractionDigits = minimumPlaces
        formatter.maximumFractionDigits = maximumPlaces
        formatter.roundingMode = .halfUp

        guard let text = formatter.string(from: NSNumber(value: value)),
              !text.isEmpty,
              text.components(separatedBy: decimalSeparator).count <= 2,
              text.unicodeScalars.allSatisfy({
                  DecimalSeparator.isASCIIDigit($0) || String($0) == decimalSeparator
              }),
              text.unicodeScalars.contains(where: { (49...57).contains($0.value) }) else {
            return .failure(language.text(.formattingFailed))
        }
        return .number(text)
    }

    private enum Formatted {
        case number(String)
        case belowResolution(String)
        case failure(String)

        var text: String {
            switch self {
            case .number(let text), .belowResolution(let text), .failure(let text): text
            }
        }
    }
}
