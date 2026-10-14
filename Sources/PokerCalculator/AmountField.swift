import AppKit
import PokerCore
import SwiftUI

struct AmountField: View {
    let field: InputField
    @Binding var text: String
    let input: AmountInput
    let model: DashboardModel

    private var message: String? {
        model.inputMessage(input, field: field, text: text)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text(field.title(in: model.language))
                    .font(.system(size: 14, weight: .semibold))
                Spacer(minLength: 2)
                Text("⌘\(field.shortcut)")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                    .environment(\.layoutDirection, .leftToRight)
            }
            NativeAmountEntry(
                text: $text, field: field, model: model,
                accessibilityHint: message ?? field.hint(in: model.language),
                fontSize: 26
            )
            .frame(height: 34)
            .padding(.horizontal, 11)
            .padding(.vertical, 5)
            .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 9))
            .overlay {
                RoundedRectangle(cornerRadius: 9)
                    .strokeBorder(
                        message != nil ? Color.red : model.focusedField == field ? .accentColor : Color.primary.opacity(0.18),
                        lineWidth: model.focusedField == field || message != nil ? 2 : 1
                    )
            }
            Text(message ?? field.hint(in: model.language))
                .font(.system(size: 11))
                .foregroundStyle(message != nil ? Color.red : .secondary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(height: 25, alignment: .topLeading)
                .accessibilityLabel(message.map { model.text(.fieldError($0)) } ?? field.hint(in: model.language))
        }
        .layoutProbe("input-\(field.rawValue)")
    }
}

struct NativeAmountEntry: NSViewRepresentable {
    @Binding var text: String
    let field: InputField
    let model: DashboardModel
    let accessibilityHint: String
    let fontSize: CGFloat

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeNSView(context: Context) -> NSTextField {
        let textField = FocusAwareTextField()
        textField.onFocus = { model.focusedField = field }
        textField.delegate = context.coordinator
        textField.isBordered = false
        textField.drawsBackground = false
        textField.focusRingType = .none
        textField.usesSingleLineMode = true
        textField.cell?.isScrollable = true
        textField.cell?.baseWritingDirection = .leftToRight
        textField.lineBreakMode = .byClipping
        textField.textColor = .labelColor
        textField.placeholderString = "0\(model.parser.decimalSeparator)0"
        textField.identifier = NSUserInterfaceItemIdentifier("field-\(field.rawValue)")
        textField.setAccessibilityIdentifier("field-\(field.rawValue)")
        textField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        textField.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        model.register(textField, for: field)
        return textField
    }

    final class FocusAwareTextField: NSTextField {
        var onFocus: (() -> Void)?

        override func becomeFirstResponder() -> Bool {
            let accepted = super.becomeFirstResponder()
            if accepted {
                onFocus?()
            }
            return accepted
        }
    }

    func updateNSView(_ textField: NSTextField, context: Context) {
        context.coordinator.parent = self
        let alignment: NSTextAlignment = model.language.isRightToLeft ? .right : .left
        if textField.stringValue != text {
            textField.stringValue = text
        }
        textField.font = .monospacedDigitSystemFont(ofSize: fontSize, weight: .medium)
        textField.synchronizeAmountAlignment(alignment)
        textField.setAccessibilityLabel(field.title(in: model.language))
        textField.setAccessibilityHelp(model.text(.fieldHelp(hint: accessibilityHint, shortcut: field.shortcut)))
    }

    @MainActor
    final class Coordinator: NSObject, NSTextFieldDelegate {
        var parent: NativeAmountEntry

        init(parent: NativeAmountEntry) {
            self.parent = parent
        }

        func controlTextDidBeginEditing(_ notification: Notification) {
            parent.model.focusedField = parent.field
        }

        func controlTextDidChange(_ notification: Notification) {
            guard let textField = notification.object as? NSTextField else { return }
            parent.text = textField.stringValue
        }

        func controlTextDidEndEditing(_ notification: Notification) {
            if parent.model.focusedField == parent.field {
                parent.model.focusedField = nil
            }
        }

        func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            let backwards = commandSelector == #selector(NSResponder.insertBacktab(_:))
            guard backwards || commandSelector == #selector(NSResponder.insertTab(_:))
                || commandSelector == #selector(NSResponder.insertNewline(_:)) else { return false }
            parent.model.focus(parent.field.neighbor(backwards: backwards))
            return true
        }
    }
}

extension NSTextField {
    func synchronizeAmountAlignment(_ alignment: NSTextAlignment) {
        if let editor = currentEditor() as? NSTextView {
            let paragraph = (editor.typingAttributes[.paragraphStyle] as? NSParagraphStyle)
                ?? editor.defaultParagraphStyle ?? .default
            if paragraph.alignment != alignment || paragraph.baseWritingDirection != .leftToRight {
                let style = NSMutableParagraphStyle()
                style.setParagraphStyle(paragraph)
                style.alignment = alignment
                style.baseWritingDirection = .leftToRight
                editor.defaultParagraphStyle = style
                var typing = editor.typingAttributes
                typing[.paragraphStyle] = style
                editor.typingAttributes = typing
                if let storage = editor.textStorage, storage.length > 0 {
                    storage.addAttribute(.paragraphStyle, value: style, range: NSRange(location: 0, length: storage.length))
                }
            }
        }
        cell?.baseWritingDirection = .leftToRight
        cell?.alignment = alignment
        needsDisplay = true
    }
}
