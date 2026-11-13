export const MINIMUM = 0.001;
export const MAXIMUM = 1e12;
export const MAX_LENGTH = 128;
const LEAST_NORMAL = 2.2250738585072014e-308;
export const RAISES = Object.freeze([
  { id: "threeBetIP", title: "3-bet", position: "inPosition", multiplier: 3 },
  { id: "threeBetOOP", title: "3-bet", position: "outOfPosition", multiplier: 4 },
  { id: "fourBetIP", title: "4-bet", position: "inPosition", multiplier: 2.4 },
  { id: "fourBetOOP", title: "4-bet", position: "outOfPosition", multiplier: 2.6 },
]);

export class CalculationError extends Error {
  constructor(key) {
    super(key);
    this.name = "CalculationError";
    this.key = key;
  }
}

export function validSeparator(separator) {
  return [...separator].length === 1 && /^\p{P}$/u.test(separator) && separator !== "-";
}

export function parseAmount(source, separator = ".") {
  const invalid = (key) => ({ status: "Invalid", key, value: null });
  if ([...source].length > MAX_LENGTH) return invalid("amountTooLong");
  const text = source.trim();
  if (!text) return { status: "Empty", value: null };
  if (text === "+" || text === "-") return { status: "Incomplete", value: null };
  if (!validSeparator(separator)) return invalid("invalidDecimalSeparator");
  if (text === separator) return { status: "Incomplete", value: null };
  if (/\s/u.test(text)) return invalid("internalSpaces");
  if (/[eE]/u.test(text)) return invalid("exponentNotation");
  const parts = text.split(separator);
  if (parts.length > 2) return invalid("multipleSeparators");
  if (parts.some((part) => /[^0-9]/u.test(part))) return invalid("invalidCharacters");
  const integer = parts[0].replace(/^0+/u, "");
  const fraction = parts[1] ?? "";
  const hasFraction = /[1-9]/u.test(fraction);
  if (!integer && !hasFraction) return invalid("positiveAmount");
  if (!integer && !/[1-9]/u.test(fraction.slice(0, 3))) return invalid("minimumAmount");
  const maximum = "1000000000000";
  if (integer.length > maximum.length
      || (integer.length === maximum.length && integer > maximum)
      || (integer === maximum && hasFraction)) return invalid("maximumAmount");
  const value = Number(`${integer || "0"}${parts.length === 2 ? `.${fraction}` : ""}`);
  if (!Number.isFinite(value)) return invalid("unrepresentableAmount");
  if (value <= 0) return invalid("unrepresentableTinyAmount");
  if (value < MINIMUM || value > MAXIMUM) return invalid("inputRange");
  return { status: "Valid", value };
}

function positive(value, key) {
  if (!Number.isFinite(value) || value <= 0) throw new CalculationError(key);
}

export function fraction(spr, streets) {
  positive(spr, "mathInvalidSPR");
  if (!Number.isInteger(streets) || streets < 1) throw new CalculationError("mathStreetCount");
  if (streets === 1) return spr;
  const growth = spr <= Number.MAX_VALUE / 2 ? Math.log1p(2 * spr) : Math.log(spr) + Math.log(2 + 1 / spr);
  const value = spr <= LEAST_NORMAL * streets ? spr / streets : Math.expm1(growth / streets) / 2;
  if (!Number.isFinite(value)) throw new CalculationError("mathFractionOverflow");
  if (value <= 0) throw new CalculationError("mathFractionUnderflow");
  return value;
}

function plan(pot, stack, spr, streets) {
  const ratio = fraction(spr, streets);
  const firstBet = pot * ratio;
  if (!Number.isFinite(firstBet)) throw new CalculationError("mathFirstOverflow");
  if (firstBet <= 0) throw new CalculationError("mathFirstUnderflow");
  if (firstBet >= stack) throw new CalculationError("mathPrecision");
  if ([spr, ratio, firstBet].some((value) => value < LEAST_NORMAL)) {
    let growingPot = pot;
    let committed = 0;
    for (let street = 0; street < streets; street++) {
      const bet = growingPot * ratio;
      if (!Number.isFinite(bet) || bet <= 0) throw new CalculationError("mathPrecision");
      committed += bet / stack;
      if (street + 1 < streets) {
        growingPot += 2 * bet;
        if (!Number.isFinite(growingPot)) throw new CalculationError("mathPrecision");
      }
    }
    if (!Number.isFinite(committed) || Math.abs(committed - 1) > 1e-12) throw new CalculationError("mathPrecision");
  }
  const bets = [firstBet];
  let remaining = stack - firstBet;
  let previous = firstBet;
  for (let street = 1; street < streets - 1; street++) {
    const bet = previous * (1 + 2 * ratio);
    if (!Number.isFinite(bet) || bet <= 0 || bet >= remaining) throw new CalculationError("mathPrecision");
    bets.push(bet);
    remaining -= bet;
    previous = bet;
  }
  if (!Number.isFinite(remaining) || remaining <= 0) throw new CalculationError("mathPrecision");
  bets.push(remaining);
  return { streets, fraction: ratio, firstBet, bets };
}

export function geometric(pot, stack) {
  positive(pot, "mathInvalidPot");
  positive(stack, "mathInvalidStack");
  const spr = stack / pot;
  if (!Number.isFinite(spr)) throw new CalculationError("mathSPROverflow");
  if (spr <= 0) throw new CalculationError("mathSPRUnderflow");
  return { spr, twoStreet: plan(pot, stack, spr, 2), threeStreet: plan(pot, stack, spr, 3) };
}

export function preflop(facingBet) {
  positive(facingBet, "mathInvalidFacing");
  return RAISES.map((kind) => {
    const amount = facingBet * kind.multiplier;
    if (!Number.isFinite(amount)) throw new CalculationError("mathRaiseOverflow");
    return { ...kind, amount };
  });
}

export function evaluate(hand, separator = ".") {
  const inputs = Object.fromEntries(["pot", "stack", "facingBet"].map((key) => [key, parseAmount(hand[key], separator)]));
  const result = { inputs, geometric: null, preflop: null, geometricError: null, preflopError: null };
  const invalidField = ["pot", "stack"].find((key) => inputs[key].status === "Invalid");
  if (invalidField) result.geometricError = { field: invalidField, key: inputs[invalidField].key };
  else if (inputs.pot.value !== null && inputs.stack.value !== null) {
    try { result.geometric = geometric(inputs.pot.value, inputs.stack.value); }
    catch (error) {
      if (!(error instanceof CalculationError)) throw error;
      result.geometricError = { key: error.key };
    }
  }
  if (inputs.facingBet.status === "Invalid") result.preflopError = { field: "facingBet", key: inputs.facingBet.key };
  else if (inputs.facingBet.value !== null) {
    try { result.preflop = preflop(inputs.facingBet.value); }
    catch (error) {
      if (!(error instanceof CalculationError)) throw error;
      result.preflopError = { key: error.key };
    }
  }
  return result;
}

function fixedDecimal(value) {
  const [mantissa, exponentText] = String(value).toLowerCase().split("e");
  const [integer, decimals = ""] = mantissa.split(".");
  const digits = integer + decimals;
  const point = integer.length + Number(exponentText ?? 0);
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + "0".repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

// Round the shortest decimal once, not the already-imprecise binary product x*10.
export function format(value, minimumDecimal = true, separator = ".") {
  if (!Number.isFinite(value) || value <= 0) return { text: null, key: "outOfRange", copy: null };
  if (!validSeparator(separator)) return { text: null, key: "invalidDecimalSeparator", copy: null };
  if (value < 0.05) return { text: `<0${separator}1`, copy: null };
  const [integer, decimals = ""] = fixedDecimal(value).split(".");
  let tenths = BigInt(integer) * 10n + BigInt(decimals[0] ?? "0");
  if ((decimals[1] ?? "0") >= "5") tenths++;
  const remainder = tenths % 10n;
  const text = `${tenths / 10n}${minimumDecimal || remainder !== 0n ? separator + remainder : ""}`;
  return { text, copy: text };
}
export function amount(value, separator = ".") { return format(value, true, separator); }
export function sprText(value, separator = ".") { return format(value, false, separator); }
export function percent(value, separator = ".") {
  const number = value * 100;
  const result = format(number, number < 100, separator);
  return { ...result, text: result.text === null ? null : `${result.text}%`, copy: null };
}

export const PRACTICE_STAKES = Object.freeze({
  live: [[1, 2], [2, 5], [5, 10]],
  online: [[0.05, 0.1], [0.25, 0.5], [0.5, 1], [1, 2]],
});
export const PRACTICE_STORAGE_KEY = "poker-spr-practice-v1";
export const PRACTICE_ACTION_MS = 900;
const PRACTICE_BET_PAUSE_MS = 1000;
const PRACTICE_TOLERANCE = 0.05;

function practiceAction(kind, now) {
  return { kind, startedAt: now, readyAt: now + (kind === "bet" ? 2 * PRACTICE_BET_PAUSE_MS
    : kind === "none" ? 0 : PRACTICE_ACTION_MS) };
}

export function practiceActionView(round, now = Date.now()) {
  if (!["playing", "correct"].includes(round.status)) return { phase: "complete" };
  const action = round.action;
  if (action.kind === "bet" && now < action.startedAt + PRACTICE_BET_PAUSE_MS) {
    return { phase: "bet", startedAt: action.startedAt };
  }
  if (now < action.readyAt) return {
    phase: action.kind === "bet" ? "call" : action.kind,
    startedAt: action.startedAt + (action.kind === "bet" ? PRACTICE_BET_PAUSE_MS : 0),
  };
  return { phase: round.status === "playing" ? "hero" : "complete" };
}

export function validatePracticeSettings(settings) {
  if (!settings || !Number.isFinite(settings.smallBlind) || !Number.isFinite(settings.bigBlind)
      || settings.smallBlind < MINIMUM || settings.bigBlind > 1e6 || settings.smallBlind >= settings.bigBlind) {
    throw new CalculationError("practiceBlindError");
  }
  return { smallBlind: settings.smallBlind, bigBlind: settings.bigBlind };
}

function practiceLiveChipSize(settings) {
  return settings.smallBlind === 5 && settings.bigBlind === 10 ? 5 : 1;
}

export function parsePracticeBet(text, mode, unit, bigBlind, separator = ".") {
  if (mode === "live" && !/^[0-9]+$/u.test(text.trim())) {
    return { status: "Invalid", key: "practiceWholeError", value: null };
  }
  const parsed = parseAmount(text, separator);
  if (parsed.status !== "Valid") return parsed;
  const value = mode === "online" && unit === "bb" ? parsed.value * bigBlind : parsed.value;
  if (!Number.isFinite(value) || value > MAXIMUM) return { status: "Invalid", key: "maximumAmount", value: null };
  return { status: "Valid", value };
}

export function practiceDisplayValue(chips, unit, bigBlind) {
  return unit === "bb" ? chips / bigBlind : chips;
}

export function practiceInputText(value, separator = ".", maximumFractionDigits = 20) {
  return new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits }).format(value).replace(".", separator);
}

export class PracticeBetDraft {
  constructor(mode, bigBlind, separator = ".") {
    this.mode = mode;
    this.bigBlind = bigBlind;
    this.separator = separator;
    this.unit = "chips";
    this.clear();
  }
  clear() { this.value = null; this.texts = { chips: "", bb: "" }; }
  get text() { return this.texts[this.unit]; }
  setText(text) {
    const parsed = parsePracticeBet(text, this.mode, this.unit, this.bigBlind, this.separator);
    this.value = parsed.value;
    this.texts = { [this.unit]: text };
    return parsed;
  }
  fill(chips) {
    this.value = chips;
    this.texts = { [this.unit]: practiceInputText(practiceDisplayValue(chips, this.unit, this.bigBlind), this.separator, 2) };
  }
  toggle(unit) {
    if (this.mode !== "online" || !["chips", "bb"].includes(unit)) throw new CalculationError("practiceConvertError");
    if (this.text.trim() && this.value === null) throw new CalculationError("practiceConvertError");
    this.texts[unit] ??= this.value === null ? ""
      : practiceInputText(practiceDisplayValue(this.value, unit, this.bigBlind), this.separator, 2);
    this.unit = unit;
  }
}

export function practiceSeating(count, heroPosition, opponentSeat) {
  const positions = count === 6 ? ["BTN", "SB", "BB", "UTG", "HJ", "CO"]
    : ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO"];
  if (!positions[heroPosition] || !Number.isInteger(opponentSeat) || opponentSeat < 1 || opponentSeat >= count) {
    throw new CalculationError("practiceSeatError");
  }
  // Physical seats run clockwise from hero at the bottom; postflop starts at SB.
  const seats = Array.from({ length: count }, (_, seat) => {
    const positionIndex = (heroPosition + seat) % count;
    return { seat, position: positions[positionIndex], dealer: positionIndex === 0,
      active: seat === 0 || seat === opponentSeat, hero: seat === 0,
      actionOrder: (positionIndex + count - 1) % count };
  });
  return { seats, opponentSeat, opponentChecks: seats[opponentSeat].actionOrder < seats[0].actionOrder };
}

export function practiceTarget(round) {
  const effectiveStack = Math.min(round.heroStack, round.opponentStack);
  const streets = round.street === "flop" ? round.e : 2;
  const ratio = fraction(effectiveStack / round.pot, streets);
  const idealBet = Math.min(round.pot * ratio, effectiveStack);
  const lower = Math.max(0, idealBet - round.pot * PRACTICE_TOLERANCE);
  const upper = Math.min(effectiveStack, idealBet + round.pot * PRACTICE_TOLERANCE);
  const epsilon = Number.EPSILON * Math.max(round.pot, effectiveStack) * 8;
  return {
    pot: round.pot, heroStack: round.heroStack, opponentStack: round.opponentStack,
    effectiveStack, spr: effectiveStack / round.pot, streets, fraction: ratio, idealBet,
    lower, upper,
    minimumWholeBet: Math.max(1, Math.ceil(lower - epsilon)),
    maximumWholeBet: Math.min(Math.floor(effectiveStack), Math.floor(upper + epsilon)),
  };
}

export function createPracticeRound({ mode, settings, random = Math.random, now = Date.now(), id }) {
  if (!["live", "online"].includes(mode) || typeof id !== "string" || !id) throw new CalculationError("practiceRoundError");
  const stake = validatePracticeSettings(settings);
  const e = random() < 0.5 ? 2 : 3;
  const quantum = mode === "live" ? practiceLiveChipSize(stake) : Math.min(0.01, stake.bigBlind / 10);
  const quantize = (value) => Number((Math.round(value / quantum) * quantum).toPrecision(14));
  let pot;
  let effectiveStack;
  let generated = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    pot = quantize(Math.max(mode === "live" ? 20 : 0.1, stake.bigBlind * (5 + random() * 19)));
    const bucket = random();
    const ratio = bucket < 0.25 ? 0.12 + random() * 0.23
      : bucket < 0.85 ? 0.35 + random() * 0.6 : 1 + random() * (e === 3 ? 0.45 : 0.5);
    effectiveStack = quantize(pot * Math.expm1(e * Math.log1p(2 * ratio)) / 2);
    if (!(pot > 0 && effectiveStack > 0 && effectiveStack <= Math.max(mode === "live" ? 100 : 1, stake.bigBlind * 400))) continue;
    const target = fraction(effectiveStack / pot, e);
    const ideal = pot * target;
    const representable = mode === "live" ? Math.round(ideal) : ideal;
    if (target <= 1.5 && representable > 0 && representable <= effectiveStack
        && Math.abs(representable - ideal) <= pot * PRACTICE_TOLERANCE
        && ideal >= Math.max(MINIMUM, MINIMUM * stake.bigBlind)) {
      generated = true;
      break;
    }
  }
  if (!generated) throw new CalculationError("practiceGenerationError");
  const deeperStack = random() < 0.15 ? effectiveStack : quantize(effectiveStack * (1.05 + random() * 0.75));
  const heroShorter = random() < 0.5;
  const count = mode === "live" ? 9 : 6;
  const seating = practiceSeating(count, Math.floor(random() * count), 1 + Math.floor(random() * (count - 1)));
  const heroStack = heroShorter ? effectiveStack : deeperStack;
  const opponentStack = heroShorter ? deeperStack : effectiveStack;
  let street = e === 3 ? "flop" : "turn";
  if (e === 2 && !seating.opponentChecks && random() < 0.5) street = "flop";
  const action = practiceAction(seating.opponentChecks ? "check" : "none", now);
  return {
    id, mode, settings: stake, e, street, pot, initialPot: pot,
    heroStack, opponentStack, initialHeroStack: heroStack, initialOpponentStack: opponentStack,
    seating, action, answers: [], status: "playing", deadline: mode === "online" ? action.readyAt + 30_000 : null,
  };
}

export function submitPracticeBet(round, actualBet, now = Date.now()) {
  if (round.status !== "playing") return round;
  const timed = expirePracticeRound(round, now);
  if (timed !== round) return timed;
  if (now < round.action.readyAt) throw new CalculationError("practiceWaitForAction");
  if (!Number.isFinite(actualBet) || actualBet <= 0 || (round.mode === "live" && !Number.isInteger(actualBet))) {
    throw new CalculationError(round.mode === "live" ? "practiceWholeError" : "positiveAmount");
  }
  const target = practiceTarget(round);
  if (actualBet > target.effectiveStack) throw new CalculationError("practiceMaximumBet");
  // Account only for binary arithmetic at the inclusive boundary, not display rounding.
  const epsilon = Number.EPSILON * Math.max(target.pot, target.effectiveStack, actualBet) * 8;
  const correct = actualBet >= target.lower - epsilon && actualBet <= target.upper + epsilon;
  const answer = { ...target, street: round.street, actualBet, correct };
  const answers = [...round.answers, answer];
  if (!correct) return { ...round, answers, status: "incorrect" };
  const advance = round.mode === "live" && round.e === 3 && round.street === "flop";
  const action = practiceAction(advance ? "bet" : "call", now);
  if (!advance) return { ...round, action, answers, status: "correct" };
  return { ...round, action, answers, street: "turn", pot: round.pot + 2 * actualBet,
    heroStack: round.heroStack - actualBet, opponentStack: round.opponentStack - actualBet };
}

export function expirePracticeRound(round, now = Date.now()) {
  return round.status === "playing" && round.deadline !== null && now >= round.deadline
    ? { ...round, status: "timeout" } : round;
}

export function practiceShortcut(round, ratio) {
  return Math.min(round.pot * ratio, round.heroStack, round.opponentStack);
}

export function practiceNextBet(answer) {
  if (answer.actualBet === null) return { status: "none" };
  if (!Number.isFinite(answer.actualBet) || answer.actualBet <= 0) throw new CalculationError("practiceRoundError");
  if (answer.actualBet > answer.effectiveStack) return { status: "illegal" };
  if (answer.actualBet === answer.effectiveStack) return { status: "allIn" };
  const pot = answer.pot + 2 * answer.actualBet;
  const remaining = answer.effectiveStack - answer.actualBet;
  const streets = answer.streets - 1;
  const bet = streets === 1 ? remaining : pot * fraction(remaining / pot, streets);
  return { status: "bet", street: answer.street === "flop" ? "turn" : "river", bet, pot, fraction: bet / pot };
}

export function practiceTableView(round, now = Date.now()) {
  const advanced = round.mode === "live" && round.e === 3 && round.street === "turn" && round.answers[0]?.correct;
  const last = round.answers.at(-1);
  const called = last?.correct ? last : null;
  const phase = practiceActionView(round, now).phase;
  const betting = phase === "bet";
  const awaitingTurn = round.action.kind === "bet" && ["bet", "call"].includes(phase);
  return {
    street: awaitingTurn ? last.street : round.street, e: round.e, initialPot: round.initialPot,
    visiblePot: called ? called.pot + (betting ? 0 : 2 * called.actualBet) : round.pot,
    heroStack: called ? called.heroStack - called.actualBet : round.heroStack,
    opponentStack: called ? called.opponentStack - (betting ? 0 : called.actualBet) : round.opponentStack, seating: round.seating,
    calledBet: advanced && !betting ? round.answers[0].actualBet : null,
  };
}

function freshPracticeData() {
  const mode = (smallBlind, bigBlind) => ({ settings: { smallBlind, bigBlind },
    stats: { played: 0, correct: 0, current: 0, best: 0 }, lastRoundId: null });
  return { version: 1, live: mode(5, 10), online: mode(1, 2), pending: null };
}

function validatePracticeData(data) {
  if (data?.version !== 1) throw new CalculationError("practiceStorageInvalid");
  for (const mode of ["live", "online"]) {
    validatePracticeSettings(data[mode]?.settings);
    const stats = data[mode]?.stats;
    if (!stats || !["played", "correct", "current", "best"].every((key) => Number.isSafeInteger(stats[key]) && stats[key] >= 0)
        || stats.correct > stats.played || stats.current > stats.best || stats.best > stats.correct
        || (data[mode].lastRoundId !== null && typeof data[mode].lastRoundId !== "string")) {
      throw new CalculationError("practiceStorageInvalid");
    }
  }
  if (data.pending !== null && (typeof data.pending?.id !== "string" || !data.pending.id
      || !Number.isFinite(data.pending.deadline))) throw new CalculationError("practiceStorageInvalid");
  return data;
}

function recordPracticeResult(data, mode, id, correct) {
  if (data[mode].lastRoundId === id) return false;
  const stats = data[mode].stats;
  stats.played++;
  if (correct) stats.correct++;
  stats.current = correct ? stats.current + 1 : 0;
  stats.best = Math.max(stats.best, stats.current);
  data[mode].lastRoundId = id;
  return true;
}

// A single write commits stats and the pending-round journal together.
export class PracticeStore {
  constructor(storage) {
    this.storage = storage;
    this.data = freshPracticeData();
  }
  refresh() {
    const raw = this.storage.getItem(PRACTICE_STORAGE_KEY);
    this.data = raw === null ? freshPracticeData() : validatePracticeData(JSON.parse(raw));
    return this.data;
  }
  commit(change) {
    this.refresh();
    const next = structuredClone(this.data);
    const result = change(next);
    const serialized = JSON.stringify(next);
    if (serialized !== JSON.stringify(this.data)) this.storage.setItem(PRACTICE_STORAGE_KEY, serialized);
    this.data = next;
    return result;
  }
  recover() {
    this.refresh();
    if (!this.data.pending) return false;
    return this.commit((data) => {
      if (!data.pending) return false;
      recordPracticeResult(data, "online", data.pending.id, false);
      data.pending = null;
      return true;
    });
  }
  begin(round) {
    return this.commit((data) => {
      if (data.pending) recordPracticeResult(data, "online", data.pending.id, false);
      data.pending = round.mode === "online" ? { id: round.id, deadline: round.deadline } : null;
    });
  }
  finish(round) {
    if (round.status === "playing") return false;
    return this.commit((data) => {
      if (round.mode === "online" && data.pending?.id !== round.id) return false;
      const recorded = recordPracticeResult(data, round.mode, round.id, round.status === "correct");
      if (round.mode === "online") data.pending = null;
      return recorded;
    });
  }
  saveSettings(mode, settings) {
    if (!["live", "online"].includes(mode)) throw new CalculationError("practiceRoundError");
    const validated = validatePracticeSettings(settings);
    this.commit((data) => { data[mode].settings = validated; });
  }
  reset(mode) {
    if (!["live", "online"].includes(mode)) throw new CalculationError("practiceRoundError");
    this.commit((data) => { data[mode].stats = freshPracticeData()[mode].stats; data[mode].lastRoundId = null; });
  }
  clear() {
    this.storage.removeItem(PRACTICE_STORAGE_KEY);
    this.data = freshPracticeData();
  }
}
