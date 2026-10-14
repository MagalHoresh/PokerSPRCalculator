import AppKit
import SwiftUI

struct ResultNumber: NSViewRepresentable {
    let text: String
    let pointSize: CGFloat
    let id: String
    let label: String
    let model: DashboardModel
    var alignment: NSTextAlignment = .left
    var color: NSColor = .labelColor

    func makeNSView(context: Context) -> ResultNumberLabel {
        let view = ResultNumberLabel()
        view.isEditable = false
        view.isSelectable = false
        view.isBordered = false
        view.drawsBackground = false
        view.usesSingleLineMode = true
        view.lineBreakMode = .byClipping
        view.cell?.isScrollable = false
        view.cell?.baseWritingDirection = .leftToRight
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setAccessibilityIdentifier(id)
        model.resultLabels[id] = view
        return view
    }

    func updateNSView(_ view: ResultNumberLabel, context: Context) {
        view.waitingText = model.text(.waitingForInput)
        view.configure(
            text: text, pointSize: pointSize,
            alignment: model.language.isRightToLeft ? .right : alignment, color: color
        )
        view.setAccessibilityLabel(label)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: ResultNumberLabel, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 100, height: ResultNumberLabel.height(for: pointSize))
    }
}

final class ResultNumberLabel: NSTextField {
    var waitingText = ""
    private(set) var requestedPointSize: CGFloat = 0
    private(set) var fittedPointSize: CGFloat = 0
    private(set) var renderedTextWidth: CGFloat = 0

    static func height(for pointSize: CGFloat) -> CGFloat {
        let font = NSFont.monospacedDigitSystemFont(ofSize: pointSize, weight: .bold)
        return ceil(font.ascender - font.descender + font.leading) + 4
    }

    var availableTextWidth: CGFloat {
        max(0, (cell?.titleRect(forBounds: bounds).width ?? bounds.width) - 2)
    }

    func configure(text: String, pointSize: CGFloat, alignment: NSTextAlignment, color: NSColor) {
        requestedPointSize = pointSize
        self.alignment = alignment
        textColor = text == "—" ? .tertiaryLabelColor : color
        if stringValue != text { stringValue = text }
        fitNumber()
        invalidateIntrinsicContentSize()
    }

    override var intrinsicContentSize: NSSize {
        NSSize(width: NSView.noIntrinsicMetric, height: Self.height(for: requestedPointSize))
    }

    override func accessibilityValue() -> String? {
        stringValue == "—" ? waitingText : stringValue
    }

    override func layout() {
        super.layout()
        fitNumber()
    }

    private func fitNumber() {
        guard availableTextWidth > 0, requestedPointSize > 0 else { return }
        func width(at pointSize: CGFloat) -> CGFloat {
            let font = NSFont.monospacedDigitSystemFont(ofSize: pointSize, weight: .bold)
            return (stringValue as NSString).size(withAttributes: [.font: font]).width
        }
        // Fit the complete amount, never an ellipsis or an abbreviated chip value.
        if width(at: requestedPointSize) <= availableTextWidth {
            fittedPointSize = requestedPointSize
        } else {
            var lower: CGFloat = 1
            var upper = requestedPointSize
            while upper - lower > 0.125 {
                let middle = (lower + upper) / 2
                if width(at: middle) <= availableTextWidth {
                    lower = middle
                } else {
                    upper = middle
                }
            }
            fittedPointSize = max(1, floor(lower * 4) / 4)
        }
        let fittedFont = NSFont.monospacedDigitSystemFont(ofSize: fittedPointSize, weight: .bold)
        if font != fittedFont { font = fittedFont }
        renderedTextWidth = (stringValue as NSString).size(withAttributes: [.font: fittedFont]).width
    }
}
