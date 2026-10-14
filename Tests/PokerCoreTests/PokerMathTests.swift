import Foundation
import XCTest
@testable import PokerCore

final class PokerMathTests: XCTestCase {
    func testReferenceFractions() throws {
        // Independently calculated with 70-digit decimal logarithms/exponentials.
        let references: [(Double, Double, Double)] = [
            (2, 0.6180339887498948482, 0.3549879733383484947),
            (3, 0.8228756555322952953, 0.4564655913861945506),
            (4, 1, 0.5400419115259520573),
            (7, 1.4364916731037084426, 0.7331060371652350507),
            (10, 1.7912878474779200033, 0.8794620881905603347),
            (13, 2.0980762113533159403, 1),
            (30, 3.4051248379533271971, 1.4682485915510865979),
        ]

        for (spr, two, three) in references {
            assertRelativeEqual(try PokerMath.fraction(spr: spr, streets: 2), two)
            assertRelativeEqual(try PokerMath.fraction(spr: spr, streets: 3), three)
        }
    }

    func testUnroundedRatioFractionAndFirstBets() throws {
        let pot = 123.45
        let stack = 987.65
        let result = try PokerMath.geometric(pot: pot, effectiveStack: stack)

        XCTAssertEqual(result.spr, stack / pot)
        XCTAssertEqual(result.twoStreet.streets, 2)
        XCTAssertEqual(result.threeStreet.streets, 3)
        assertRelativeEqual(result.twoStreet.fraction, 1.5616019283892107856)
        assertRelativeEqual(result.threeStreet.fraction, 0.7856612151287626191)
        assertRelativeEqual(result.twoStreet.firstBet, 192.77975805964807148)
        assertRelativeEqual(result.threeStreet.firstBet, 96.989877007645745333)

        for sizing in [result.twoStreet, result.threeStreet] {
            XCTAssertEqual(sizing.firstBet, pot * sizing.fraction)
            let roundedSPR = (result.spr * 100).rounded() / 100
            let legacyBet = try pot * PokerMath.fraction(spr: roundedSPR, streets: sizing.streets)
            XCTAssertGreaterThan(abs(sizing.firstBet - legacyBet), 0.001)
            XCTAssertNotEqual(sizing.firstBet, pot * ((sizing.fraction * 100).rounded() / 100))
        }
    }

    func testOneMatchingCallerExhaustsStack() throws {
        let hands: [(Double, Double)] = [
            (1, 2), (1, 3), (1, 4), (1, 7), (1, 10), (1, 13), (1, 30),
            (123.45, 987.65), (0.001, 1_000_000_000_000),
            (1_000_000_000_000, 0.001), (1e-100, 7e-100), (1e100, 7e100),
        ]
        for (pot, stack) in hands {
            let result = try PokerMath.geometric(pot: pot, effectiveStack: stack)
            for sizing in [result.twoStreet, result.threeStreet] {
                var currentPot = pot
                var remaining = stack
                let tolerance = stack * 2e-13
                for street in 0..<sizing.streets {
                    let bet = currentPot * sizing.fraction
                    XCTAssertTrue(bet.isFinite)
                    XCTAssertGreaterThan(bet, 0)
                    XCTAssertLessThanOrEqual(bet, remaining + tolerance)
                    if street == 0 { XCTAssertEqual(bet, sizing.firstBet) }
                    remaining -= bet
                    currentPot += 2 * bet
                }
                XCTAssertEqual(remaining, 0, accuracy: tolerance)
                assertRelativeEqual(currentPot, pot + 2 * stack)
            }
        }
    }

    func testFortyPercentThreeStreetPathToAllIn() throws {
        let plan = try PokerMath.geometric(pot: 100, effectiveStack: 241.6).threeStreet
        assertRelativeEqual(plan.fraction, 0.4)
        XCTAssertEqual(plan.bets.count, 3)
        for (actual, expected) in zip(plan.bets, [40.0, 72.0, 129.6]) {
            assertRelativeEqual(actual, expected)
        }
        XCTAssertEqual(plan.bets.map(PokerFormat().amount), ["40.0", "72.0", "129.6"])
        XCTAssertEqual(plan.bets.reduce(0, +), 241.6, accuracy: 1e-12)
    }

    func testEveryPathShowsIndividualBetsAndEndsAllIn() throws {
        for spr in [0.0001, 0.25, 2, 3, 4, 7, 10, 13, 30, 1000] {
            let pot = 123.45
            let stack = pot * spr
            let sizing = try PokerMath.geometric(pot: pot, effectiveStack: stack)
            for plan in [sizing.twoStreet, sizing.threeStreet] {
                XCTAssertEqual(plan.bets.count, plan.streets)
                XCTAssertEqual(plan.bets.first, plan.firstBet)
                var currentPot = pot
                var remaining = stack
                for bet in plan.bets {
                    assertRelativeEqual(bet, currentPot * plan.fraction, tolerance: 1e-12)
                    XCTAssertLessThanOrEqual(bet, remaining)
                    remaining -= bet
                    currentPot += 2 * bet
                }
                XCTAssertEqual(remaining, 0)
                assertRelativeEqual(plan.bets.reduce(0, +), stack)
            }
        }
    }

    func testAllInSequencePreservesUnroundedIntermediateBets() throws {
        let plan = try PokerMath.geometric(pot: 123.45, effectiveStack: 987.65).threeStreet
        XCTAssertEqual(plan.bets[0], plan.firstBet)
        XCTAssertEqual(plan.bets[1], plan.firstBet * (1 + 2 * plan.fraction))
        XCTAssertEqual(plan.bets[2], (987.65 - plan.bets[0]) - plan.bets[1])
        let roundedFirst = (plan.bets[0] * 10).rounded() / 10
        XCTAssertNotEqual(plan.bets[1], (123.45 + 2 * roundedFirst) * plan.fraction)
    }

    func testBetPathAvoidsIntermediatePotOverflow() throws {
        for (pot, stack) in [
            (Double.greatestFiniteMagnitude, Double.greatestFiniteMagnitude),
            (1, Double.greatestFiniteMagnitude),
            (Double.greatestFiniteMagnitude, 1),
            (Double.leastNormalMagnitude, Double.leastNormalMagnitude),
            (0.001, 1e12), (1e12, 0.001),
        ] {
            let sizing = try PokerMath.geometric(pot: pot, effectiveStack: stack)
            for plan in [sizing.twoStreet, sizing.threeStreet] {
                XCTAssertEqual(plan.bets.count, plan.streets)
                var remaining = stack
                for bet in plan.bets {
                    XCTAssertTrue(bet.isFinite)
                    XCTAssertGreaterThan(bet, 0)
                    XCTAssertLessThanOrEqual(bet, remaining)
                    remaining -= bet
                }
                XCTAssertEqual(remaining, 0)
                assertRelativeEqual(plan.bets.reduce(0) { $0 + $1 / stack }, 1, tolerance: 1e-12)
            }
        }
    }

    func testScalingPotAndStackPreservesFractions() throws {
        let base = try PokerMath.geometric(pot: 17.25, effectiveStack: 123.456)
        for scale in [1e-120, 0.000001, 0.125, 1, 1_000, 1e120] {
            let scaled = try PokerMath.geometric(
                pot: 17.25 * scale,
                effectiveStack: 123.456 * scale
            )
            assertRelativeEqual(scaled.spr, base.spr)
            assertRelativeEqual(scaled.twoStreet.fraction, base.twoStreet.fraction)
            assertRelativeEqual(scaled.threeStreet.fraction, base.threeStreet.fraction)
            assertRelativeEqual(scaled.twoStreet.firstBet, base.twoStreet.firstBet * scale)
            assertRelativeEqual(scaled.threeStreet.firstBet, base.threeStreet.firstBet * scale)
        }
    }

    func testFractionIncreasesWithSPRAndDecreasesWithStreetCount() throws {
        var previousTwo = 0.0
        var previousThree = 0.0
        for spr in [1e-15, 0.01, 0.1, 1, 2, 3, 4, 7, 10, 13, 30, 1e15] {
            let two = try PokerMath.fraction(spr: spr, streets: 2)
            let three = try PokerMath.fraction(spr: spr, streets: 3)
            XCTAssertGreaterThan(two, previousTwo)
            XCTAssertGreaterThan(three, previousThree)
            XCTAssertGreaterThan(two, three)
            previousTwo = two
            previousThree = three
        }
    }

    func testPreflopMappingsAndLabels() throws {
        let expected: [(RaiseKind, String, String, Double, String)] = [
            (.fourBetIP, "4-bet", "In position", 2.4, "2.4x"),
            (.fourBetOOP, "4-bet", "Out of position", 2.6, "2.6x"),
            (.threeBetIP, "3-bet", "In position", 3, "3x"),
            (.threeBetOOP, "3-bet", "Out of position", 4, "4x"),
        ]
        let result = try PokerMath.preflop(facingBet: 10)
        XCTAssertEqual(result.map(\.kind), RaiseKind.allCases)
        XCTAssertEqual(result.map(\.amount), [24, 26, 30, 40])
        XCTAssertEqual(Set(RaiseKind.allCases.map(\.id)).count, 4)
        for (kind, title, position, multiplier, label) in expected {
            XCTAssertEqual(kind.id, kind.rawValue)
            XCTAssertEqual(kind.title, title)
            XCTAssertEqual(kind.positionLabel, position)
            XCTAssertEqual(kind.multiplier, multiplier)
            XCTAssertEqual(kind.multiplierLabel, label)
        }
    }

    func testPreflopUsesUnroundedTotalRaiseToAmounts() throws {
        let facingBet = 12.345
        let result = try PokerMath.preflop(facingBet: facingBet)
        for size in result {
            XCTAssertEqual(size.amount, facingBet * size.kind.multiplier)
            XCTAssertNotEqual(size.amount, facingBet + facingBet * size.kind.multiplier)
        }
        assertRelativeEqual(result[0].amount, 29.628)
        assertRelativeEqual(result[1].amount, 32.097)
        assertRelativeEqual(result[2].amount, 37.035)
        assertRelativeEqual(result[3].amount, 49.38)
    }

    func testRejectsNonPositiveAndNonFiniteInputs() {
        for invalid in [0.0, -0.0, -1, -Double.leastNonzeroMagnitude, .infinity, -.infinity, .nan] {
            assertFailure(.invalidAmount("SPR"), try PokerMath.fraction(spr: invalid, streets: 2))
            assertFailure(
                .invalidAmount("pot"),
                try PokerMath.geometric(pot: invalid, effectiveStack: 1)
            )
            assertFailure(
                .invalidAmount("effective stack"),
                try PokerMath.geometric(pot: 1, effectiveStack: invalid)
            )
            assertFailure(.invalidAmount("facing bet"), try PokerMath.preflop(facingBet: invalid))
        }
    }

    func testRejectsNonPositiveStreetCount() {
        for streets in [0, -1, Int.min] {
            assertFailure(.invalidStreetCount, try PokerMath.fraction(spr: 1, streets: streets))
        }
    }

    func testSingleStreetIsTheFullSPR() throws {
        for spr in [Double.leastNonzeroMagnitude, 0.001, 1, 30, .greatestFiniteMagnitude] {
            XCTAssertEqual(try PokerMath.fraction(spr: spr, streets: 1), spr)
        }
        XCTAssertGreaterThan(try PokerMath.fraction(spr: 1, streets: Int.max), 0)
    }

    func testLargeSPRDoesNotOverflowBeforeLogarithm() throws {
        for spr in [
            Double.greatestFiniteMagnitude / 2,
            (Double.greatestFiniteMagnitude / 2).nextUp,
            Double.greatestFiniteMagnitude,
        ] {
            let result = try PokerMath.geometric(pot: 1, effectiveStack: spr)
            XCTAssertEqual(result.spr, spr)
            assertRelativeEqual(
                result.twoStreet.fraction,
                sqrt(spr / 2 + 0.25) - 0.5,
                tolerance: 1e-13
            )
            assertRelativeEqual(
                result.threeStreet.fraction,
                cbrt(spr / 4 + 0.125) - 0.5,
                tolerance: 1e-13
            )
            XCTAssertTrue(result.twoStreet.firstBet.isFinite)
            XCTAssertTrue(result.threeStreet.firstBet.isFinite)
        }
    }

    func testRatioOverflowAndUnderflowAreExplicit() {
        assertFailure(
            .sprOverflow,
            try PokerMath.geometric(
                pot: .leastNonzeroMagnitude,
                effectiveStack: .greatestFiniteMagnitude
            )
        )
        assertFailure(
            .sprUnderflow,
            try PokerMath.geometric(
                pot: .greatestFiniteMagnitude,
                effectiveStack: .leastNonzeroMagnitude
            )
        )
    }

    func testTinySPRDoesNotCancelToZero() throws {
        for spr in [1e-15, 1e-100, 1e-300] {
            for streets in [2, 3] {
                assertRelativeEqual(
                    try PokerMath.fraction(spr: spr, streets: streets),
                    spr / Double(streets)
                )
            }
        }
        let result = try PokerMath.geometric(pot: .greatestFiniteMagnitude, effectiveStack: 1)
        assertRelativeEqual(result.twoStreet.firstBet, 0.5)
        assertRelativeEqual(result.threeStreet.firstBet, 1.0 / 3)
    }

    func testSubnormalFractionsAvoidDoubleRounding() throws {
        let least = Double.leastNonzeroMagnitude
        for spr in [Double.leastNormalMagnitude, least * 6, least * 2] {
            for streets in [2, 3] {
                let result = try PokerMath.fraction(spr: spr, streets: streets)
                XCTAssertTrue(result.isSubnormal)
                XCTAssertGreaterThan(result, 0)
                XCTAssertEqual(result, spr / Double(streets))
            }
        }
        XCTAssertEqual(try PokerMath.fraction(spr: least * 2, streets: 3), least)
    }

    func testFractionUnderflowIsExplicit() {
        for streets in [2, 3] {
            assertFailure(
                .fractionUnderflow,
                try PokerMath.fraction(spr: .leastNonzeroMagnitude, streets: streets)
            )
        }
        assertFailure(
            .fractionUnderflow,
            try PokerMath.fraction(spr: .leastNormalMagnitude, streets: Int.max)
        )
    }

    func testSubnormalFirstBetsRemainPositive() throws {
        let scale = Double.leastNormalMagnitude
        let result = try PokerMath.geometric(pot: scale, effectiveStack: scale)
        for sizing in [result.twoStreet, result.threeStreet] {
            XCTAssertTrue(sizing.firstBet.isSubnormal)
            XCTAssertGreaterThan(sizing.firstBet, 0)
            XCTAssertEqual(sizing.firstBet, scale * sizing.fraction)
            var pot = scale
            var paid = 0.0
            for _ in 0..<sizing.streets {
                let bet = pot * sizing.fraction
                paid += bet
                pot += 2 * bet
            }
            XCTAssertEqual(paid, scale, accuracy: 8 * Double.leastNonzeroMagnitude)
        }
    }

    func testFirstBetUnderflowAndUnsafeSplitsAreExplicit() {
        let least = Double.leastNonzeroMagnitude
        assertFailure(.firstBetUnderflow, try PokerMath.geometric(pot: least, effectiveStack: least))
        assertFailure(
            .firstBetUnderflow,
            try PokerMath.geometric(pot: 3 * least, effectiveStack: 2 * least)
        )
        assertFailure(
            .insufficientPrecision,
            try PokerMath.geometric(pot: 0.6, effectiveStack: least)
        )
    }

    func testCoarselyQuantizedSubnormalResultsAreRejected() {
        let least = Double.leastNonzeroMagnitude
        for (pot, stack) in [(1e223, 1e-100), (2 * least, 4 * least), (least, 6 * least)] {
            assertFailure(
                .insufficientPrecision,
                try PokerMath.geometric(pot: pot, effectiveStack: stack)
            )
        }
    }

    func testPreflopOverflowChecksAllMappings() throws {
        let largestSafe = Double.greatestFiniteMagnitude / 4
        let result = try PokerMath.preflop(facingBet: largestSafe)
        XCTAssertEqual(result.count, 4)
        XCTAssertTrue(result.allSatisfy { $0.amount.isFinite && $0.amount > 0 })
        XCTAssertEqual(result.last?.amount, .greatestFiniteMagnitude)
        assertFailure(.raiseOverflow, try PokerMath.preflop(facingBet: largestSafe.nextUp))
        assertFailure(.raiseOverflow, try PokerMath.preflop(facingBet: .greatestFiniteMagnitude))

        let subnormal = try PokerMath.preflop(facingBet: .leastNonzeroMagnitude)
        XCTAssertTrue(subnormal.allSatisfy { $0.amount.isSubnormal && $0.amount > 0 })
    }

    func testArithmeticIsNotRestrictedToEntryBounds() throws {
        for (pot, stack) in [(0.00001, 0.00002), (1e100, 1e102), (1e300, 8e300)] {
            let result = try PokerMath.geometric(pot: pot, effectiveStack: stack)
            XCTAssertGreaterThan(result.twoStreet.firstBet, 0)
            XCTAssertGreaterThan(result.threeStreet.firstBet, 0)
        }
        XCTAssertEqual(try PokerMath.preflop(facingBet: 1e-100).count, 4)
        XCTAssertEqual(try PokerMath.preflop(facingBet: 1e100).count, 4)
    }

    func testErrorsHaveActionableDescriptions() {
        let errors: [PokerMathError] = [
            .invalidAmount("pot"), .invalidStreetCount, .sprOverflow, .sprUnderflow,
            .fractionOverflow, .fractionUnderflow, .firstBetOverflow,
            .firstBetUnderflow, .insufficientPrecision, .raiseOverflow,
        ]
        for error in errors {
            XCTAssertFalse(error.message.isEmpty)
            XCTAssertEqual(error.errorDescription, error.message)
            XCTAssertEqual(error.localizedDescription, error.message)
        }
        XCTAssertTrue(PokerMathError.invalidAmount("pot").message.contains("greater than 0"))
    }

    private func assertRelativeEqual(
        _ actual: Double,
        _ expected: Double,
        tolerance: Double = 2e-14,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(actual.isFinite, file: file, line: line)
        XCTAssertEqual(
            actual,
            expected,
            accuracy: max(abs(expected) * tolerance, 4 * Double.leastNonzeroMagnitude),
            file: file,
            line: line
        )
    }

    private func assertFailure<T>(
        _ expected: PokerMathError,
        _ expression: @autoclosure () throws -> T,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertThrowsError(try expression(), file: file, line: line) { error in
            XCTAssertEqual(error as? PokerMathError, expected, file: file, line: line)
        }
    }
}
