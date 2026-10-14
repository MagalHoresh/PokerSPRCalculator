import AppKit
import PokerCore

@MainActor
enum AppDiagnostics {
    static func startIfRequested(model: DashboardModel) {
        let arguments = CommandLine.arguments
        guard let index = arguments.firstIndex(of: "--verify-ui") else { return }
        guard arguments.indices.contains(index + 1), arguments[index + 1].hasPrefix("/") else {
            fail("Usage: PokerCalculator --verify-ui /absolute/output/directory")
        }
        let destination = URL(fileURLWithPath: arguments[index + 1], isDirectory: true)
        Task { @MainActor in
            do {
                try await run(model: model, destination: destination)
                NSApp.terminate(nil)
            } catch {
                fail("UI verification failed: \(error.localizedDescription)")
            }
        }
    }

    private static func run(model: DashboardModel, destination: URL) async throws {
        guard let window = model.window else { throw Failure("No native window was attached.") }
        try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
        window.makeKeyAndOrderFront(nil)
        try await settle(window)
        var checks: [String] = []
        var snapshots: [Snapshot] = []

        try require(model.hand == HandState(), "A normal launch must have empty fields and pin off.")
        try require(model.language == .english, "The app must launch in English, independent of system language.")
        try require(window.level == .normal, "Pin must be opt-in.")
        try require(model.fields.count == 3, "All three native text inputs must be present.")
        try require(window.screen?.visibleFrame.contains(window.frame) == true, "Default window exceeds the visible screen.")
        checks.append("Blank initial state; normal window level; default window fits the visible screen.")
        let languageToggle = try languageControl(window: window)
        try require(languageToggle.selectedSegment == 0, "EN must be selected by default.")
        checks.append("A native EN | עב segmented language toggle is visible in the header, with English selected.")

        for field in InputField.allCases {
            try require(
                menuItems(NSApp.mainMenu).contains {
                    $0.keyEquivalent == field.shortcut && $0.keyEquivalentModifierMask.contains(.command)
                },
                "Missing Command-\(field.shortcut) native menu shortcut."
            )
        }
        try require(menuItems(NSApp.mainMenu).contains { $0.keyEquivalent == "n" }, "Missing New Hand shortcut.")
        checks.append("Native menu contains all focus shortcuts and New Hand.")
        try await verifyInputAlignment(model: model, window: window)
        checks.append("All three fields synchronize cell/editor/typing alignment immediately in both directions, preserving values and active selections; rendered character bounds align without another keystroke.")

        try enter("100", into: .pot, model: model)
        try enter("241\(model.parser.decimalSeparator)6", into: .stack, model: model)
        try enter("3", into: .facingBet, model: model)
        try await settle(window)
        try require(model.evaluation.geometric.value?.spr == 241.6 / 100, "Text editing did not update SPR immediately.")
        try require(model.evaluation.preflop.value?.count == 4, "Preflop outputs did not update independently.")
        checks.append("Real native text editing updates SPR and all four preflop targets.")
        try require(
            model.evaluation.geometric.value?.threeStreet.bets.map(model.format.amount)
                == ["40\(model.parser.decimalSeparator)0", "72\(model.parser.decimalSeparator)0", "129\(model.parser.decimalSeparator)6"],
            "The 40% three-street path must show 40.0, 72.0, then 129.6 all-in."
        )
        checks.append("Pot 100 / stack 241.6 yields the full 40% path: 40.0, 72.0, 129.6 all-in after matching calls.")

        try command("1", window: window)
        try require(
            (model.fields[.pot]?.currentEditor() as? NSTextView)?.selectedRange().length == 3,
            "Focus must select the full existing amount for replacement."
        )
        try await tab(window: window)
        try require(
            model.fields[.stack]?.currentEditor() != nil,
            "Tab order must go from pot to stack. Active: \(focusedInput(model)); next: \(String(describing: model.fields[.pot]?.nextValidKeyView))."
        )
        try await tab(window: window)
        try require(model.fields[.facingBet]?.currentEditor() != nil, "Tab order must go from stack to facing bet.")
        try await tab(window: window)
        try require(model.fields[.pot]?.currentEditor() != nil, "Tab order must wrap from facing bet to pot.")
        try await tab(window: window, backwards: true)
        try require(model.fields[.facingBet]?.currentEditor() != nil, "Shift-Tab must traverse backwards. Active: \(focusedInput(model)).")
        try command("2", window: window)
        try require(model.fields[.stack]?.currentEditor() != nil, "Command-2 must focus the stack.")
        try command("3", window: window)
        try require(model.fields[.facingBet]?.currentEditor() != nil, "Command-3 must focus the facing bet.")
        guard let returnEvent = NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: [],
            timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
            context: nil, characters: "\r", charactersIgnoringModifiers: "\r",
            isARepeat: false, keyCode: 36
        ) else { throw Failure("Could not construct a Return key event.") }
        NSApp.postEvent(returnEvent, atStart: false)
        try await settle(window)
        try require(model.fields[.pot]?.currentEditor() != nil, "Return must advance to the next input.")
        checks.append("Native focus shortcuts select all; Tab and Shift-Tab follow pot, stack, facing bet.")

        let testPasteboard = NSPasteboard(name: .init("PokerCalculator.verification.\(UUID().uuidString)"))
        defer { testPasteboard.releaseGlobally() }
        let firstBet = model.evaluation.geometric.value?.twoStreet.firstBet
        model.copy(firstBet, label: "2e first bet", to: testPasteboard)
        try require(
            testPasteboard.string(forType: .string) == firstBet.flatMap(model.format.copyAmount),
            "Copy does not match the one-decimal displayed amount."
        )
        try require(model.feedback?.hasPrefix("Copied") == true, "Copy did not provide feedback.")
        model.copy(0.001, label: "below-resolution amount", to: testPasteboard)
        try require(model.feedbackIsError, "Below-resolution amounts must not be copied as exact numbers.")
        try require(
            testPasteboard.string(forType: .string) == firstBet.flatMap(model.format.copyAmount),
            "Invalid copy changed the pasteboard."
        )
        model.feedback = nil
        checks.append("Explicit copy uses displayed precision and announces feedback; invalid copy is rejected. System clipboard was not accessed.")

        snapshots.append(try await snapshot("default-light", appearance: .aqua, window: window, model: model, destination: destination))
        snapshots.append(try await snapshot("default-dark", appearance: .darkAqua, window: window, model: model, destination: destination))
        try verifyGlanceableSizes(model, compact: false)

        window.setContentSize(NSSize(width: DashboardLayout.minimumWidth, height: DashboardLayout.minimumHeight))
        snapshots.append(try await snapshot("minimum-light", appearance: .aqua, window: window, model: model, destination: destination))
        snapshots.append(try await snapshot("minimum-dark", appearance: .darkAqua, window: window, model: model, destination: destination))
        try verifyGlanceableSizes(model, compact: true)
        snapshots += try await verifyHebrew(model: model, window: window, destination: destination)
        checks.append("Actual Hebrew toggle preserves the hand and numbers, mirrors the dashboard, keeps numeric runs LTR, translates menus/fields/errors/copy feedback, and preserves language through New Hand. Switching back restores English.")
        let anchors = model.measuredFrames

        try enter("1000", into: .pot, model: model)
        try enter("2416", into: .stack, model: model)
        try enter("250", into: .facingBet, model: model)
        snapshots.append(try await snapshot("minimum-thousands", appearance: .aqua, window: window, model: model, destination: destination))
        try verifyGlanceableSizes(model, compact: true, thousands: true)
        try verifyStableFrames(model, anchors: anchors)
        checks.append("Actual fitted fonts: first bets 72/64 pt, later bets 44/38 pt, preflop 56/48 pt at default/minimum. Four-digit amounts stay large; result positions stay fixed as numbers change.")

        try enter("1000000000000", into: .pot, model: model)
        try enter("1000000000000", into: .stack, model: model)
        try enter("1000000000000", into: .facingBet, model: model)
        snapshots.append(try await snapshot("minimum-large-values", appearance: .aqua, window: window, model: model, destination: destination))
        try require(model.evaluation.preflop.value?.count == 4, "Largest supported inputs must remain usable.")
        try verifyStableFrames(model, anchors: anchors)

        let tinyInput = "0\(model.parser.decimalSeparator)001"
        try enter(tinyInput, into: .stack, model: model)
        snapshots.append(try await snapshot("minimum-tiny-spr", appearance: .aqua, window: window, model: model, destination: destination))
        try enter(tinyInput, into: .pot, model: model)
        try enter("1000000000000", into: .stack, model: model)
        snapshots.append(try await snapshot("minimum-large-spr", appearance: .aqua, window: window, model: model, destination: destination))

        try enter("oops", into: .pot, model: model)
        try require(model.evaluation.geometric.value == nil, "Invalid input left stale geometric results.")
        try require(model.evaluation.preflop.value?.count == 4, "Invalid pot incorrectly disabled preflop.")
        snapshots.append(try await snapshot("minimum-invalid", appearance: .aqua, window: window, model: model, destination: destination))
        try verifyStableFrames(model, anchors: anchors)
        try enter("100", into: .pot, model: model)
        try enter("700", into: .stack, model: model)
        try enter("oops", into: .facingBet, model: model)
        try require(model.evaluation.geometric.value?.spr == 7, "Invalid facing bet incorrectly disabled geometric sizing.")
        try require(model.evaluation.preflop.value == nil, "Invalid facing bet left stale multiplier results.")
        checks.append("Largest/tiny inputs remain visible; malformed entries immediately clear only their own calculator.")

        model.hand.isPinned = true
        try await settle(window)
        try require(window.level == .floating, "Pin toggle did not raise the native window level.")
        try command("n", window: window)
        try await settle(window)
        try require(model.hand.pot.isEmpty && model.hand.stack.isEmpty && model.hand.facingBet.isEmpty, "New Hand did not clear every input.")
        try require(model.hand.isPinned && window.level == .floating, "New Hand must preserve the explicit pin choice.")
        try require(model.fields.values.allSatisfy { $0.stringValue.isEmpty }, "Native text fields retained stale input after New Hand.")
        try require(model.evaluation.geometric.value == nil && model.evaluation.preflop.value == nil, "New Hand retained stale results.")
        model.hand.isPinned = false
        try await settle(window)
        try require(window.level == .normal, "Unpin did not restore the native window level.")
        checks.append("Pin changes the actual native window level; New Hand clears all fields/results and preserves pin.")
        snapshots.append(try await snapshot("minimum-empty", appearance: .aqua, window: window, model: model, destination: destination))

        window.setContentSize(NSSize(width: DashboardLayout.defaultWidth, height: DashboardLayout.defaultHeight))
        snapshots.append(try await snapshot("default-empty", appearance: .aqua, window: window, model: model, destination: destination))
        checks.append("All required input, result, reference, and footer frames fit at default and minimum sizes.")
        checks.append("Every native numeric label matches the full calculation, fits without truncation, exposes an accessible value, and has at least 4.5:1 contrast for valid results.")

        let report = Report(
            operatingSystem: ProcessInfo.processInfo.operatingSystemVersionString,
            checks: checks,
            snapshots: snapshots
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(report).write(to: destination.appendingPathComponent("ui-verification.json"), options: .atomic)
        print("UI verification passed: \(checks.count) check groups; \(snapshots.count) app-content captures.")
        print(destination.path)
    }

    private static func enter(_ text: String, into field: InputField, model: DashboardModel) throws {
        model.focus(field)
        guard let editor = model.fields[field]?.currentEditor() as? NSTextView else {
            throw Failure("Could not focus \(field.title).")
        }
        editor.selectAll(nil)
        editor.insertText(text, replacementRange: editor.selectedRange())
    }

    private static func focusedInput(_ model: DashboardModel) -> String {
        InputField.allCases.filter { model.fields[$0]?.currentEditor() != nil }.map(\.rawValue).joined(separator: ", ")
    }

    private static func languageControl(window: NSWindow) throws -> NSSegmentedControl {
        func find(_ view: NSView) -> NSSegmentedControl? {
            if let control = view as? NSSegmentedControl,
               control.segmentCount == 2, control.label(forSegment: 0) == "EN",
               control.label(forSegment: 1) == "עב" {
                return control
            }
            return view.subviews.lazy.compactMap(find).first
        }
        guard let content = window.contentView, let control = find(content) else {
            throw Failure("The header's native EN | עב language toggle is missing.")
        }
        return control
    }

    private static func selectLanguage(_ language: AppLanguage, model: DashboardModel, window: NSWindow) async throws {
        let control = try languageControl(window: window)
        control.selectedSegment = language == .english ? 0 : 1
        try require(control.sendAction(control.action, to: control.target), "The language toggle did not dispatch its action.")
        try await settle(window)
        try require(model.language == language, "The language toggle did not select \(language.rawValue).")
    }

    private static func verifyInputAlignment(model: DashboardModel, window: NSWindow) async throws {
        let original = model.hand
        try enter("67", into: .pot, model: model)
        try enter("45", into: .stack, model: model)
        try enter("3", into: .facingBet, model: model)
        for field in InputField.allCases {
            model.focus(field)
            try await settle(window)
            guard let control = model.fields[field], var editor = control.currentEditor() as? NSTextView else {
                throw Failure("Missing editor for alignment check: \(field.rawValue).")
            }
            let insertion = NSRange(location: (editor.string as NSString).length, length: 0)
            editor.setSelectedRange(insertion)
            let originalText = editor.string
            for selection in [insertion, NSRange(location: 0, length: (originalText as NSString).length)] {
                for language in [AppLanguage.hebrew, .english] {
                    if control.currentEditor() == nil {
                        window.makeFirstResponder(control)
                        guard let resumed = control.currentEditor() as? NSTextView else {
                            throw Failure("Cannot focus \(field.rawValue) for the immediate alignment check.")
                        }
                        editor = resumed
                    }
                    editor.setSelectedRange(selection)
                    let handBeforeSwitch = model.hand
                    model.language = language
                    let alignment: NSTextAlignment = language.isRightToLeft ? .right : .left
                    try require(model.hand == handBeforeSwitch && control.stringValue == originalText, "\(field.rawValue): alignment update changed the entered amount.")
                    try require(control.cell?.alignment == alignment, "\(field.rawValue): alignment was deferred until another UI event.")
                    if let active = control.currentEditor() as? NSTextView {
                        try require(active.string == originalText && active.selectedRange() == selection, "\(field.rawValue): active selection changed.")
                        try require(active.alignment == alignment, "\(field.rawValue): active editor alignment is stale.")
                        let typingStyle = active.typingAttributes[.paragraphStyle] as? NSParagraphStyle
                        try require(typingStyle?.alignment == alignment, "\(field.rawValue): future typing retained the old alignment.")
                    }
                }
            }
            editor.setSelectedRange(insertion)
            for language in [AppLanguage.hebrew, .english] {
                try await selectLanguage(language, model: model, window: window)
                let expected: NSTextAlignment = language.isRightToLeft ? .right : .left
                try require(control.cell?.alignment == expected, "\(field.rawValue): alignment reverted when editing ended.")
                if control.currentEditor() == nil {
                    window.makeFirstResponder(control)
                    guard let resumed = control.currentEditor() as? NSTextView else {
                        throw Failure("Cannot resume \(field.rawValue) after switching language.")
                    }
                    editor = resumed
                    editor.setSelectedRange(insertion)
                    try await settle(window)
                }
                try require(editor.string == originalText, "\(field.rawValue): language switch changed the typed amount.")
                try require(editor.selectedRange() == insertion, "\(field.rawValue): language switch moved the caret.")
                try require(control.alignment == expected, "\(field.rawValue): field alignment did not switch.")
                try require(editor.alignment == expected, "\(field.rawValue): active editor alignment did not switch.")
                let range = NSRange(location: 0, length: (editor.string as NSString).length)
                let onScreen = editor.firstRect(forCharacterRange: range, actualRange: nil)
                let inWindow = window.convertFromScreen(onScreen)
                let glyphs = control.convert(inWindow, from: nil)
                let inset = language.isRightToLeft ? control.bounds.maxX - glyphs.maxX : glyphs.minX - control.bounds.minX
                try require(
                    glyphs.width > 0 && abs(inset) <= 8,
                    "\(field.rawValue) \(language.rawValue): text still paints on the wrong side. Glyphs \(glyphs), field \(control.bounds), inset \(inset)."
                )
            }
        }
        model.hand = original
        model.focus(.pot)
        try await settle(window)
    }

    private static func verifyHebrew(
        model: DashboardModel, window: NSWindow, destination: URL
    ) async throws -> [Snapshot] {
        let originalHand = model.hand
        let originalEvaluation = model.evaluation
        var snapshots: [Snapshot] = []
        try await selectLanguage(.hebrew, model: model, window: window)
        try require(model.hand == originalHand, "Switching to Hebrew changed hand inputs or pinning.")
        try require(model.evaluation.geometric == originalEvaluation.geometric, "Language switch changed geometric arithmetic.")
        try require(model.evaluation.preflop == originalEvaluation.preflop, "Language switch changed preflop arithmetic.")
        for field in InputField.allCases {
            try require(model.fields[field]?.accessibilityLabel() == field.title(in: .hebrew), "Field \(field.rawValue) was not translated.")
            try require(model.fields[field]?.cell?.baseWritingDirection == .leftToRight, "Numeric entry must stay left-to-right.")
        }
        try verifyMenuLanguage(model)
        guard let postflop = model.measuredFrames["postflop-panel"],
              let preflop = model.measuredFrames["preflop-panel"] else {
            throw Failure("Missing Hebrew dashboard panels.")
        }
        try require(postflop.minX > preflop.maxX, "Hebrew dashboard must read from right to left.")
        snapshots.append(try await snapshot("minimum-hebrew-light", appearance: .aqua, window: window, model: model, destination: destination))
        snapshots.append(try await snapshot("minimum-hebrew-dark", appearance: .darkAqua, window: window, model: model, destination: destination))
        try verifyGlanceableSizes(model, compact: true)
        let anchors = model.measuredFrames
        try command("1", window: window)
        try require(model.fields[.pot]?.currentEditor() != nil, "Hebrew Command-1 must focus the pot.")
        try await tab(window: window)
        try require(
            model.fields[.stack]?.currentEditor() != nil,
            "Hebrew Tab must follow pot then stack. Focus: \(focusedInput(model)); active: \(NSApp.isActive); key window: \(window.isKeyWindow)."
        )
        try await tab(window: window)
        try require(model.fields[.facingBet]?.currentEditor() != nil, "Hebrew Tab order must still reach the facing amount.")

        window.setContentSize(NSSize(width: DashboardLayout.defaultWidth, height: DashboardLayout.defaultHeight))
        snapshots.append(try await snapshot("default-hebrew-light", appearance: .aqua, window: window, model: model, destination: destination))
        snapshots.append(try await snapshot("default-hebrew-dark", appearance: .darkAqua, window: window, model: model, destination: destination))
        try verifyGlanceableSizes(model, compact: false)
        window.setContentSize(NSSize(width: DashboardLayout.minimumWidth, height: DashboardLayout.minimumHeight))
        try enter("1000", into: .pot, model: model)
        try enter("2416", into: .stack, model: model)
        try enter("250", into: .facingBet, model: model)
        snapshots.append(try await snapshot("minimum-hebrew-thousands", appearance: .aqua, window: window, model: model, destination: destination))
        try verifyGlanceableSizes(model, compact: true, thousands: true)
        try verifyStableFrames(model, anchors: anchors)

        let pasteboard = NSPasteboard(name: .init("PokerCalculator.hebrew-verification.\(UUID().uuidString)"))
        defer { pasteboard.releaseGlobally() }
        guard let finalBet = model.evaluation.geometric.value?.threeStreet.bets.last,
              let expectedCopy = model.format.copyAmount(finalBet) else {
            throw Failure("Missing Hebrew all-in amount.")
        }
        model.copy(finalBet, label: model.text(.allIn), to: pasteboard)
        try require(pasteboard.string(forType: .string) == expectedCopy, "Hebrew copy must contain only the numeric amount.")
        try require(model.feedback == model.text(.copied(label: model.text(.allIn), amount: expectedCopy)), "Copy feedback was not translated.")
        model.feedback = nil
        try enter("1000000000000", into: .pot, model: model)
        try enter("1000000000000", into: .stack, model: model)
        try enter("1000000000000", into: .facingBet, model: model)
        snapshots.append(try await snapshot("minimum-hebrew-large-values", appearance: .aqua, window: window, model: model, destination: destination))
        let tiny = "0\(model.parser.decimalSeparator)001"
        try enter(tiny, into: .stack, model: model)
        snapshots.append(try await snapshot("minimum-hebrew-tiny-spr", appearance: .aqua, window: window, model: model, destination: destination))
        try enter(tiny, into: .pot, model: model)
        try enter("1000000000000", into: .stack, model: model)
        snapshots.append(try await snapshot("minimum-hebrew-large-spr", appearance: .aqua, window: window, model: model, destination: destination))
        try verifyStableFrames(model, anchors: anchors)
        try enter("0", into: .pot, model: model)
        try require(model.evaluation.geometric.message?.hasPrefix("קופה:") == true, "Pot errors were not translated.")
        snapshots.append(try await snapshot("minimum-hebrew-invalid", appearance: .aqua, window: window, model: model, destination: destination))
        try verifyStableFrames(model, anchors: anchors)
        try enter("100", into: .pot, model: model)
        try enter("oops", into: .facingBet, model: model)
        try require(model.evaluation.preflop.message?.hasPrefix("הימור מולך:") == true, "Facing-bet errors were not translated.")

        model.hand.isPinned = true
        try command("n", window: window)
        try await settle(window)
        try require(model.language == .hebrew && model.hand.isPinned, "New Hand must preserve language and pinning.")
        try require(model.hand.pot.isEmpty && model.hand.stack.isEmpty && model.hand.facingBet.isEmpty, "Hebrew New Hand did not clear the input.")
        try require(model.feedback == model.text(.handCleared), "New Hand feedback was not translated.")
        snapshots.append(try await snapshot("minimum-hebrew-empty", appearance: .aqua, window: window, model: model, destination: destination))

        model.hand = originalHand
        model.feedback = nil
        try await selectLanguage(.english, model: model, window: window)
        try require(model.hand == originalHand && model.evaluation == originalEvaluation, "Switching back to English changed the hand.")
        try require(model.fields[.pot]?.accessibilityLabel() == InputField.pot.title, "English field labels did not return.")
        try require(model.fields[.pot]?.stringValue == originalHand.pot, "Language switching left stale native input.")
        try verifyMenuLanguage(model)
        return snapshots
    }

    private static func verifyMenuLanguage(_ model: DashboardModel) throws {
        let items = menuItems(NSApp.mainMenu)
        for key: AppText in [.newHandMenu, .focusPot, .focusStack, .focusFacingBet, .assumptionsMenu] {
            try require(
                items.contains { $0.title == model.text(key) },
                "Missing translated menu '\(model.text(key))'. Actual titles: \(items.map(\.title).joined(separator: " | "))."
            )
        }
    }

    private static func verifyGlanceableSizes(
        _ model: DashboardModel, compact: Bool, thousands: Bool = false
    ) throws {
        for (id, readout) in model.resultLabels {
            let minimum: CGFloat
            if id.hasPrefix("first-bet") {
                minimum = compact ? 64 : 72
            } else if id.hasPrefix("later-bet") {
                minimum = compact ? 38 : 44
            } else if id.hasPrefix("raise-") {
                minimum = thousands ? 40 : compact ? 48 : 56
            } else if id.hasPrefix("percent-") {
                minimum = compact ? 32 : 36
            } else {
                continue
            }
            try require(
                readout.fittedPointSize >= minimum,
                "\(id): actual digits shrank to \(readout.fittedPointSize) pt; expected at least \(minimum) pt."
            )
        }
    }

    private static func verifyStableFrames(_ model: DashboardModel, anchors: [String: CGRect]) throws {
        for id in model.resultLabels.keys {
            guard let before = anchors[id], let after = model.measuredFrames[id] else {
                throw Failure("Missing stable numeric anchor: \(id).")
            }
            try require(
                abs(before.minX - after.minX) < 1 && abs(before.minY - after.minY) < 1
                    && abs(before.width - after.width) < 1 && abs(before.height - after.height) < 1,
                "\(id) moved while the amount changed, from \(before) to \(after)."
            )
        }
    }

    private static func expectedReadouts(_ model: DashboardModel) -> [String: String] {
        let evaluation = model.evaluation
        let sizing = evaluation.geometric.value
        var values = ["spr-number": sizing.map { model.format.spr($0.spr) } ?? "—"]
        for streets in [2, 3] {
            let plan = streets == 2 ? sizing?.twoStreet : sizing?.threeStreet
            values["percent-\(streets)"] = plan.map { model.format.percent($0.fraction) } ?? "—"
            for number in 1...streets {
                let id = number == 1 ? "first-bet-\(streets)" : "later-bet-\(streets)-\(number)"
                values[id] = plan.map { model.format.amount($0.bets[number - 1]) } ?? "—"
            }
        }
        for kind in RaiseKind.allCases {
            values["raise-\(kind.rawValue)"] = evaluation.preflop.value?
                .first { $0.kind == kind }.map { model.format.amount($0.amount) } ?? "—"
        }
        return values
    }

    private static func command(_ key: String, window: NSWindow) throws {
        guard let event = NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: .command,
            timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
            context: nil, characters: key, charactersIgnoringModifiers: key,
            isARepeat: false, keyCode: 0
        ) else { throw Failure("Could not construct a native shortcut event.") }
        try require(NSApp.mainMenu?.performKeyEquivalent(with: event) == true, "Command-\(key) did not invoke its native menu command.")
    }

    private static func tab(window: NSWindow, backwards: Bool = false) async throws {
        let character = backwards ? "\u{19}" : "\t"
        guard let event = NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: backwards ? .shift : [],
            timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
            context: nil, characters: character, charactersIgnoringModifiers: character,
            isARepeat: false, keyCode: 48
        ) else { throw Failure("Could not construct a native Tab event.") }
        NSApp.postEvent(event, atStart: false)
        try await settle(window)
    }

    private static func snapshot(
        _ name: String, appearance: NSAppearance.Name, window: NSWindow,
        model: DashboardModel, destination: URL
    ) async throws -> Snapshot {
        NSApp.appearance = NSAppearance(named: appearance)
        window.appearance = NSAppearance(named: appearance)
        try await settle(window)
        guard let content = window.contentView else { throw Failure("Window has no content view.") }
        let bounds = content.bounds
        let layout = window.contentLayoutRect
        let expectedWidth = name.hasPrefix("default") ? DashboardLayout.defaultWidth : DashboardLayout.minimumWidth
        let expectedHeight = name.hasPrefix("default") ? DashboardLayout.defaultHeight : DashboardLayout.minimumHeight
        try require(abs(bounds.width - expectedWidth) < 1, "\(name): unexpected window width \(bounds.width).")
        try require(layout.height >= DashboardLayout.minimumHeight, "\(name): dashboard is shorter than its minimum.")
        if name.hasPrefix("minimum") {
            try require(abs(layout.height - expectedHeight) < 1, "\(name): minimum dashboard height is \(layout.height), expected \(expectedHeight).")
        }
        let expected = [
            "header", "language-toggle", "postflop-panel", "preflop-panel", "reference", "footer",
            "input-pot", "input-stack", "input-facingBet", "spr",
            "percent-2", "percent-3", "first-bet-2", "first-bet-3",
            "later-bet-2-2", "later-bet-3-2", "later-bet-3-3",
            "raise-threeBetIP", "raise-threeBetOOP", "raise-fourBetIP", "raise-fourBetOOP",
        ]
        for id in expected {
            guard let frame = model.measuredFrames[id], frame.width > 0, frame.height > 0 else {
                throw Failure("\(name): missing layout frame for \(id).")
            }
            try require(bounds.insetBy(dx: -1, dy: -1).contains(frame), "\(name): \(id) is outside the content bounds: \(frame).")
        }
        for panel in ["postflop-panel", "preflop-panel"] {
            if let frame = model.measuredFrames[panel], let reference = model.measuredFrames["reference"] {
                try require(!frame.intersects(reference), "\(name): calculator panel overlaps the reference.")
            }
        }
        var readouts: [ReadoutMeasurement] = []
        for (id, expectedText) in expectedReadouts(model).sorted(by: { $0.key < $1.key }) {
            guard let view = model.resultLabels[id] else {
                throw Failure("\(name): missing native numeric label \(id).")
            }
            try require(view.stringValue == expectedText, "\(name): \(id) has a stale or incomplete value.")
            try require(view.fittedPointSize >= 12, "\(name): \(id) is too small to read: \(view.fittedPointSize) pt.")
            try require(
                view.renderedTextWidth <= view.availableTextWidth + 0.5,
                "\(name): \(id) clips digits (\(view.renderedTextWidth) > \(view.availableTextWidth))."
            )
            try require(
                view.bounds.height >= ResultNumberLabel.height(for: view.fittedPointSize) - 1,
                "\(name): \(id) clips the height of its digits."
            )
            let accessibleValue = expectedText == "—" ? model.text(.waitingForInput) : expectedText
            try require(view.accessibilityValue() == accessibleValue, "\(name): \(id) lacks its full accessible amount.")
            try require(view.cell?.baseWritingDirection == .leftToRight, "\(name): \(id) must display numeric runs left-to-right.")
            let textContrast = try contrast(
                of: view, appearance: content.effectiveAppearance,
                panelBackground: id.hasPrefix("raise-") || id == "spr-number"
            )
            if expectedText != "—" {
                try require(textContrast >= 4.5, "\(name): \(id) contrast is only \(textContrast):1.")
            }
            readouts.append(ReadoutMeasurement(
                id: id, text: expectedText, pointSize: view.fittedPointSize,
                availableWidth: view.availableTextWidth, textWidth: view.renderedTextWidth,
                contrast: textContrast
            ))
        }
        guard let bitmap = content.bitmapImageRepForCachingDisplay(in: bounds) else {
            throw Failure("Could not allocate a bitmap for this app's content.")
        }
        content.effectiveAppearance.performAsCurrentDrawingAppearance {
            content.cacheDisplay(in: bounds, to: bitmap)
        }
        guard let png = bitmap.representation(using: .png, properties: [:]) else {
            throw Failure("Could not encode the app-content image.")
        }
        let file = destination.appendingPathComponent("\(name).png")
        try png.write(to: file, options: .atomic)
        return Snapshot(
            name: name, language: model.language.rawValue, width: bounds.width, height: bounds.height,
            dashboardHeight: layout.height, appearance: content.effectiveAppearance.name.rawValue,
            image: file.path, measuredViews: expected.count, readouts: readouts
        )
    }

    private static func contrast(of view: ResultNumberLabel, appearance: NSAppearance, panelBackground: Bool) throws -> Double {
        var foreground: NSColor?
        var background: NSColor?
        appearance.performAsCurrentDrawingAppearance {
            foreground = view.textColor?.usingColorSpace(.deviceRGB)
            background = (panelBackground ? NSColor.controlBackgroundColor : NSColor.textBackgroundColor)
                .usingColorSpace(.deviceRGB)
        }
        guard let foreground, let background else { throw Failure("Could not resolve result colors.") }
        func luminance(_ color: NSColor) -> Double {
            func linear(_ value: Double) -> Double {
                value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * linear(color.redComponent)
                + 0.7152 * linear(color.greenComponent) + 0.0722 * linear(color.blueComponent)
        }
        let alpha = foreground.alphaComponent
        let composited = NSColor(
            srgbRed: foreground.redComponent * alpha + background.redComponent * (1 - alpha),
            green: foreground.greenComponent * alpha + background.greenComponent * (1 - alpha),
            blue: foreground.blueComponent * alpha + background.blueComponent * (1 - alpha), alpha: 1
        )
        let a = luminance(composited)
        let b = luminance(background)
        return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }

    private static func settle(_ window: NSWindow) async throws {
        try await Task.sleep(for: .milliseconds(200))
        window.contentView?.layoutSubtreeIfNeeded()
        window.displayIfNeeded()
    }

    private static func menuItems(_ menu: NSMenu?) -> [NSMenuItem] {
        guard let menu else { return [] }
        // SwiftUI populates submenu labels lazily when AppKit asks to open them.
        menu.delegate?.menuNeedsUpdate?(menu)
        menu.update()
        return menu.items.flatMap { [$0] + menuItems($0.submenu) }
    }

    private static func require(_ condition: Bool, _ message: String) throws {
        if !condition { throw Failure(message) }
    }

    private static func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data("\(message)\n".utf8))
        exit(1)
    }

    private struct Failure: LocalizedError {
        let message: String
        init(_ message: String) { self.message = message }
        var errorDescription: String? { message }
    }

    private struct Report: Encodable {
        let operatingSystem: String
        let checks: [String]
        let snapshots: [Snapshot]
    }

    private struct Snapshot: Encodable {
        let name: String
        let language: String
        let width: CGFloat
        let height: CGFloat
        let dashboardHeight: CGFloat
        let appearance: String
        let image: String
        let measuredViews: Int
        let readouts: [ReadoutMeasurement]
    }

    private struct ReadoutMeasurement: Encodable {
        let id: String
        let text: String
        let pointSize: CGFloat
        let availableWidth: CGFloat
        let textWidth: CGFloat
        let contrast: Double
    }
}
