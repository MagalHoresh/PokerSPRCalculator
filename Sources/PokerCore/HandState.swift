public enum LiveResult<Value: Equatable & Sendable>: Equatable, Sendable {
    case waiting
    case invalid(String)
    case ready(Value)

    public var value: Value? {
        if case .ready(let value) = self { return value }
        return nil
    }

    public var message: String? {
        if case .invalid(let message) = self { return message }
        return nil
    }

    init(language: AppLanguage = .english, catching operation: () throws(PokerMathError) -> Value) {
        switch Result<Value, PokerMathError>(catching: operation) {
        case .success(let value): self = .ready(value)
        case .failure(let error): self = .invalid(error.message(in: language))
        }
    }
}

/// Ephemeral hand input only; this type performs no persistence or networking.
public struct HandState: Equatable, Sendable {
    public var pot: String = ""
    public var stack: String = ""
    public var facingBet: String = ""
    public var isPinned: Bool = false

    public init() {}

    /// Clears the hand while preserving the user's opt-in pin setting.
    public mutating func reset() {
        pot = ""
        stack = ""
        facingBet = ""
    }
}

/// A fresh, independent evaluation of the geometric and preflop input groups.
/// Empty or intermediate inputs wait; malformed inputs replace, never retain, results.
public struct HandEvaluation: Equatable, Sendable {
    public let potInput: AmountInput
    public let stackInput: AmountInput
    public let facingBetInput: AmountInput
    public let geometric: LiveResult<GeometricSizing>
    public let preflop: LiveResult<[RaiseSize]>

    public init(hand: HandState, parser: AmountParser) {
        potInput = parser.parse(hand.pot)
        stackInput = parser.parse(hand.stack)
        facingBetInput = parser.parse(hand.facingBet)

        switch (potInput, stackInput) {
        case (.invalid(let message), _):
            geometric = .invalid(parser.language.text(.potError(message)))
        case (_, .invalid(let message)):
            geometric = .invalid(parser.language.text(.stackError(message)))
        case (.valid(let pot), .valid(let stack)):
            geometric = LiveResult(language: parser.language, catching: { () throws(PokerMathError) in
                try PokerMath.checkedGeometric(pot: pot, effectiveStack: stack)
            })
        default:
            geometric = .waiting
        }

        switch facingBetInput {
        case .invalid(let message):
            preflop = .invalid(parser.language.text(.facingBetError(message)))
        case .valid(let facingBet):
            preflop = LiveResult(language: parser.language, catching: { () throws(PokerMathError) in
                try PokerMath.checkedPreflop(facingBet: facingBet)
            })
        case .empty, .incomplete:
            preflop = .waiting
        }
    }
}
