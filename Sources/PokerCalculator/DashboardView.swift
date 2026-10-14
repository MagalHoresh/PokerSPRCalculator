import PokerCore
import SwiftUI

private enum Palette {
    static let canvas = Color(nsColor: .windowBackgroundColor)
    static let surface = Color(nsColor: .controlBackgroundColor)
    static let tealInk = NSColor(name: "PokerTeal") { appearance in
        appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            ? NSColor(srgbRed: 0.29, green: 0.81, blue: 0.74, alpha: 1)
            : NSColor(srgbRed: 0.02, green: 0.39, blue: 0.39, alpha: 1)
    }
    static let blueInk = NSColor(name: "PokerBlue") { appearance in
        appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            ? NSColor(srgbRed: 0.45, green: 0.66, blue: 1, alpha: 1)
            : NSColor(srgbRed: 0.12, green: 0.31, blue: 0.65, alpha: 1)
    }
    static let teal = Color(nsColor: tealInk)
    static let blue = Color(nsColor: blueInk)
}

struct DashboardView: View {
    @Bindable var model: DashboardModel
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        GeometryReader { geometry in
            let compact = geometry.size.height < 720
            let evaluation = model.evaluation
            VStack(spacing: 10) {
                header
                    .frame(height: 34)
                HStack(alignment: .top, spacing: 14) {
                    geometricPanel(evaluation, compact: compact)
                    preflopPanel(evaluation, compact: compact)
                        .frame(width: geometry.size.width < 1160 ? 340 : 360)
                }
                .frame(maxHeight: .infinity)
                reference
                footer
            }
            .padding(compact ? 14 : 18)
            .background(Palette.canvas)
            .coordinateSpace(name: "dashboard")
            .onPreferenceChange(LayoutFramesKey.self) { model.measuredFrames = $0 }
        }
        .tint(Palette.teal)
        .environment(\.layoutDirection, model.language.isRightToLeft ? .rightToLeft : .leftToRight)
        .environment(\.locale, Locale(identifier: model.language.rawValue))
        .onChange(of: model.hand.isPinned) { model.applyWindowLevel() }
        .popover(isPresented: $model.showAssumptions, arrowEdge: .bottom) {
            assumptions
                .environment(\.layoutDirection, model.language.isRightToLeft ? .rightToLeft : .leftToRight)
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Palette.teal.opacity(0.13))
                Image(systemName: "suit.spade.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Palette.teal)
            }
            .frame(width: 32, height: 32)
            .accessibilityHidden(true)
            Text("PokerCalculator")
                .font(.system(size: 18, weight: .semibold))
            Spacer(minLength: 12)
            if let feedback = model.feedback {
                Label(feedback, systemImage: model.feedbackIsError ? "exclamationmark.circle" : "checkmark.circle.fill")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(model.feedbackIsError ? Color.red : .secondary)
                    .lineLimit(2)
                    .frame(maxWidth: 270, alignment: .trailing)
                    .accessibilityIdentifier("action-feedback")
            }
            Picker(model.text(.language), selection: $model.language) {
                ForEach(AppLanguage.allCases, id: \.self) { language in
                    Text(language.segmentTitle)
                        .accessibilityLabel(language.nativeName)
                        .tag(language)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 100)
            .help(model.text(.languageHelp))
            .accessibilityIdentifier("language-toggle")
            .layoutProbe("language-toggle")
            Toggle(isOn: $model.hand.isPinned) {
                Label(model.text(model.hand.isPinned ? .pinned : .keepOnTop), systemImage: model.hand.isPinned ? "pin.fill" : "pin")
                    .font(.system(size: 13, weight: .medium))
            }
            .toggleStyle(.button)
            .controlSize(.regular)
            .help(model.text(.pinHelp))
            .accessibilityLabel(model.text(.keepOnTop))
            .accessibilityValue(model.text(model.hand.isPinned ? .on : .off))
            .accessibilityIdentifier("pin-window")
            Button(action: model.newHand) {
                Label(model.text(.newHand), systemImage: "arrow.counterclockwise")
                    .font(.system(size: 13, weight: .semibold))
            }
            .controlSize(.regular)
            .buttonStyle(.bordered)
            .help(model.text(.newHandHelp))
            .accessibilityIdentifier("new-hand")
        }
        .environment(\.layoutDirection, .leftToRight)
        .layoutProbe("header")
    }

    private func geometricPanel(_ evaluation: HandEvaluation, compact: Bool) -> some View {
        let sizing = evaluation.geometric.value
        return VStack(alignment: .leading, spacing: 10) {
            sectionHeading(model.text(.postflop), subtitle: model.text(.pathToAllIn))
            HStack(alignment: .top, spacing: 12) {
                AmountField(field: .pot, text: $model.hand.pot, input: evaluation.potInput, model: model)
                AmountField(field: .stack, text: $model.hand.stack, input: evaluation.stackInput, model: model)
                VStack(alignment: .leading, spacing: 5) {
                    Text("SPR")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.secondary)
                    resultNumber(
                        sizing.map { model.format.spr($0.spr) } ?? "—",
                        size: compact ? 30 : 34, id: "spr-number", label: model.text(.sprName)
                    )
                    Text(model.text(.sprFormula))
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                .frame(width: 140, alignment: .leading)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(model.text(.sprName))
                .accessibilityValue(sizing.map { model.format.spr($0.spr) } ?? model.text(.validPotAndStack))
                .layoutProbe("spr")
            }
            HStack(spacing: 12) {
                streetResult(sizing?.twoStreet, streets: 2, compact: compact)
                streetResult(sizing?.threeStreet, streets: 3, compact: compact)
            }
            .frame(maxHeight: .infinity)
            geometricStatus(evaluation.geometric)
                .font(.system(size: 11))
                .frame(height: 27, alignment: .topLeading)
        }
        .padding(14)
        .panelSurface(highContrast: contrast == .increased)
        .layoutProbe("postflop-panel")
    }

    private func streetResult(_ sizing: StreetSizing?, streets: Int, compact: Bool) -> some View {
        let tint = streets == 2 ? Palette.teal : Palette.blue
        let overPot = (sizing?.fraction ?? 0) > 1 + 1e-12
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(streets)e")
                        .font(.system(size: 19, weight: .bold))
                        .environment(\.layoutDirection, .leftToRight)
                    Text(model.text(.streets(streets)))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                .fixedSize()
                .foregroundStyle(tint)
                VStack(alignment: .trailing, spacing: 0) {
                    resultNumber(
                        sizing.map { model.format.percent($0.fraction) } ?? "—",
                        size: compact ? 32 : 36, id: "percent-\(streets)",
                        label: model.text(.streetPercentage(streets)),
                        alignment: .right, color: streets == 2 ? Palette.tealInk : Palette.blueInk
                    )
                    Text(model.text(overPot ? .overPot : .potEachStreet))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }
            Rectangle().fill(tint.opacity(contrast == .increased ? 0.65 : 0.18)).frame(height: 1)
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(model.text(.betNow))
                        .font(.system(size: 12, weight: .bold))
                        .tracking(model.language.isRightToLeft ? 0 : 1)
                        .foregroundStyle(tint)
                    Spacer()
                    copyButton(sizing?.firstBet, label: model.text(.betCopyLabel(streets: streets, number: 1, allIn: false)))
                }
                resultNumber(
                    sizing.map { model.format.amount($0.firstBet) } ?? "—",
                    size: compact ? 64 : 72, id: "first-bet-\(streets)",
                    label: model.text(.firstBetLabel(streets)), alignment: .right
                )
            }
            Spacer(minLength: 0)
            VStack(spacing: 7) {
                ForEach(1..<streets, id: \.self) { index in
                    futureBet(
                        sizing?.bets[index], number: index + 1, streets: streets,
                        compact: compact
                    )
                    if index < streets - 1 {
                        Divider()
                    }
                }
            }
        }
        .padding(compact ? 12 : 14)
        .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(tint.opacity(contrast == .increased ? 0.8 : 0.3), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(model.text(.streetPlan(streets)))
    }

    private func futureBet(_ amount: Double?, number: Int, streets: Int, compact: Bool) -> some View {
        let isAllIn = number == streets
        let label = model.text(isAllIn ? .allIn : .bet(number))
        let afterCall = model.text(.afterCalls(number - 1))
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 2) {
                    Text(label)
                        .font(.system(size: 13, weight: .semibold))
                    copyButton(amount, label: model.text(.betCopyLabel(streets: streets, number: number, allIn: isAllIn)))
                }
                Text(afterCall)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }
            .fixedSize()
            resultNumber(
                amount.map(model.format.amount) ?? "—",
                size: compact ? 38 : 44, id: "later-bet-\(streets)-\(number)",
                label: model.text(.futureBetLabel(number: number, allIn: isAllIn)),
                alignment: .right
            )
        }
        .accessibilityElement(children: .contain)
    }

    private func resultNumber(
        _ text: String, size: CGFloat, id: String, label: String,
        alignment: NSTextAlignment = .left, color: NSColor = .labelColor
    ) -> some View {
        ResultNumber(
            text: text, pointSize: size, id: id, label: label, model: model,
            alignment: alignment, color: color
        )
        .frame(height: ResultNumberLabel.height(for: size))
        .frame(maxWidth: .infinity)
        .help("\(label): \(model.language.numericToken(text))")
        .layoutProbe(id)
    }

    @ViewBuilder
    private func geometricStatus(_ result: LiveResult<GeometricSizing>) -> some View {
        switch result {
        case .waiting:
            Text(model.text(.waitingForAmounts))
                .foregroundStyle(.secondary)
        case .invalid(let message):
            Label(message, systemImage: "exclamationmark.circle")
                .foregroundStyle(.red)
        case .ready(let sizing):
            VStack(alignment: .leading, spacing: 3) {
                Text(model.text(sizing.twoStreet.fraction > 1 + 1e-12 ? .overPotNote : .matchingCallNote))
                Text(model.text(.roundingNote))
                    .font(.system(size: 10))
            }
            .foregroundStyle(.secondary)
        }
    }

    private func preflopPanel(_ evaluation: HandEvaluation, compact: Bool) -> some View {
        let sizes = evaluation.preflop.value
        return VStack(alignment: .leading, spacing: 10) {
            sectionHeading(model.text(.preflop), subtitle: model.text(.raiseTo))
            AmountField(field: .facingBet, text: $model.hand.facingBet, input: evaluation.facingBetInput, model: model)
            VStack(spacing: 0) {
                raiseRow("3-BET", kinds: [.threeBetIP, .threeBetOOP], sizes: sizes, compact: compact)
                Divider().padding(.vertical, 10)
                raiseRow("4-BET", kinds: [.fourBetIP, .fourBetOOP], sizes: sizes, compact: compact)
            }
            .frame(maxHeight: .infinity)
            Group {
                if let message = evaluation.preflop.message {
                    Label(message, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                } else {
                    Text(model.text(.totalTargets))
                        .foregroundStyle(.secondary)
                }
            }
            .font(.system(size: 11))
            .frame(height: 27, alignment: .topLeading)
        }
        .padding(14)
        .panelSurface(highContrast: contrast == .increased)
        .layoutProbe("preflop-panel")
    }

    private func raiseRow(_ title: String, kinds: [RaiseKind], sizes: [RaiseSize]?, compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 12, weight: .bold))
                .tracking(1)
                .foregroundStyle(.secondary)
                .environment(\.layoutDirection, .leftToRight)
            HStack(alignment: .top, spacing: 12) {
                ForEach(kinds) { kind in
                    let amount = sizes?.first { $0.kind == kind }?.amount
                    VStack(alignment: .leading, spacing: 2) {
                        Text(kind.positionLabel(in: model.language))
                            .font(.system(size: 13, weight: .semibold))
                        resultNumber(
                            amount.map(model.format.amount) ?? "—", size: compact ? 48 : 56,
                            id: "raise-\(kind.rawValue)",
                            label: model.text(.raiseLabel(kind))
                        )
                        HStack {
                            Text(kind.multiplierLabel)
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                                .environment(\.layoutDirection, .leftToRight)
                            Spacer()
                            copyButton(amount, label: model.text(.raiseCopyLabel(kind)))
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("\(model.text(.raiseLabel(kind))), \(model.language.numericToken(kind.multiplierLabel))")
                }
            }
        }
        .frame(maxHeight: .infinity, alignment: .center)
    }

    private var reference: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(model.text(.sprReference))
                    .font(.system(size: 12, weight: .semibold))
                Text(model.text(.percentOfPot))
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }
            .frame(width: 130, alignment: .leading)
            Grid(horizontalSpacing: 0, verticalSpacing: 3) {
                GridRow {
                    referenceRowLabel("SPR")
                    ForEach(ReferenceEntry.entries) { entry in
                        Text(String(entry.spr))
                            .font(.system(size: 12, weight: .semibold))
                            .frame(maxWidth: .infinity)
                    }
                }
                GridRow {
                    referenceRowLabel("2e")
                    ForEach(ReferenceEntry.entries) { entry in
                        referenceValue(entry.twoStreet, spr: entry.spr, streets: 2)
                    }
                }
                GridRow {
                    referenceRowLabel("3e")
                    ForEach(ReferenceEntry.entries) { entry in
                        referenceValue(entry.threeStreet, spr: entry.spr, streets: 3)
                    }
                }
            }
        }
        .foregroundStyle(.secondary)
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .layoutProbe("reference")
    }

    private func referenceRowLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.secondary)
            .frame(width: 32, alignment: .leading)
    }

    private func referenceValue(_ value: Result<Double, ReferenceError>, spr: Int, streets: Int) -> some View {
        let text: String
        switch value {
        case .success(let fraction): text = model.format.percent(fraction)
        case .failure: text = model.text(.error)
        }
        return Text(text)
            .font(.system(size: 13))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .frame(maxWidth: .infinity)
            .environment(\.layoutDirection, .leftToRight)
            .accessibilityLabel(model.text(.referenceLabel(spr: spr, streets: streets, percent: text)))
    }

    private var footer: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(model.text(.unitsNote(model.parser.decimalSeparator)))
                    .font(.system(size: 11))
                Text(model.text(.assumptionsNote))
                    .font(.system(size: 11))
            }
            .foregroundStyle(.secondary)
            Spacer(minLength: 6)
            Button { model.showAssumptions = true } label: {
                Label(model.text(.assumptions), systemImage: "info.circle")
                    .font(.system(size: 12))
            }
            .buttonStyle(.borderless)
            .help(model.text(.assumptionsHelp))
            Label(model.text(.offline), systemImage: "checkmark.shield")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
                .accessibilityLabel(model.text(.offlineHelp))
        }
        .frame(height: 28)
        .layoutProbe("footer")
    }

    private var assumptions: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(model.text(.assumptionsTitle))
                .font(.title2.bold())
            Text(model.text(.effectiveStackExplanation))
            Text(model.text(.geometricExplanation))
            Text(model.text(.planExplanation))
            Text(model.text(.roundingExplanation))
            Text(model.text(.inputRules))
                .foregroundStyle(.secondary)
            Button(model.text(.done)) { model.showAssumptions = false }
                .keyboardShortcut(.cancelAction)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .font(.system(size: 13))
        .fixedSize(horizontal: false, vertical: true)
        .padding(22)
        .frame(width: 470)
    }

    private func sectionHeading(_ title: String, subtitle: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
            Spacer(minLength: 0)
            Text(subtitle)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
    }

    private func copyButton(_ amount: Double?, label: String) -> some View {
        Button { model.copy(amount, label: label) } label: {
            Image(systemName: "doc.on.doc")
                .font(.system(size: 13, weight: .medium))
                .frame(width: 26, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .disabled(amount.flatMap(model.format.copyAmount) == nil)
        .help(model.text(.copyHelp(label)))
        .accessibilityLabel(model.text(.copyLabel(label)))
        .accessibilityIdentifier("copy-\(label)")
    }
}

private enum ReferenceError: Error {
    case calculation(String)
}

private struct ReferenceEntry: Identifiable, Sendable {
    let spr: Int
    let twoStreet: Result<Double, ReferenceError>
    let threeStreet: Result<Double, ReferenceError>
    var id: Int { spr }

    static let entries: [ReferenceEntry] = [2, 3, 4, 7, 10, 13, 30].map { spr in
        func fraction(streets: Int) -> Result<Double, ReferenceError> {
            do {
                return .success(try PokerMath.fraction(spr: Double(spr), streets: streets))
            } catch {
                return .failure(.calculation(error.localizedDescription))
            }
        }
        return ReferenceEntry(spr: spr, twoStreet: fraction(streets: 2), threeStreet: fraction(streets: 3))
    }
}

private struct PanelSurface: ViewModifier {
    let highContrast: Bool

    func body(content: Content) -> some View {
        content
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 15))
            .overlay {
                RoundedRectangle(cornerRadius: 15)
                    .strokeBorder(Color.primary.opacity(highContrast ? 0.5 : 0.1), lineWidth: 1)
            }
    }
}

struct LayoutFramesKey: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]

    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

private extension View {
    func panelSurface(highContrast: Bool) -> some View {
        modifier(PanelSurface(highContrast: highContrast))
    }
}

extension View {
    func layoutProbe(_ id: String) -> some View {
        background {
            GeometryReader { proxy in
                Color.clear.preference(key: LayoutFramesKey.self, value: [id: proxy.frame(in: .named("dashboard"))])
            }
        }
    }
}
