import Foundation

@main
enum ExportWindowsParity {
    static func main() throws {
        let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let keys: [(String, AppText)] = [
            ("language", .language), ("languageHelp", .languageHelp),
            ("newHand", .newHand), ("newHandMenu", .newHandMenu), ("newHandHelp", .newHandHelp),
            ("keepOnTop", .keepOnTop), ("pinned", .pinned), ("pinHelp", .pinHelp),
            ("on", .on), ("off", .off), ("calculatorMenu", .calculatorMenu),
            ("focusPot", .focusPot), ("focusStack", .focusStack), ("focusFacingBet", .focusFacingBet),
            ("postflop", .postflop), ("preflop", .preflop), ("pathToAllIn", .pathToAllIn),
            ("currentPot", .currentPot), ("effectiveStack", .effectiveStack), ("facingBet", .facingBet),
            ("potHint", .potHint), ("stackHint", .stackHint), ("facingBetHint", .facingBetHint),
            ("sprName", .sprName), ("sprFormula", .sprFormula), ("validPotAndStack", .validPotAndStack),
            ("potEachStreet", .potEachStreet), ("overPot", .overPot), ("betNow", .betNow),
            ("bet2", .bet(2)), ("allIn", .allIn),
            ("waitingForAmounts", .waitingForAmounts), ("overPotNote", .overPotNote),
            ("matchingCallNote", .matchingCallNote), ("roundingNote", .roundingNote),
            ("raiseTo", .raiseTo), ("totalTargets", .totalTargets),
            ("inPosition", .inPosition), ("outOfPosition", .outOfPosition),
            ("sprReference", .sprReference), ("percentOfPot", .percentOfPot),
            ("unitsNote", .unitsNote("{separator}")), ("assumptionsNote", .assumptionsNote),
            ("assumptions", .assumptions), ("assumptionsMenu", .assumptionsMenu),
            ("assumptionsHelp", .assumptionsHelp), ("offline", .offline), ("offlineHelp", .offlineHelp),
            ("assumptionsTitle", .assumptionsTitle),
            ("effectiveStackExplanation", .effectiveStackExplanation),
            ("geometricExplanation", .geometricExplanation), ("planExplanation", .planExplanation),
            ("roundingExplanation", .roundingExplanation), ("inputRules", .inputRules), ("done", .done),
            ("copyHelp", .copyHelp("{label}")), ("copyLabel", .copyLabel("{label}")),
            ("copied", .copied(label: "{label}", amount: "{amount}")),
            ("handCleared", .handCleared), ("noValidAmount", .noValidAmount), ("copyFailed", .copyFailed),
            ("waitingForInput", .waitingForInput), ("finishAmount", .finishAmount),
            ("fieldHelp", .fieldHelp(hint: "{hint}", shortcut: "{shortcut}")),
            ("fieldError", .fieldError("{message}")), ("potError", .potError("{message}")),
            ("stackError", .stackError("{message}")), ("facingBetError", .facingBetError("{message}")),
            ("error", .error), ("outOfRange", .outOfRange), ("formattingFailed", .formattingFailed),
            ("invalidDecimalSeparator", .invalidDecimalSeparator), ("amountTooLong", .amountTooLong(128)),
            ("internalSpaces", .internalSpaces), ("exponentNotation", .exponentNotation),
            ("multipleSeparators", .multipleSeparators("{separator}")),
            ("invalidCharacters", .invalidCharacters("{separator}")), ("positiveAmount", .positiveAmount),
            ("minimumAmount", .minimumAmount("{separator}")), ("maximumAmount", .maximumAmount("1000000000000")),
            ("unrepresentableAmount", .unrepresentableAmount),
            ("unrepresentableTinyAmount", .unrepresentableTinyAmount("{separator}")),
            ("inputRange", .inputRange(separator: "{separator}", maximum: "1000000000000")),
            ("mathInvalidPot", .mathError(.invalidAmount("pot"))),
            ("mathInvalidStack", .mathError(.invalidAmount("effective stack"))),
            ("mathInvalidFacing", .mathError(.invalidAmount("facing bet"))),
            ("mathInvalidSPR", .mathError(.invalidAmount("SPR"))),
            ("mathStreetCount", .mathError(.invalidStreetCount)),
            ("mathSPROverflow", .mathError(.sprOverflow)), ("mathSPRUnderflow", .mathError(.sprUnderflow)),
            ("mathFractionOverflow", .mathError(.fractionOverflow)), ("mathFractionUnderflow", .mathError(.fractionUnderflow)),
            ("mathFirstOverflow", .mathError(.firstBetOverflow)), ("mathFirstUnderflow", .mathError(.firstBetUnderflow)),
            ("mathPrecision", .mathError(.insufficientPrecision)), ("mathRaiseOverflow", .mathError(.raiseOverflow)),
        ]
        var catalog: [String: [String: String]] = [:]
        for language in AppLanguage.allCases {
            var strings: [String: String] = [:]
            func add(_ key: String, _ value: AppText) {
                strings[key] = language.text(value)
                    .replacingOccurrences(of: "Command-", with: "Ctrl+")
                    .replacingOccurrences(of: "Command ", with: "Ctrl+")
                    .replacingOccurrences(of: "⌘⇧", with: "Ctrl+Shift+")
                    .replacingOccurrences(of: "⌘", with: "Ctrl+")
            }
            for (key, value) in keys { add(key, value) }
            for streets in [2, 3] {
                add("streets\(streets)", .streets(streets))
                add("streetPercentage\(streets)", .streetPercentage(streets))
                add("streetPlan\(streets)", .streetPlan(streets))
                add("firstBetLabel\(streets)", .firstBetLabel(streets))
                for number in 1...streets {
                    add("betCopy\(streets)-\(number)", .betCopyLabel(streets: streets, number: number, allIn: number == streets))
                    add("futureBet\(streets)-\(number)", .futureBetLabel(number: number, allIn: number == streets))
                }
            }
            for count in [1, 2] { add("afterCalls\(count)", .afterCalls(count)) }
            for kind in RaiseKind.allCases {
                add("raiseLabel-\(kind.id)", .raiseLabel(kind))
                add("raiseCopy-\(kind.id)", .raiseCopyLabel(kind))
            }
            catalog[language.rawValue] = strings
        }
        try write(catalog, to: root.appendingPathComponent("windows/PokerCalculator.Core/Strings.json"))

        var hands: [[String: Any]] = []
        let amounts = [0.001, 0.05, 0.1, 1, 3, 7, 10, 100, 123.45, 241.6, 987.65, 1_000, 1e6, 1e12]
        for pot in amounts {
            for stack in amounts {
                let result = try PokerMath.geometric(pot: pot, effectiveStack: stack)
                let format = PokerFormat()
                hands.append([
                    "pot": pot, "stack": stack, "spr": result.spr, "sprText": format.spr(result.spr),
                    "plans": [result.twoStreet, result.threeStreet].map { plan in
                        ["streets": plan.streets, "fraction": plan.fraction, "bets": plan.bets,
                         "percent": format.percent(plan.fraction), "amounts": plan.bets.map(format.amount)] as [String: Any]
                    },
                ])
            }
        }
        var inputs: [[String: Any]] = []
        for separator in [".", ","] {
            for text in ["", " ", "+", "-", separator, "0", "-1", "NaN", "inf", "2e3", "1 000", "1,000.5",
                         "2\(separator)5\(separator)5", "0\(separator)0001", "1000000000001", "١٢", "１２",
                         String(repeating: "1", count: 129), "10", "123\(separator)45", "0\(separator)001",
                         "1000000000000", "1000000000000\(separator)00000000001", "0001\(separator)50",
                         "12\(separator)", "\(separator)5"] {
                for language in AppLanguage.allCases {
                    let parsed = AmountParser(decimalSeparator: separator, language: language).parse(text)
                    let status: String = switch parsed {
                    case .empty: "Empty"
                    case .incomplete: "Incomplete"
                    case .invalid: "Invalid"
                    case .valid: "Valid"
                    }
                    inputs.append(["text": text, "separator": separator, "language": language.rawValue,
                                   "status": status, "value": parsed.value as Any? ?? NSNull(),
                                   "message": parsed.message as Any? ?? NSNull()])
                }
            }
        }
        let formats: [[String: Any]] = [0.001, 0.049, 0.05, 0.15, 0.95, 1, 1.04, 1.05, 1.25, 9.95, 12.05,
                                       129.6, 1234.56, 1e12, 1e12 + 0.05, 1e12 + 0.04, 1e15 + 0.5,
                                       4503599627370495.5, 1e20, Double.greatestFiniteMagnitude].map { value in
            let format = PokerFormat()
            return ["value": String(value), "amount": format.amount(value), "spr": format.spr(value),
                    "percent": format.percent(value), "copy": format.copyAmount(value) as Any? ?? NSNull()]
        }
        try write(["hands": hands, "inputs": inputs, "formats": formats],
                  to: root.appendingPathComponent("windows/PokerCalculator.Checks/SwiftParity.json"))
        print("Exported both languages, \(hands.count) hands, \(inputs.count) parser cases and \(formats.count) formatting cases from the current Swift core.")
    }

    private static func write(_ value: Any, to url: URL) throws {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        try data.write(to: url, options: .atomic)
    }
}
