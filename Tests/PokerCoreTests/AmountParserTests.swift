import XCTest
@testable import PokerCore

final class AmountParserTests: XCTestCase {
    private let parser = AmountParser()

    func testBoundsArePublicAndInclusive() {
        XCTAssertEqual(AmountParser.minimumAmount, 0.001)
        XCTAssertEqual(AmountParser.maximumAmount, 1_000_000_000_000)
        XCTAssertEqual(parser.parse("0.001"), .valid(AmountParser.minimumAmount))
        XCTAssertEqual(parser.parse("1000000000000"), .valid(AmountParser.maximumAmount))
        XCTAssertEqual(parser.parse("1000000000000.000000000000000000"), .valid(1e12))
        XCTAssertEqual(parser.parse("0.001000000000000000000000"), .valid(0.001))
    }

    func testExactDecimalBoundsAreCheckedBeforeDoubleRounding() {
        let tooSmall = "0.000999999999999999999999999999999"
        let tooLarge = "1000000000000.000000000000000000001"
        XCTAssertEqual(Double(tooSmall), AmountParser.minimumAmount)
        XCTAssertEqual(Double(tooLarge), AmountParser.maximumAmount)
        assertInvalid(tooSmall, containing: "at least")
        assertInvalid(tooLarge, containing: "no more than")
        assertInvalid(String(AmountParser.minimumAmount.nextDown))
        assertInvalid(String(AmountParser.maximumAmount.nextUp))
        XCTAssertEqual(
            parser.parse(String(AmountParser.minimumAmount.nextUp)),
            .valid(AmountParser.minimumAmount.nextUp)
        )
        XCTAssertEqual(
            parser.parse(String(AmountParser.maximumAmount.nextDown)),
            .valid(AmountParser.maximumAmount.nextDown)
        )
    }

    func testBlankAndOuterWhitespace() {
        for text in ["", " ", "\t\n\r ", "\u{00A0}\u{2003}"] {
            XCTAssertEqual(parser.parse(text), .empty)
        }
        for text in [" 123.45 ", "\t123.45\n", "\u{00A0}123.45\u{2003}"] {
            XCTAssertEqual(parser.parse(text), .valid(123.45))
        }
    }

    func testTypingIntermediates() {
        for text in [".", "+", "-", " . ", "\t-\n"] {
            XCTAssertEqual(parser.parse(text), .incomplete)
            XCTAssertNil(parser.parse(text).value)
            XCTAssertNil(parser.parse(text).message)
        }
        assertInvalid("+.")
        assertInvalid("-.")
        assertInvalid(",")
    }

    func testLeadingZerosFractionsAndTrailingSeparator() {
        let cases: [(String, Double)] = [
            ("0001", 1), ("0000.001", 0.001), (".001", 0.001),
            (".5", 0.5), ("000012.3400", 12.34), ("1.", 1),
            ("001000000000000.", 1e12), ("000.0100", 0.01),
        ]
        for (text, expected) in cases {
            XCTAssertEqual(parser.parse(text), .valid(expected), text)
        }
    }

    func testZeroHasActionableGreaterThanZeroError() {
        for text in ["0", "00", "0.", ".0", "000.000", " 0 "] {
            assertInvalid(text, containing: "greater than 0")
        }
    }

    func testRejectsOutOfRangeAndUnrepresentableDecimalText() {
        for text in ["0.0009", "0.0000001", "0." + String(repeating: "0", count: 100) + "1"] {
            assertInvalid(text, containing: "at least")
        }
        for text in ["1000000000001", "9999999999999", String(repeating: "9", count: 100)] {
            assertInvalid(text, containing: "no more than")
        }
        for text in ["1e309", "1e-400", "NaN", "nan", "Inf", "infinity", "∞", "-inf", "+infinity"] {
            assertInvalid(text)
        }
    }

    func testRejectsMalformedArithmeticAndSignedValues() {
        for text in [
            "+1", "-1", "-0", "-0.001", "++", "--", "+-", "1e3", "1E3",
            "1e+3", "1e-3", "0x10", "0x1p2", "1/2", "1+2", "2*3", "1..2",
            "1.2.3", "..", "one", "1abc",
        ] {
            assertInvalid(text)
        }
    }

    func testRejectsGroupingAndUnsupportedSeparators() {
        for text in ["1,000", "1,2", "1,234.5", "1'000", "1_000", "1·5", "1٫5", "1;5"] {
            assertInvalid(text)
        }
        XCTAssertEqual(parser.decimalSeparator, ".")
    }

    func testRejectsInternalWhitespaceAndNonASCIIDigits() {
        for text in ["1 0", "1\t0", "1\n0", "1\u{00A0}0", "1\u{2003}0"] {
            assertInvalid(text, containing: "spaces")
        }
        for text in ["١٢", "１２", "१", "1.٢", "−1", "1\u{200B}0", "1\u{0000}0"] {
            assertInvalid(text)
        }
    }

    func testCommaLocaleUsesOnlyTheConfiguredSeparator() {
        let comma = AmountParser(decimalSeparator: ",")
        XCTAssertEqual(comma.decimalSeparator, ",")
        for (text, value) in [
            ("0,001", 0.001), (",5", 0.5), ("1,234", 1.234),
            ("1234,5", 1234.5), ("1,", 1), (" 0002,50 ", 2.5),
            ("1000000000000,0", 1e12),
        ] {
            XCTAssertEqual(comma.parse(text), .valid(value))
        }
        XCTAssertEqual(comma.parse(","), .incomplete)
        for text in [".", "1.5", "1.000", "1.234,5", "1,234,567", "1 234,5", "1٫5"] {
            assertInvalid(text, parser: comma)
        }
        assertInvalid("0,000999999999999999999999999", parser: comma, containing: "0,001")
        assertInvalid("1000000000000,0000000000001", parser: comma, containing: "no more than")
    }

    func testOtherExplicitSeparatorsAndInvalidConfigurations() {
        let arabicSeparator = AmountParser(decimalSeparator: "٫")
        XCTAssertEqual(arabicSeparator.parse("1٫25"), .valid(1.25))
        XCTAssertEqual(arabicSeparator.parse("٫"), .incomplete)
        assertInvalid("١٫٢٥", parser: arabicSeparator)
        assertInvalid("1.25", parser: arabicSeparator)
        assertInvalid("1,25", parser: arabicSeparator)

        for separator in ["", "..", "+", "-", "1", "e", " ", "\n", "١"] {
            let invalid = AmountParser(decimalSeparator: separator)
            XCTAssertEqual(invalid.decimalSeparator, separator)
            assertInvalid("123", parser: invalid, containing: "decimal separator")
        }
    }

    func testExplicitInputLengthBound() {
        let limit = AmountParser.maximumInputLength
        XCTAssertEqual(parser.parse(String(repeating: "0", count: limit - 1) + "1"), .valid(1))
        assertInvalid(String(repeating: "0", count: limit) + "1", containing: "too long")
        assertInvalid(String(repeating: "9", count: 10_000), containing: "too long")
        assertInvalid(String(repeating: " ", count: limit) + "1", containing: "too long")
        assertInvalid("1" + String(repeating: "\u{0301}", count: limit), containing: "too long")
    }

    func testAccessorsForEveryState() {
        for input in [AmountInput.empty, .incomplete, .invalid("Fix it")] {
            XCTAssertNil(input.value)
        }
        XCTAssertNil(AmountInput.empty.message)
        XCTAssertNil(AmountInput.incomplete.message)
        XCTAssertEqual(AmountInput.invalid("Fix it").message, "Fix it")
        XCTAssertEqual(AmountInput.valid(12.345).value, 12.345)
        XCTAssertNil(AmountInput.valid(12.345).message)
    }

    func testParsingDoesNotPrematurelyRound() {
        XCTAssertEqual(parser.parse("123.456789012345"), .valid(123.456789012345))
        XCTAssertEqual(parser.parse("0.00123456789012345"), .valid(0.00123456789012345))
    }

    private func assertInvalid(
        _ text: String,
        parser: AmountParser = AmountParser(),
        containing substring: String? = nil,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let result = parser.parse(text)
        guard case .invalid(let message) = result else {
            XCTFail("Expected invalid input for \(text.debugDescription), got \(result)", file: file, line: line)
            return
        }
        XCTAssertNil(result.value, file: file, line: line)
        XCTAssertFalse(message.isEmpty, file: file, line: line)
        if let substring {
            XCTAssertTrue(message.contains(substring), message, file: file, line: line)
        }
    }
}
