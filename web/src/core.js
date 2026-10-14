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
