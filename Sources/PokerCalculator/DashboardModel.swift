import AppKit
import Observation
import PokerCore

enum InputField: String, CaseIterable {
    case pot, stack, facingBet

    var title: String {
        title(in: .english)
    }

    func title(in language: AppLanguage) -> String {
        switch self {
        case .pot: language.text(.currentPot)
        case .stack: language.text(.effectiveStack)
        case .facingBet: language.text(.facingBet)
        }
    }

    func hint(in language: AppLanguage) -> String {
        switch self {
        case .pot: language.text(.potHint)
        case .stack: language.text(.stackHint)
        case .facingBet: language.text(.facingBetHint)
        }
    }

    var shortcut: String {
        switch self {
        case .pot: "1"
        case .stack: "2"
        case .facingBet: "3"
        }
    }

    func neighbor(backwards: Bool) -> InputField {
        switch self {
        case .pot: backwards ? .facingBet : .stack
        case .stack: backwards ? .pot : .facingBet
        case .facingBet: backwards ? .stack : .pot
        }
    }
}

@MainActor @Observable
final class DashboardModel {
    var hand = HandState()
    var focusedField: InputField?
    var feedback: String?
    var feedbackIsError = false
    var showAssumptions = false
    var language: AppLanguage = .english {
        didSet {
            if oldValue != language {
                feedback = nil
                feedbackID = UUID()
                // Synchronize the editor before RTL layout can end editing and commit its old style.
                let alignment: NSTextAlignment = language.isRightToLeft ? .right : .left
                for field in fields.values {
                    field.synchronizeAmountAlignment(alignment)
                }
            }
        }
    }
    private let decimalSeparator: String

    var parser: AmountParser { AmountParser(decimalSeparator: decimalSeparator, language: language) }
    var format: PokerFormat { PokerFormat(decimalSeparator: decimalSeparator, language: language) }

    @ObservationIgnored weak var window: NSWindow?
    @ObservationIgnored var fields: [InputField: NSTextField] = [:]
    @ObservationIgnored var resultLabels: [String: ResultNumberLabel] = [:]
    @ObservationIgnored var measuredFrames: [String: CGRect] = [:]
    @ObservationIgnored private var feedbackID = UUID()
    @ObservationIgnored private var didAttachWindow = false

    init(decimalSeparator: String = Locale.current.decimalSeparator ?? ".") {
        self.decimalSeparator = decimalSeparator
    }

    func text(_ key: AppText) -> String {
        language.text(key)
    }

    var evaluation: HandEvaluation {
        HandEvaluation(hand: hand, parser: parser)
    }

    func attach(window: NSWindow) {
        self.window = window
        applyWindowLevel()
        guard !didAttachWindow else { return }
        didAttachWindow = true
        window.identifier = NSUserInterfaceItemIdentifier("PokerCalculator.main")
        window.isRestorable = false
        window.title = "PokerCalculator"
        window.backgroundColor = .windowBackgroundColor
        window.tabbingMode = .disallowed
        window.autorecalculatesKeyViewLoop = false
        window.contentMinSize = NSSize(
            width: DashboardLayout.minimumWidth,
            height: DashboardLayout.minimumHeight
        )
        if let screen = window.screen ?? NSScreen.main {
            let visible = screen.visibleFrame
            let size = NSSize(
                width: min(DashboardLayout.defaultWidth, visible.width - 48),
                height: min(DashboardLayout.defaultHeight, visible.height - 58)
            )
            window.setContentSize(size)
            let frame = window.frame
            window.setFrameOrigin(NSPoint(
                x: visible.midX - frame.width / 2,
                y: visible.midY - frame.height / 2
            ))
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.connectKeyViews()
            self.focus(.pot)
            AppDiagnostics.startIfRequested(model: self)
        }
    }

    func applyWindowLevel() {
        let desired: NSWindow.Level = hand.isPinned ? .floating : .normal
        if window?.level != desired {
            window?.level = desired
        }
    }

    func register(_ textField: NSTextField, for field: InputField) {
        fields[field] = textField
        connectKeyViews()
    }

    private func connectKeyViews() {
        guard let pot = fields[.pot], let stack = fields[.stack],
              let facing = fields[.facingBet] else { return }
        pot.nextKeyView = stack
        stack.nextKeyView = facing
        facing.nextKeyView = pot
        window?.initialFirstResponder = pot
    }

    func focus(_ field: InputField) {
        guard let textField = fields[field], let window = textField.window else { return }
        window.makeFirstResponder(textField)
        textField.selectText(nil)
    }

    func newHand() {
        hand.reset()
        showAssumptions = false
        notify(text(.handCleared))
        focus(.pot)
    }

    func copy(_ value: Double?, label: String, to pasteboard: NSPasteboard = .general) {
        guard let value, let text = format.copyAmount(value) else {
            notify(text(.noValidAmount), isError: true)
            return
        }
        pasteboard.clearContents()
        guard pasteboard.setString(text, forType: .string) else {
            notify(self.text(.copyFailed), isError: true)
            return
        }
        notify(self.text(.copied(label: label, amount: text)))
    }

    private func notify(_ message: String, isError: Bool = false) {
        let id = UUID()
        feedbackID = id
        feedback = message
        feedbackIsError = isError
        NSAccessibility.post(
            element: window as Any? ?? NSApp as Any,
            notification: .announcementRequested,
            userInfo: [
                .announcement: message,
                .priority: NSAccessibilityPriorityLevel.medium.rawValue,
            ]
        )
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) { [weak self] in
            guard let self, self.feedbackID == id else { return }
            self.feedback = nil
        }
    }

    func inputMessage(_ input: AmountInput, field: InputField, text: String) -> String? {
        if case .incomplete = input {
            return focusedField == field ? nil : self.text(.finishAmount)
        }
        if focusedField == field {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed == "0" || trimmed == "0\(parser.decimalSeparator)" {
                return nil
            }
        }
        return input.message
    }
}
