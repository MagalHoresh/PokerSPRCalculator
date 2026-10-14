import XCTest
@testable import PokerCore

final class PokerFormatTests: XCTestCase {
    private let format = PokerFormat()

    func testOrdinaryAmountsHaveOneDecimalAndRoundHalfUp() {
        for (value, text) in [
            (1.0, "1.0"), (1.04, "1.0"), (1.05, "1.1"), (1.25, "1.3"),
            (2.25, "2.3"), (2.35, "2.4"), (9.95, "10.0"), (12.05, "12.1"),
            (1234.56, "1234.6"), (1e12, "1000000000000.0"),
        ] {
            XCTAssertEqual(format.amount(value), text, "\(value)")
            XCTAssertEqual(format.copyAmount(value), text)
        }
    }

    func testSmallAmountsAlsoUseOnlyOneDecimal() {
        for (value, text) in [
            (0.5, "0.5"), (0.05, "0.1"), (0.125, "0.1"),
            (0.1234564, "0.1"), (0.1234565, "0.1"),
            (0.15, "0.2"), (0.95, "1.0"), (0.9999995, "1.0"),
        ] {
            XCTAssertEqual(format.amount(value), text, "\(value)")
            XCTAssertEqual(format.copyAmount(value), text)
        }
    }

    func testAmountsBelowResolutionNeverBecomeNumericZero() {
        for value in [0.049, 0.001, 0.00000049, 1e-50, Double.leastNormalMagnitude, .leastNonzeroMagnitude] {
            XCTAssertEqual(format.amount(value), "<0.1")
            XCTAssertNil(format.copyAmount(value))
        }
    }

    func testClipboardMatchesDisplayedPrecisionRatherThanRawDouble() {
        for value in [192.779758059648, 96.989877007646, 0.123456789] {
            let displayed = format.amount(value)
            XCTAssertEqual(format.copyAmount(value), displayed)
            XCTAssertNotEqual(Double(displayed), value)
        }
    }

    func testSPRRoundingAndPositiveResolutionIndicators() {
        for (value, text) in [
            (1.0, "1"), (1.234, "1.2"), (1.235, "1.2"), (1.25, "1.3"),
            (0.05, "0.1"), (0.049, "<0.1"), (0.000001, "<0.1"),
            (Double.leastNonzeroMagnitude, "<0.1"),
        ] {
            XCTAssertEqual(format.spr(value), text, "\(value)")
        }
    }

    func testPercentPrecisionAndCorrectedReferenceValues() throws {
        XCTAssertEqual(format.percent(try PokerMath.fraction(spr: 7, streets: 3)), "73.3%")
        XCTAssertEqual(format.percent(try PokerMath.fraction(spr: 30, streets: 3)), "146.8%")
        XCTAssertEqual(format.percent(0.5), "50.0%")
        XCTAssertEqual(format.percent(1), "100%")
        XCTAssertEqual(format.percent(1.25), "125%")
        XCTAssertEqual(format.percent(1.001), "100.1%")
        XCTAssertEqual(format.percent(0.9999), "100.0%")
    }

    func testPercentHalfUpRoundingAndResolution() {
        XCTAssertEqual(format.percent(0.0555), "5.6%")
        XCTAssertEqual(format.percent(0.1005), "10.1%")
        XCTAssertEqual(format.percent(0.0005), "0.1%")
        for value in [0.00049, 1e-100, Double.leastNonzeroMagnitude] {
            XCTAssertEqual(format.percent(value), "<0.1%")
        }
    }

    func testConfiguredSeparatorForDisplayAndClipboard() {
        let comma = PokerFormat(decimalSeparator: ",")
        XCTAssertEqual(comma.decimalSeparator, ",")
        XCTAssertEqual(comma.amount(1234.56), "1234,6")
        XCTAssertEqual(comma.copyAmount(1234.56), "1234,6")
        XCTAssertEqual(comma.amount(0.000333333), "<0,1")
        XCTAssertEqual(comma.amount(1e-100), "<0,1")
        XCTAssertNil(comma.copyAmount(1e-100))
        XCTAssertEqual(comma.percent(0.12345), "12,3%")
        XCTAssertEqual(comma.percent(0.00001), "<0,1%")
        XCTAssertEqual(comma.spr(1.235), "1,2")
        XCTAssertEqual(comma.spr(0.00001), "<0,1")
        XCTAssertEqual(comma.amount(1e20), "100000000000000000000,0")
        XCTAssertEqual(
            AmountParser(decimalSeparator: ",").parse(comma.amount(1234.56)),
            .valid(1234.6)
        )
        XCTAssertEqual(PokerFormat(decimalSeparator: "٫").amount(1.25), "1٫3")
    }

    func testInvalidFormattingNeverReturnsNumericSuccess() {
        for value in [0.0, -0.0, -1, -Double.leastNonzeroMagnitude, .infinity, -.infinity, .nan] {
            XCTAssertEqual(format.amount(value), "Out of range")
            XCTAssertNil(format.copyAmount(value))
            XCTAssertEqual(format.percent(value), "Out of range")
            XCTAssertEqual(format.spr(value), "Out of range")
        }
    }

    func testOverflowedPercentageIsNotNumericSuccess() {
        XCTAssertEqual(format.percent(.greatestFiniteMagnitude), "Out of range")
        let largest = Double.greatestFiniteMagnitude / 100
        let displayed = format.percent(largest)
        XCTAssertTrue(displayed.hasSuffix("%"))
        XCTAssertFalse(displayed.contains("e"))
        XCTAssertFalse(displayed.contains("∞"))
    }

    func testLargeValuesAreFullFixedPointIntegers() throws {
        XCTAssertEqual(format.amount(1e20), "100000000000000000000.0")
        XCTAssertEqual(format.spr(1e20), "100000000000000000000")
        XCTAssertEqual(format.percent(1e18), "100000000000000000000%")

        for value in [Double(0x1p52), Double(0x1p53), 1e100, .greatestFiniteMagnitude] {
            let displayed = format.amount(value)
            let copy = try XCTUnwrap(format.copyAmount(value))
            XCTAssertEqual(displayed, copy)
            XCTAssertTrue(displayed.hasSuffix(".0"))
            XCTAssertFalse(displayed.contains("e"))
            XCTAssertFalse(displayed.contains("E"))
            XCTAssertFalse(displayed.contains(","))
            XCTAssertEqual(Double(displayed), value)
            XCTAssertEqual(Double(format.spr(value)), value)
        }
        XCTAssertEqual(format.amount(.greatestFiniteMagnitude).count, 311)
        XCTAssertEqual(format.spr(.greatestFiniteMagnitude).count, 309)
    }

    func testHighMagnitudeFractionalValuesRetainDigits() {
        XCTAssertEqual(format.amount(1_000_000_000_000.05), "1000000000000.1")
        XCTAssertEqual(format.amount(1_000_000_000_000.04), "1000000000000.0")
        XCTAssertEqual(format.amount(1_000_000_000_000_000.5), "1000000000000000.5")
        XCTAssertEqual(format.amount(4_503_599_627_370_495.5), "4503599627370495.5")
    }

    func testEntryBoundsDoNotConstrainFormatting() {
        XCTAssertEqual(format.amount(4e12), "4000000000000.0")
        XCTAssertEqual(format.copyAmount(4e12), "4000000000000.0")
        XCTAssertEqual(format.amount(0.000333), "<0.1")
        XCTAssertNil(format.copyAmount(0.000333))
    }

    func testEveryDisplayedResultHasAtMostOneDecimal() throws {
        for spr in [0.0001, 0.12, 2, 3, 4, 7, 10, 13, 30, 1000] {
            let sizing = try PokerMath.geometric(pot: 100, effectiveStack: 100 * spr)
            let outputs = [
                format.spr(sizing.spr),
                format.percent(sizing.twoStreet.fraction),
                format.percent(sizing.threeStreet.fraction),
            ] + (sizing.twoStreet.bets + sizing.threeStreet.bets).map(format.amount)
                + (try PokerMath.preflop(facingBet: spr)).map { format.amount($0.amount) }
            for text in outputs {
                let numeric = text.replacingOccurrences(of: "%", with: "")
                let decimalPlaces = numeric.split(separator: ".").dropFirst().first?.count ?? 0
                XCTAssertLessThanOrEqual(decimalPlaces, 1, text)
            }
        }
    }

    func testInvalidSeparatorDoesNotFallBackToDot() {
        for separator in ["", "..", "+", "-", "e", "1", " "] {
            let invalid = PokerFormat(decimalSeparator: separator)
            XCTAssertEqual(invalid.decimalSeparator, separator)
            XCTAssertNil(invalid.copyAmount(1))
            XCTAssertTrue(invalid.amount(1).contains("decimal separator"))
            XCTAssertTrue(invalid.spr(1).contains("decimal separator"))
            XCTAssertTrue(invalid.percent(1).contains("decimal separator"))
        }
    }
}
