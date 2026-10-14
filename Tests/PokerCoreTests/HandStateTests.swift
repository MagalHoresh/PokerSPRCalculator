import XCTest
@testable import PokerCore

final class HandStateTests: XCTestCase {
    func testInitialHandAndWaitingEvaluation() {
        let hand = HandState()
        XCTAssertEqual(hand.pot, "")
        XCTAssertEqual(hand.stack, "")
        XCTAssertEqual(hand.facingBet, "")
        XCTAssertFalse(hand.isPinned)
        let evaluation = HandEvaluation(hand: hand, parser: AmountParser())
        XCTAssertEqual(evaluation.potInput, .empty)
        XCTAssertEqual(evaluation.stackInput, .empty)
        XCTAssertEqual(evaluation.facingBetInput, .empty)
        XCTAssertEqual(evaluation.geometric, .waiting)
        XCTAssertEqual(evaluation.preflop, .waiting)
    }

    func testValidInputsProduceIndependentReadyResults() throws {
        let hand = makeHand(pot: "100", stack: "700", facingBet: "20")
        let evaluation = HandEvaluation(hand: hand, parser: AmountParser())
        XCTAssertEqual(evaluation.potInput, .valid(100))
        XCTAssertEqual(evaluation.stackInput, .valid(700))
        XCTAssertEqual(evaluation.facingBetInput, .valid(20))
        XCTAssertEqual(evaluation.geometric, .ready(try PokerMath.geometric(pot: 100, effectiveStack: 700)))
        XCTAssertEqual(evaluation.preflop, .ready(try PokerMath.preflop(facingBet: 20)))
        XCTAssertNil(evaluation.geometric.message)
        XCTAssertNil(evaluation.preflop.message)
    }

    func testPreflopRemainsValidWithInvalidGeometricInputs() throws {
        let expected = try PokerMath.preflop(facingBet: 10)
        for (pot, stack) in [("0", "10"), ("1", "bad"), ("bad", ""), ("", "0"), ("1e3", ".")] {
            let evaluation = HandEvaluation(
                hand: makeHand(pot: pot, stack: stack, facingBet: "10"),
                parser: AmountParser()
            )
            XCTAssertNil(evaluation.geometric.value)
            XCTAssertNotNil(evaluation.geometric.message)
            XCTAssertEqual(evaluation.preflop, .ready(expected))
        }
    }

    func testGeometricRemainsValidWithInvalidPreflopInputs() throws {
        let expected = try PokerMath.geometric(pot: 100, effectiveStack: 700)
        for facingBet in ["0", "-2", "bad", "1,000", "1e3"] {
            let evaluation = HandEvaluation(
                hand: makeHand(pot: "100", stack: "700", facingBet: facingBet),
                parser: AmountParser()
            )
            XCTAssertEqual(evaluation.geometric, .ready(expected))
            XCTAssertNil(evaluation.preflop.value)
            XCTAssertNotNil(evaluation.preflop.message)
        }
    }

    func testPreflopMappingsDoNotDependOnSPR() throws {
        let expected = try PokerMath.preflop(facingBet: 10)
        for stack in ["0.001", "1", "7", "13", "30", "1000000000000"] {
            let evaluation = HandEvaluation(
                hand: makeHand(pot: "1", stack: stack, facingBet: "10"),
                parser: AmountParser()
            )
            XCTAssertNotNil(evaluation.geometric.value)
            XCTAssertEqual(evaluation.preflop, .ready(expected))
        }
    }

    func testIntermediateAndEmptyInputsWaitWithoutBlockingOtherGroup() {
        for partial in ["", ".", "-", "+"] {
            let missingGeometry = HandEvaluation(
                hand: makeHand(pot: partial, stack: "700", facingBet: "10"),
                parser: AmountParser()
            )
            XCTAssertEqual(missingGeometry.geometric, .waiting)
            XCTAssertNotNil(missingGeometry.preflop.value)

            let missingPreflop = HandEvaluation(
                hand: makeHand(pot: "100", stack: "700", facingBet: partial),
                parser: AmountParser()
            )
            XCTAssertNotNil(missingPreflop.geometric.value)
            XCTAssertEqual(missingPreflop.preflop, .waiting)
        }
    }

    func testInvalidFieldsNeverRetainStaleResults() {
        var hand = makeHand(pot: "100", stack: "700", facingBet: "10")
        let original = HandEvaluation(hand: hand, parser: AmountParser())
        XCTAssertNotNil(original.geometric.value)
        XCTAssertNotNil(original.preflop.value)

        for replacement in ["", ".", "bad", "0"] {
            hand.pot = replacement
            hand.facingBet = replacement
            let updated = HandEvaluation(hand: hand, parser: AmountParser())
            XCTAssertNil(updated.geometric.value)
            XCTAssertNil(updated.preflop.value)
        }
        hand.pot = "100"
        hand.stack = "bad"
        hand.facingBet = "10"
        let invalidStack = HandEvaluation(hand: hand, parser: AmountParser())
        XCTAssertNil(invalidStack.geometric.value)
        XCTAssertEqual(invalidStack.preflop, original.preflop)
    }

    func testResetClearsOnlyInputsAndPreservesPin() {
        for pinned in [false, true] {
            var hand = makeHand(pot: "100", stack: "700", facingBet: "10")
            hand.isPinned = pinned
            hand.reset()
            XCTAssertEqual(hand.pot, "")
            XCTAssertEqual(hand.stack, "")
            XCTAssertEqual(hand.facingBet, "")
            XCTAssertEqual(hand.isPinned, pinned)
            let evaluation = HandEvaluation(hand: hand, parser: AmountParser())
            XCTAssertEqual(evaluation.geometric, .waiting)
            XCTAssertEqual(evaluation.preflop, .waiting)
            hand.reset()
            XCTAssertEqual(hand.isPinned, pinned)
        }
    }

    func testEvaluationUsesConfiguredParserAndDoesNotMutateHand() {
        var hand = makeHand(pot: "10,5", stack: "73,5", facingBet: "2,5")
        hand.isPinned = true
        let snapshot = hand
        let parser = AmountParser(decimalSeparator: ",")
        let first = HandEvaluation(hand: hand, parser: parser)
        let second = HandEvaluation(hand: hand, parser: parser)
        XCTAssertEqual(hand, snapshot)
        XCTAssertEqual(first, second)
        XCTAssertEqual(first.geometric.value?.spr, 7)
        XCTAssertEqual(first.preflop.value?.map(\.amount), [6, 6.5, 7.5, 10])
        XCTAssertNil(HandEvaluation(hand: hand, parser: AmountParser()).geometric.value)
    }

    func testLiveResultAccessorsDoNotInventValues() {
        XCTAssertNil(LiveResult<Double>.waiting.value)
        XCTAssertNil(LiveResult<Double>.waiting.message)
        XCTAssertNil(LiveResult<Double>.invalid("Fix it").value)
        XCTAssertEqual(LiveResult<Double>.invalid("Fix it").message, "Fix it")
        XCTAssertEqual(LiveResult<Double>.ready(1.25).value, 1.25)
        XCTAssertNil(LiveResult<Double>.ready(1.25).message)
    }

    private func makeHand(pot: String, stack: String, facingBet: String) -> HandState {
        var hand = HandState()
        hand.pot = pot
        hand.stack = stack
        hand.facingBet = facingBet
        return hand
    }
}
