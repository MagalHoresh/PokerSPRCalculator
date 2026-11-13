import test from "node:test";
import assert from "node:assert/strict";
import {
  fraction, PRACTICE_STAKES, PRACTICE_STORAGE_KEY, PRACTICE_ACTION_MS, PracticeStore, PracticeBetDraft,
  createPracticeRound, submitPracticeBet, expirePracticeRound, practiceTarget,
  practiceTableView, practiceSeating, practiceShortcut, practiceNextBet, parsePracticeBet, validatePracticeSettings, practiceActionView,
} from "../src/core.js";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const spot = (changes = {}) => ({
  id: "round-1", mode: "online", settings: { smallBlind: 1, bigBlind: 2 },
  e: 2, street: "turn", pot: 100, initialPot: 100, heroStack: 150, opponentStack: 240,
  initialHeroStack: 150, initialOpponentStack: 240, seating: practiceSeating(6, 0, 1),
  action: { kind: "none", startedAt: 0, readyAt: 0 },
  answers: [], status: "playing", deadline: 30_000, ...changes,
});
const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const seeded = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

test("effective stack is the smaller player, independent of hero and seating", () => {
  near(practiceTarget(spot()).idealBet, 50);
  near(practiceTarget(spot({ heroStack: 240, opponentStack: 150 })).idealBet, 50);
  near(practiceTarget(spot({ opponentStack: 150 })).idealBet, 50);
  assert.equal(practiceTableView(spot()).heroStack, 150);
  assert.equal(practiceTableView(spot()).opponentStack, 240);
});

test("inclusive five percentage points of pot, not five percent of target", () => {
  for (const bet of [45, 55]) assert.equal(submitPracticeBet(spot(), bet, 0).status, "correct");
  for (const bet of [44.99999, 55.00001]) assert.equal(submitPracticeBet(spot(), bet, 0).status, "incorrect");
  const overPot = spot({ heroStack: 400, opponentStack: 500 }); // 100% of pot.
  for (const bet of [95, 105]) assert.equal(submitPracticeBet(overPot, bet, 0).status, "correct");
  const tiny = spot({ pot: 1, heroStack: 0.01, opponentStack: 1 });
  assert.equal(practiceTarget(tiny).upper, 0.01);
  assert.throws(() => submitPracticeBet(tiny, 0.010001, 0), /practiceMaximumBet/);
  const precise = spot({ heroStack: 151.234 });
  const target = practiceTarget(precise);
  assert.notEqual(target.idealBet, Number(target.idealBet.toFixed(1)));
  assert.equal(submitPracticeBet(precise, target.lower, 0).status, "correct");
  assert.equal(submitPracticeBet(precise, target.lower - 0.000001, 0).status, "incorrect");
});

test("Live 3e uses the actual accepted flop bet, shows the turn pot, and scores only the round", () => {
  const initial = spot({ mode: "live", e: 3, street: "flop", deadline: null, heroStack: 400, opponentStack: 241.6 });
  const first = submitPracticeBet(initial, 44, 0);
  assert.equal(first.status, "playing");
  assert.equal(first.street, "turn");
  assert.equal(first.pot, 188);
  near(first.heroStack, 356);
  near(first.opponentStack, 197.6);
  assert.equal(practiceTableView(first).visiblePot, 188);
  assert.equal(practiceTableView(first).initialPot, 100);
  assert.equal(practiceTableView(first).calledBet, 44);
  const target = practiceTarget(first);
  near(target.idealBet, 188 * fraction(197.6 / 188, 2));
  assert.notEqual(target.idealBet, 72);
  const store = new PracticeStore(memoryStorage());
  assert.equal(store.finish(first), false);
  assert.equal(store.data.live.stats.played, 0);
  const final = submitPracticeBet(first, Math.round(target.idealBet), first.action.readyAt);
  assert.equal(final.status, "correct");
  assert.equal(store.finish(final), true);
  assert.deepEqual(store.data.live.stats, { played: 1, correct: 1, current: 1, best: 1 });
  assert.equal(store.finish(final), false);
  assert.equal(store.data.live.stats.played, 1);
  const wrong = submitPracticeBet(first, 1, first.action.readyAt);
  const failureStore = new PracticeStore(memoryStorage());
  failureStore.finish(wrong);
  assert.deepEqual(failureStore.data.live.stats, { played: 1, correct: 0, current: 0, best: 0 });
  const wrongFlop = submitPracticeBet(initial, 1);
  assert.equal(practiceTableView(wrongFlop).visiblePot, 100);
  assert.equal(practiceTableView(wrongFlop).calledBet, null);
});

test("Live 2e and Online 3e end after one answer; malformed Live amounts cannot advance", () => {
  const live = spot({ mode: "live", deadline: null });
  assert.equal(submitPracticeBet(live, 50).status, "correct");
  assert.equal(practiceTableView(submitPracticeBet(live, 1)).visiblePot, 100);
  assert.equal(practiceTarget(live).minimumWholeBet, 45);
  assert.equal(practiceTarget(live).maximumWholeBet, 55);
  assert.throws(() => submitPracticeBet(live, 50.1), /practiceWholeError/);
  for (const text of ["", "1.5", "1,5", "1e2", "-5"]) assert.equal(parsePracticeBet(text, "live", "chips", 2).value, null);
  assert.equal(parsePracticeBet("050", "live", "chips", 2).value, 50);
  assert.equal(parsePracticeBet("1,25", "online", "bb", 0.5, ",").value, 0.625);
  const online = spot({ e: 3, street: "flop", heroStack: 241.6 });
  assert.equal(submitPracticeBet(online, 40, 0).status, "correct");
});

test("over-stack bets are validation errors, not graded answers, for either shorter player", () => {
  for (const mode of ["live", "online"]) for (const [heroStack, opponentStack] of [[150, 240], [240, 150]]) {
    const round = spot({ mode, heroStack, opponentStack, deadline: mode === "live" ? null : 30_000 });
    assert.throws(() => submitPracticeBet(round, 241, 0), /practiceMaximumBet/);
    assert.throws(() => submitPracticeBet(round, 151, 0), /practiceMaximumBet/);
    assert.equal(round.status, "playing");
    assert.equal(round.answers.length, 0);
    assert.equal(submitPracticeBet(round, 50, 0).status, "correct");
    if (mode === "online") assert.equal(submitPracticeBet(round, 241, 30_000).status, "timeout");
  }
});

test("flop 2E targets two streets and the next all-in is on the turn in both modes", () => {
  for (const mode of ["live", "online"]) {
    const round = spot({ mode, street: "flop", deadline: mode === "live" ? null : 30_000 });
    const target = practiceTarget(round);
    assert.equal(target.streets, 2);
    near(target.idealBet, 50);
    for (const bet of [45, 50, 55]) {
      const final = submitPracticeBet(round, bet, 0);
      assert.equal(final.status, "correct");
      assert.equal(final.answers.length, 1);
      const next = practiceNextBet(final.answers[0]);
      assert.equal(next.street, "turn");
      near(next.bet, 150 - bet);
      near(next.pot, 100 + 2 * bet);
    }
    for (const bet of [44, 56]) assert.equal(submitPracticeBet(round, bet, 0).status, "incorrect");
  }
});

test("Live 5/10 accepts every whole-number bet within the unrounded range, not just multiples of five", () => {
  const round = spot({ mode: "live", settings: { smallBlind: 5, bigBlind: 10 }, deadline: null });
  const target = practiceTarget(round);
  assert.equal(target.minimumWholeBet, 45);
  assert.equal(target.maximumWholeBet, 55);
  for (const bet of [45, 46, 49, 50, 51, 54, 55]) assert.equal(submitPracticeBet(round, bet).status, "correct");
  for (const bet of [40, 60]) assert.equal(submitPracticeBet(round, bet).status, "incorrect");
  assert.equal(round.answers.length, 0);
  assert.equal(round.status, "playing");
  assert.throws(() => submitPracticeBet(round, 151), /practiceMaximumBet/);
  for (const settings of [{ smallBlind: 1, bigBlind: 2 }, { smallBlind: 2, bigBlind: 5 }]) {
    assert.equal(submitPracticeBet({ ...round, settings }, 46).status, "correct");
  }
  assert.equal(submitPracticeBet({ ...round, mode: "online", deadline: 30_000 }, 46.5, 0).status, "correct");
});

test("Online fixes a full thirty-second deadline after the position-dependent check, not an animation callback", () => {
  for (const checks of [false, true]) {
    const round = createPracticeRound({ mode: "online", settings: { smallBlind: 1, bigBlind: 2 },
      random: () => checks ? 0.75 : 0.4, now: 1000, id: `intro-${checks}` });
    const readyAt = 1000 + (checks ? PRACTICE_ACTION_MS : 0);
    assert.equal(round.seating.opponentChecks, checks);
    assert.equal(round.action.readyAt, readyAt);
    assert.equal(round.deadline, readyAt + 30_000);
    assert.equal(practiceActionView(round, 1000).phase, checks ? "check" : "hero");
    const bet = practiceTarget(round).idealBet;
    if (checks) {
      assert.equal(practiceActionView(round, readyAt - 1).phase, "check");
      assert.throws(() => submitPracticeBet(round, bet, readyAt - 1), /practiceWaitForAction/);
      assert.equal(round.answers.length, 0);
    }
    assert.equal(practiceActionView(round, readyAt).phase, "hero");
    const final = submitPracticeBet(round, bet, readyAt);
    assert.equal(final.status, "correct");
    assert.equal(final.deadline, round.deadline);
    assert.equal(practiceActionView(final, readyAt + PRACTICE_ACTION_MS - 1).phase, "call");
    assert.equal(practiceActionView(final, readyAt + PRACTICE_ACTION_MS).phase, "complete");
    assert.equal(submitPracticeBet(round, bet, round.deadline).status, "timeout");
  }
});

test("Live flop call pauses one second before an optional turn check; exact amounts remain visible", () => {
  for (const checks of [false, true]) {
    const initial = spot({ mode: "live", e: 3, street: "flop", deadline: null, heroStack: 400, opponentStack: 245,
      seating: practiceSeating(9, checks ? 0 : 1, 1) });
    const turn = submitPracticeBet(initial, 41, 1000);
    assert.equal(turn.status, "playing");
    assert.equal(practiceActionView(turn, 1000).phase, "call");
    const callEnd = 1000 + PRACTICE_ACTION_MS;
    assert.equal(practiceActionView(turn, callEnd - 1).phase, "call");
    assert.equal(practiceActionView(turn, callEnd).phase, checks ? "pause" : "hero");
    assert.equal(turn.action.readyAt, callEnd + (checks ? 1000 + PRACTICE_ACTION_MS : 0));
    if (checks) {
      assert.equal(practiceActionView(turn, callEnd + 999).phase, "pause");
      const check = practiceActionView(turn, callEnd + 1000);
      assert.equal(check.phase, "check");
      assert.equal(check.startedAt, callEnd + 1000);
      assert.throws(() => submitPracticeBet(turn, 50, callEnd + 500), /practiceWaitForAction/);
    }
    const view = practiceTableView(turn);
    assert.equal(view.visiblePot, 182);
    assert.equal(view.initialPot, 100);
    assert.equal(view.heroStack, 359);
    assert.equal(view.opponentStack, 204);
    const bet = Math.round(practiceTarget(turn).idealBet);
    assert.throws(() => submitPracticeBet(turn, bet, turn.action.readyAt - 1), /practiceWaitForAction/);
    const final = submitPracticeBet(turn, bet, turn.action.readyAt);
    assert.equal(final.status, "correct");
    assert.equal(final.answers.length, 2);
    assert.equal(practiceTableView(final).visiblePot, 182 + 2 * bet);
    assert.equal(practiceTableView(final).opponentStack, 204 - bet);
  }
});

test("explanation next bets use the actual matching call, including all-in and illegal bets", () => {
  const two = submitPracticeBet(spot({ pot: 20, heroStack: 29.1, opponentStack: 40 }), 7, 0).answers[0];
  const river = practiceNextBet(two);
  assert.equal(river.street, "river");
  assert.equal(river.pot, 34);
  near(river.bet, 22.1);
  near(river.fraction, 0.65);
  const three = submitPracticeBet(spot({ e: 3, street: "flop", heroStack: 241.6, opponentStack: 400 }), 44, 0).answers[0];
  const turn = practiceNextBet(three);
  assert.equal(turn.street, "turn");
  assert.equal(turn.pot, 188);
  near(turn.bet, 188 * fraction(197.6 / 188, 2));
  assert.equal(practiceNextBet({ ...two, actualBet: two.effectiveStack }).status, "allIn");
  assert.equal(practiceNextBet({ ...two, actualBet: two.effectiveStack + 1 }).status, "illegal");
  assert.equal(practiceNextBet({ ...two, actualBet: null }).status, "none");
});

test("unit conversion retains exact chip draft, original text and deadline; shortcuts only fill", () => {
  const round = spot({ settings: { smallBlind: 0.05, bigBlind: 0.1 } });
  const draft = new PracticeBetDraft("online", 0.1);
  draft.setText("17.1234567890123");
  const exact = draft.value;
  for (let index = 0; index < 100; index++) {
    draft.toggle("bb");
    assert.equal(draft.value, exact);
    draft.toggle("chips");
    assert.equal(draft.text, "17.1234567890123");
    assert.equal(draft.value, exact);
  }
  draft.toggle("bb");
  draft.setText("33.33");
  assert.equal(draft.value, 33.33 * 0.1);
  draft.toggle("chips");
  assert.equal(draft.value, 33.33 * 0.1);
  draft.setText("unfinished");
  assert.throws(() => draft.toggle("bb"), /practiceConvertError/);
  draft.fill(practiceShortcut(round, 0.33));
  assert.equal(round.status, "playing");
  assert.equal(round.answers.length, 0);
  assert.equal(round.deadline, 30_000);
  assert.equal(practiceShortcut(spot({ heroStack: 20 }), 1), 20);
  assert.throws(() => new PracticeBetDraft("live", 2).toggle("bb"), /practiceConvertError/);
});

test("shortcut and converted amounts show at most two decimal places without rounding the chip draft", () => {
  const chips = 46.63 * 0.33;
  for (const separator of [".", ","]) {
    const draft = new PracticeBetDraft("online", 0.1, separator);
    draft.fill(chips);
    assert.equal(draft.text, `15${separator}39`);
    assert.equal(draft.value, chips);
    for (let index = 0; index < 10; index++) {
      draft.toggle("bb");
      assert.equal(draft.text, `153${separator}88`);
      assert.equal(draft.value, chips);
      draft.toggle("chips");
      assert.equal(draft.text, `15${separator}39`);
      assert.equal(draft.value, chips);
    }
    draft.setText(`15${separator}39`);
    assert.equal(draft.value, 15.39);
  }
});

test("wall-clock deadline takes precedence over submit and ends exactly once after hidden time", () => {
  const round = spot();
  assert.equal(expirePracticeRound(round, 29_999), round);
  assert.equal(submitPracticeBet(round, 50, 30_000).status, "timeout");
  const expired = expirePracticeRound(round, 80_000);
  assert.equal(expired.status, "timeout");
  assert.equal(expirePracticeRound(expired, 90_000), expired);
  assert.equal(submitPracticeBet(expired, 50, 90_000), expired);
  const store = new PracticeStore(memoryStorage());
  store.begin(round);
  assert.equal(store.finish(expired), true);
  assert.equal(store.finish(expired), false);
  assert.deepEqual(store.data.online.stats, { played: 1, correct: 0, current: 0, best: 0 });
});

test("pending Online journal survives reload and navigation; stale writers cannot grade twice", () => {
  const storage = memoryStorage();
  const first = new PracticeStore(storage);
  first.begin(spot());
  const reloaded = new PracticeStore(storage);
  assert.equal(reloaded.recover(), true);
  assert.equal(reloaded.recover(), false);
  assert.equal(first.finish(submitPracticeBet(spot(), 50, 0)), false);
  assert.equal(reloaded.data.online.stats.played, 1);
  reloaded.begin(spot({ id: "round-2" }));
  first.begin(spot({ id: "round-3" })); // Starting again abandons the previous round.
  assert.equal(reloaded.finish(submitPracticeBet(spot({ id: "round-2" }), 50, 0)), false);
  assert.equal(first.finish(submitPracticeBet(spot({ id: "round-3" }), 50, 0)), true);
  assert.deepEqual(first.data.online.stats, { played: 3, correct: 1, current: 1, best: 1 });
  assert.equal(first.data.pending, null);
});

test("per-mode settings/stats persist independently; resetting preserves the selected stake", () => {
  const storage = memoryStorage();
  const store = new PracticeStore(storage);
  store.saveSettings("live", { smallBlind: 2, bigBlind: 5 });
  store.saveSettings("online", { smallBlind: 0.25, bigBlind: 0.5 });
  store.begin(spot());
  store.finish(submitPracticeBet(spot(), 50, 0));
  store.finish(submitPracticeBet(spot({ id: "live-round", mode: "live", deadline: null }), 50));
  store.reset("online");
  const loaded = new PracticeStore(storage);
  loaded.refresh();
  assert.equal(loaded.data.live.stats.best, 1);
  assert.equal(loaded.data.online.stats.played, 0);
  assert.equal(loaded.data.online.settings.bigBlind, 0.5);
  assert.equal(loaded.data.live.settings.bigBlind, 5);
  assert.throws(() => validatePracticeSettings({ smallBlind: 5, bigBlind: 2 }), /practiceBlindError/);
  assert.throws(() => validatePracticeSettings({ smallBlind: 0, bigBlind: 2 }), /practiceBlindError/);
});

test("storage failures are explicit and cannot create a success-shaped stats update", () => {
  const storage = memoryStorage();
  const store = new PracticeStore(storage);
  store.begin(spot());
  const before = structuredClone(store.data);
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.throws(() => store.finish(submitPracticeBet(spot(), 50, 0)), /QuotaExceeded/);
  assert.deepEqual(store.data, before);
  const corrupt = memoryStorage();
  corrupt.setItem(PRACTICE_STORAGE_KEY, '{"version":1}');
  assert.throws(() => new PracticeStore(corrupt).refresh(), /practiceBlindError/);
});

test("clockwise positions/dealer/action order stay consistent with hero physically at bottom", () => {
  for (const count of [6, 9]) for (let hero = 0; hero < count; hero++) for (let opponent = 1; opponent < count; opponent++) {
    const seating = practiceSeating(count, hero, opponent);
    assert.equal(seating.seats[0].hero, true);
    assert.equal(seating.seats.filter((seat) => seat.active).length, 2);
    assert.equal(new Set(seating.seats.map((seat) => seat.position)).size, count);
    assert.equal(seating.seats.filter((seat) => seat.dealer).length, 1);
    assert.equal(seating.opponentChecks, seating.seats[opponent].actionOrder < seating.seats[0].actionOrder);
  }
});

test("generated fixed-stake spots cover unequal/equal stacks and non-shortcut sizes with legal answers", () => {
  const random = seeded(42);
  const seen = new Set();
  const starts = new Set();
  for (const mode of ["live", "online"]) {
    for (const [smallBlind, bigBlind] of [...PRACTICE_STAKES[mode], [0.001, 0.003], [3, 7], [100, 250]]) {
      for (let index = 0; index < 200; index++) {
        const round = createPracticeRound({ mode, settings: { smallBlind, bigBlind }, random, now: 100, id: `${mode}-${index}` });
        const target = practiceTarget(round);
        assert.equal(round.settings.bigBlind, bigBlind);
        starts.add(`${mode}:${round.e}:${round.street}`);
        if (round.e === 3) assert.equal(round.street, "flop");
        if (round.e === 2 && round.street === "flop") assert.equal(round.seating.opponentChecks, false);
        assert.equal(target.streets, round.e);
        const increment = mode === "live" && smallBlind === 5 && bigBlind === 10 ? 5 : 1;
        if (increment === 5) {
          for (const value of [round.pot, round.heroStack, round.opponentStack]) {
            assert.equal(value % 5, 0);
          }
        }
        assert.equal(round.seating.seats.length, mode === "live" ? 9 : 6);
        assert.equal(round.deadline, mode === "live" ? null : round.action.readyAt + 30_000);
        assert.ok(target.fraction > 0 && target.fraction <= 1.5);
        seen.add(round.heroStack === round.opponentStack ? "equal" : round.heroStack < round.opponentStack ? "hero-short" : "hero-deep");
        seen.add(target.fraction < 0.35 ? "small" : target.fraction > 1 ? "over" : "standard");
        if (![0.33, 0.66, 1].some((size) => Math.abs(size - target.fraction) < 0.001)) seen.add("custom");
        const answer = mode === "live" ? Math.round(target.idealBet) : target.idealBet;
        const next = submitPracticeBet(round, answer, round.action.readyAt);
        assert.notEqual(next.status, "incorrect");
        if (next.status === "playing") {
          const turn = practiceTarget(next);
          assert.equal(next.pot, round.pot + 2 * answer);
          assert.equal(next.heroStack, round.heroStack - answer);
          assert.equal(next.opponentStack, round.opponentStack - answer);
          assert.ok(turn.fraction <= 1.5);
          assert.equal(submitPracticeBet(next, Math.round(turn.idealBet), next.action.readyAt).status, "correct");
          // Both extremes of the first accepted whole-number range must leave a playable turn.
          for (const bet of [target.minimumWholeBet, target.maximumWholeBet]) {
            const accepted = submitPracticeBet(round, bet, round.action.readyAt);
            const recalculated = practiceTarget(accepted);
            assert.equal(submitPracticeBet(accepted, Math.round(recalculated.idealBet), accepted.action.readyAt).status, "correct");
            assert.ok(recalculated.fraction <= 1.5);
          }
        }
      }
    }
  }
  assert.deepEqual([...seen].sort(), ["custom", "equal", "hero-deep", "hero-short", "over", "small", "standard"]);
  for (const mode of ["live", "online"]) for (const plan of ["2:flop", "2:turn", "3:flop"]) {
    assert.ok(starts.has(`${mode}:${plan}`), `Missing ${mode} ${plan}`);
  }
});
