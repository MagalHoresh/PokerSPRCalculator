import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAmount, evaluate, geometric, fraction, preflop, format, amount, sprText, percent, RAISES, CalculationError } from "../src/core.js";
const fixture = JSON.parse(await readFile(new URL("../../windows/PokerCalculator.Checks/SwiftParity.json", import.meta.url)));
const native = JSON.parse(await readFile(new URL("../../windows/PokerCalculator.Core/Strings.json", import.meta.url)));
const near = (actual, expected, info) => assert.ok(Math.abs(actual / expected - 1) < 2e-12, `${info}: ${actual} != ${expected}`);

test("all 196 current Swift hands: exact displayed plans and full-precision recurrence", () => {
  for (const hand of fixture.hands) {
    const result = geometric(hand.pot, hand.stack);
    near(result.spr, hand.spr, "SPR");
    assert.equal(sprText(result.spr).text, hand.sprText);
    for (const expected of hand.plans) {
      const actual = expected.streets === 2 ? result.twoStreet : result.threeStreet;
      near(actual.fraction, expected.fraction, "fraction");
      assert.equal(percent(actual.fraction).text, expected.percent);
      assert.equal(actual.bets.length, actual.streets);
      let remaining = hand.stack;
      let pot = hand.pot;
      actual.bets.forEach((bet, index) => {
        near(bet, expected.bets[index], "bet");
        near(bet, pot * actual.fraction, "called pot");
        assert.equal(amount(bet).text, expected.amounts[index]);
        assert.ok(bet > 0 && bet <= remaining);
        remaining -= bet;
        pot += 2 * bet;
      });
      assert.equal(remaining, 0);
    }
  }
});

test("104 native parsing cases retain exact status, amount and translated message", () => {
  for (const input of fixture.inputs) {
    const parsed = parseAmount(input.text, input.separator);
    assert.equal(parsed.status, input.status, JSON.stringify(input));
    assert.equal(parsed.value, input.value);
    const message = parsed.key ? native[input.language][parsed.key].replaceAll("{separator}", input.separator) : null;
    assert.equal(message, input.message);
  }
});

test("native half-up one-decimal display/copy parity, including huge and tiny values", () => {
  for (const input of fixture.formats) {
    const value = Number(input.value);
    assert.equal(amount(value).text ?? native.en[amount(value).key], input.amount);
    assert.equal(amount(value).copy, input.copy);
    assert.equal(sprText(value).text, input.spr);
    assert.equal(percent(value).text ?? native.en[percent(value).key], input.percent);
  }
  assert.equal(amount(1.05).text, "1.1");
  assert.equal(amount(129.6, ",").text, "129,6");
  assert.equal(amount(0.001).text, "<0.1");
  assert.equal(amount(0.001).copy, null);
});

test("40% path, fixed raises and independently invalidated results", () => {
  const hand = { pot: "100", stack: "241.6", facingBet: "3" };
  const valid = evaluate(hand);
  assert.deepEqual(valid.geometric.threeStreet.bets.map((value) => amount(value).text), ["40.0", "72.0", "129.6"]);
  assert.deepEqual(preflop(10).map((value) => value.amount), [30, 40, 24, 26]);
  assert.deepEqual(RAISES.map((value) => value.id), ["threeBetIP", "threeBetOOP", "fourBetIP", "fourBetOOP"]);
  assert.equal(evaluate({ ...hand, pot: "oops" }).geometric, null);
  assert.deepEqual(evaluate({ ...hand, pot: "oops" }).preflop, valid.preflop);
  assert.equal(evaluate({ ...hand, facingBet: "-" }).preflop, null);
  assert.deepEqual(evaluate({ ...hand, facingBet: "oops" }).geometric, valid.geometric);
  for (const field of ["pot", "stack", "facingBet"]) {
    const result = evaluate({ ...hand, [field]: "" });
    assert.equal(result[field === "facingBet" ? "preflop" : "geometric"], null);
  }
});

test("floating-point failures are explicit; no nonfinite or misleading zero output", () => {
  for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => geometric(invalid, 1), CalculationError);
    assert.throws(() => geometric(1, invalid), CalculationError);
    assert.throws(() => preflop(invalid), CalculationError);
    assert.equal(format(invalid).copy, null);
  }
  assert.throws(() => fraction(1, 0), /mathStreetCount/);
  assert.throws(() => geometric(Number.MIN_VALUE, Number.MAX_VALUE), /mathSPROverflow/);
  assert.throws(() => geometric(Number.MAX_VALUE, Number.MIN_VALUE), /mathSPRUnderflow/);
  assert.throws(() => fraction(Number.MIN_VALUE, 3), /mathFractionUnderflow/);
  assert.throws(() => preflop(Number.MAX_VALUE), /mathRaiseOverflow/);
  assert.throws(() => geometric(1e223, 1e-100), /mathPrecision/);
  for (const tiny of [1e-15, 1e-100, 1e-300]) for (const streets of [2, 3]) near(fraction(tiny, streets), tiny / streets, "tiny SPR");
  for (const [pot, stack] of [[1, Number.MAX_VALUE], [Number.MAX_VALUE, 1], [Number.MAX_VALUE, Number.MAX_VALUE], [2.2250738585072014e-308, 2.2250738585072014e-308]]) {
    for (const plan of Object.values(geometric(pot, stack)).filter((entry) => entry.bets)) {
      let remaining = stack;
      for (const bet of plan.bets) { assert.ok(Number.isFinite(bet) && bet > 0 && bet <= remaining); remaining -= bet; }
      assert.equal(remaining, 0);
    }
  }
});
