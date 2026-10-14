import XCTest
@testable import PokerCore

final class AppLanguageTests: XCTestCase {
    func testEnglishIsTheExplicitDefault() {
        XCTAssertEqual(AmountParser().language, .english)
        XCTAssertEqual(PokerFormat().language, .english)
        XCTAssertEqual(AppLanguage.allCases, [.english, .hebrew])
        XCTAssertEqual(AppLanguage.allCases.map(\.segmentTitle), ["EN", "עב"])
        XCTAssertFalse(AppLanguage.english.isRightToLeft)
        XCTAssertTrue(AppLanguage.hebrew.isRightToLeft)
        XCTAssertEqual(AppLanguage.hebrew.nativeName, "עברית")
    }

    func testHebrewPokerTermsKeepTheirActualMeaning() {
        let he = AppLanguage.hebrew
        XCTAssertEqual(he.text(.currentPot), "הקופה הנוכחית")
        XCTAssertEqual(he.text(.effectiveStack), "סטאק אפקטיבי")
        XCTAssertEqual(he.text(.preflop), "פרה-פלופ")
        XCTAssertEqual(he.text(.postflop), "פוסט-פלופ")
        XCTAssertEqual(he.text(.facingBet), "הימור / העלאה מולך")
        XCTAssertEqual(he.text(.betNow), "הימור כעת")
        XCTAssertEqual(he.text(.allIn), "אול-אין")
        XCTAssertEqual(he.text(.streets(3)), "3 סבבים")
        XCTAssertEqual(he.text(.afterCalls(2)), "אחרי השוואה 2")
        XCTAssertTrue(he.text(.totalTargets).contains("לא צ׳יפים להוספה"))
        XCTAssertTrue(he.text(.geometricExplanation).contains("כולל הסבב הנוכחי"))
        XCTAssertTrue(he.text(.planExplanation).contains("כולל מה שכבר הוכנס"))
    }

    func testPositionLabelsAndRaiseCodesRemainCorrect() {
        for kind in [RaiseKind.threeBetIP, .fourBetIP] {
            XCTAssertEqual(kind.positionLabel(in: .hebrew), "עם עמדה")
            XCTAssertEqual(kind.positionLabel(in: .english), "In position")
        }
        for kind in [RaiseKind.threeBetOOP, .fourBetOOP] {
            XCTAssertEqual(kind.positionLabel(in: .hebrew), "בלי עמדה")
            XCTAssertEqual(kind.positionLabel(in: .english), "Out of position")
        }
        for kind in RaiseKind.allCases {
            XCTAssertTrue(AppLanguage.hebrew.text(.raiseLabel(kind)).contains(kind.title))
            XCTAssertTrue(AppLanguage.hebrew.text(.raiseCopyLabel(kind)).contains(kind.title))
        }
    }

    func testInterfaceCopyIsPresentInBothLanguages() {
        let keys: [AppText] = [
            .language, .languageHelp, .newHand, .newHandMenu, .newHandHelp,
            .keepOnTop, .pinned, .pinHelp, .on, .off, .calculatorMenu,
            .focusPot, .focusStack, .focusFacingBet, .postflop, .preflop, .pathToAllIn,
            .currentPot, .effectiveStack, .facingBet, .potHint, .stackHint, .facingBetHint,
            .sprName, .sprFormula, .validPotAndStack, .streets(3), .streetPercentage(3),
            .streetPlan(3), .potEachStreet, .overPot, .betNow, .bet(2), .allIn,
            .afterCalls(1), .afterCalls(2), .firstBetLabel(3),
            .betCopyLabel(streets: 3, number: 3, allIn: true),
            .futureBetLabel(number: 3, allIn: true), .waitingForAmounts, .overPotNote,
            .matchingCallNote, .roundingNote, .raiseTo, .totalTargets, .inPosition,
            .outOfPosition, .raiseLabel(.threeBetIP), .raiseCopyLabel(.fourBetOOP),
            .sprReference, .percentOfPot, .referenceLabel(spr: 7, streets: 3, percent: "73.3%"),
            .unitsNote("."), .assumptionsNote, .assumptions, .assumptionsMenu,
            .assumptionsHelp, .offline, .offlineHelp, .assumptionsTitle,
            .effectiveStackExplanation, .geometricExplanation, .planExplanation,
            .roundingExplanation, .inputRules, .done, .copyHelp("3e"), .copyLabel("3e"),
            .copied(label: "3e", amount: "129.6"), .handCleared, .noValidAmount,
            .copyFailed, .waitingForInput, .finishAmount, .fieldHelp(hint: "", shortcut: "1"),
            .fieldError("!"), .potError("!"), .stackError("!"), .facingBetError("!"),
            .error, .outOfRange, .formattingFailed, .invalidDecimalSeparator,
            .amountTooLong(128), .internalSpaces, .exponentNotation,
            .multipleSeparators("."), .invalidCharacters("."), .positiveAmount,
            .minimumAmount("."), .maximumAmount("1000000000000"), .unrepresentableAmount,
            .unrepresentableTinyAmount("."), .inputRange(separator: ".", maximum: "1000000000000"),
        ]
        for key in keys {
            let english = AppLanguage.english.text(key)
            let hebrew = AppLanguage.hebrew.text(key)
            XCTAssertFalse(english.isEmpty)
            XCTAssertTrue(containsHebrew(hebrew), hebrew)
            XCTAssertNotEqual(english, hebrew)
            XCTAssertEqual(
                hebrew.unicodeScalars.filter { $0.value == 0x2066 }.count,
                hebrew.unicodeScalars.filter { $0.value == 0x2069 }.count,
                "Unbalanced directional isolates: \(hebrew)"
            )
        }
    }

    func testInputValidationChangesLanguageNotParsing() {
        for separator in [".", ","] {
            let en = AmountParser(decimalSeparator: separator)
            let he = AmountParser(decimalSeparator: separator, language: .hebrew)
            for input in [
                "", " ", "+", "-", separator, "0", "-1", "NaN", "inf", "2e3", "1 000",
                "2\(separator)5\(separator)5", "0\(separator)0001", "1000000000001",
                String(repeating: "1", count: 129), "10", "123\(separator)45",
                "0\(separator)001", "1000000000000",
            ] {
                let english = en.parse(input)
                let hebrew = he.parse(input)
                if case .invalid(let message) = english {
                    guard case .invalid(let translation) = hebrew else {
                        return XCTFail("Hebrew unexpectedly accepted \(input)")
                    }
                    XCTAssertTrue(containsHebrew(translation))
                    XCTAssertNotEqual(translation, message)
                } else {
                    XCTAssertEqual(english, hebrew, input)
                }
            }
        }
        XCTAssertNil(AmountParser(language: .hebrew).parse("1,5").value)
        XCTAssertEqual(AmountParser(decimalSeparator: ",", language: .hebrew).parse("1,5"), .valid(1.5))
    }

    func testNumericDisplayAndClipboardAreLanguageIndependent() {
        for separator in [".", ","] {
            let en = PokerFormat(decimalSeparator: separator)
            let he = PokerFormat(decimalSeparator: separator, language: .hebrew)
            for amount in [0.001, 0.05, 0.15, 40, 72, 129.6, 1234.56, 1e12] {
                XCTAssertEqual(he.amount(amount), en.amount(amount))
                XCTAssertEqual(he.copyAmount(amount), en.copyAmount(amount))
                XCTAssertEqual(he.spr(amount), en.spr(amount))
                XCTAssertEqual(he.percent(amount), en.percent(amount))
                XCTAssertFalse(he.amount(amount).unicodeScalars.contains { (0x2066...0x2069).contains($0.value) })
            }
            XCTAssertEqual(he.copyAmount(129.6), "129\(separator)6")
            XCTAssertNil(he.copyAmount(0.001))
        }
    }

    func testFormattingErrorsAreTranslatedAndNotCopyable() {
        let he = PokerFormat(language: .hebrew)
        for invalid in [0.0, -1, .nan, .infinity] {
            XCTAssertEqual(he.amount(invalid), "מחוץ לטווח")
            XCTAssertEqual(he.percent(invalid), "מחוץ לטווח")
            XCTAssertEqual(he.spr(invalid), "מחוץ לטווח")
            XCTAssertNil(he.copyAmount(invalid))
        }
        let badSeparator = PokerFormat(decimalSeparator: "..", language: .hebrew)
        XCTAssertTrue(containsHebrew(badSeparator.amount(1)))
        XCTAssertNil(badSeparator.copyAmount(1))
    }

    func testHandEvaluationKeepsIndependentCalculatorsInHebrew() {
        var hand = HandState()
        hand.pot = "100"
        hand.stack = "241.6"
        hand.facingBet = "3"
        let english = HandEvaluation(hand: hand, parser: AmountParser())
        let hebrew = HandEvaluation(hand: hand, parser: AmountParser(language: .hebrew))
        XCTAssertEqual(english.geometric, hebrew.geometric)
        XCTAssertEqual(english.preflop, hebrew.preflop)
        XCTAssertEqual(hebrew.geometric.value?.threeStreet.bets.map(PokerFormat().amount), ["40.0", "72.0", "129.6"])

        hand.pot = "oops"
        let invalidPot = HandEvaluation(hand: hand, parser: AmountParser(language: .hebrew))
        XCTAssertNil(invalidPot.geometric.value)
        XCTAssertTrue(invalidPot.geometric.message?.hasPrefix("קופה:") == true)
        XCTAssertEqual(invalidPot.preflop, english.preflop)
        hand.pot = "100"
        hand.stack = "0"
        XCTAssertTrue(HandEvaluation(hand: hand, parser: AmountParser(language: .hebrew)).geometric.message?.hasPrefix("סטאק אפקטיבי:") == true)
        hand.stack = "241.6"
        hand.facingBet = "oops"
        let invalidRaise = HandEvaluation(hand: hand, parser: AmountParser(language: .hebrew))
        XCTAssertEqual(invalidRaise.geometric, english.geometric)
        XCTAssertNil(invalidRaise.preflop.value)
        XCTAssertTrue(invalidRaise.preflop.message?.hasPrefix("הימור מולך:") == true)
    }

    func testEveryMathFailureHasHebrewWithoutChangingEnglish() {
        let errors: [PokerMathError] = [
            .invalidAmount("pot"), .invalidAmount("effective stack"),
            .invalidAmount("facing bet"), .invalidAmount("SPR"),
            .invalidStreetCount, .sprOverflow, .sprUnderflow, .fractionOverflow,
            .fractionUnderflow, .firstBetOverflow, .firstBetUnderflow,
            .insufficientPrecision, .raiseOverflow,
        ]
        for error in errors {
            XCTAssertEqual(error.message, error.message(in: .english))
            XCTAssertTrue(containsHebrew(error.message(in: .hebrew)))
            XCTAssertNotEqual(error.message, error.message(in: .hebrew))
            let result = LiveResult<Double>(language: .hebrew, catching: { () throws(PokerMathError) in throw error })
            XCTAssertEqual(result.message, error.message(in: .hebrew))
            XCTAssertNil(result.value)
        }
    }

    func testLatinTokensAreIsolatedOnlyInsideHebrewProse() {
        XCTAssertEqual(AppLanguage.english.numericToken("3e"), "3e")
        XCTAssertEqual(AppLanguage.hebrew.numericToken("3e"), "\u{2066}3e\u{2069}")
        XCTAssertTrue(AppLanguage.hebrew.text(.copied(label: "אול-אין", amount: "129.6")).contains("\u{2066}129.6\u{2069}"))
        XCTAssertEqual(PokerFormat(language: .hebrew).copyAmount(129.6), "129.6")
    }

    private func containsHebrew(_ text: String) -> Bool {
        text.unicodeScalars.contains { (0x05D0...0x05EA).contains($0.value) }
    }
}
