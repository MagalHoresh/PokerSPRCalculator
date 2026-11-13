import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import * as core from "../src/core.js";

const [app, html, catalogSource] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/i18n.js", import.meta.url), "utf8"),
]);
const controller = app.slice(app.indexOf("class PracticeUI {"), app.indexOf('for (const page of ["calculator", "practice"])'));
const catalog = runInNewContext(`${catalogSource.slice(catalogSource.indexOf("const web ="), catalogSource.indexOf("export function t"))}\nweb;`);

// Minimal DOM ports exercise the real controller without a browser or layout emulation.
class Element {
  constructor() {
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {
      values: {}, setProperty(key, value) { this.values[key] = value; },
      getPropertyValue(key) { return this.values[key] ?? ""; },
    };
    this.clientWidth = 0;
    this.value = "";
    this.hidden = false;
    this.dataset = {};
    this.content = "";
  }
  set textContent(value) { this.content = value; this.children = []; }
  get textContent() { return this.content + this.children.map((node) => node.textContent).join(""); }
  get options() { return this.children; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.content = ""; this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  querySelector(selector) {
    if (selector.startsWith(".")) return this.querySelectorAll(selector)[0] ?? null;
    this.summary ??= new Element();
    return this.summary;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.className === selector.slice(1) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  getBoundingClientRect() { return { width: this.layoutWidth ?? 0 }; }
  contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
  focus() { this.focused = true; }
  blur() { this.blurred = true; }
}
function storagePort() {
  const values = new Map();
  return {
    writes: 0, fail: false,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (this.fail) throw new Error("QuotaExceededError");
      this.writes++;
      values.set(key, value);
    },
    removeItem(key) { values.delete(key); },
  };
}
async function harness(storage = storagePort(), realLabels = false, language = "en", { autoActions = true, random: customRandom } = {}) {
  let now = 1000;
  let nextId = 0;
  const timers = new Map();
  const resizeCallbacks = [];
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/gu)].map((match) => [match[1], new Element()]));
  const selectors = new Map();
  const selector = (name) => {
    if (!selectors.has(name)) selectors.set(name, new Element());
    return selectors.get(name);
  };
  const shortcuts = [0.33, 0.66, 1].map((size) => {
    const button = new Element();
    button.dataset.practiceSize = String(size);
    return button;
  });
  const notices = [];
  const errors = [];
  const context = {
    ...core,
    createPracticeRound: (options) => {
      let first = true;
      const random = () => { if (first) { first = false; return 0.75; } return 0.4; };
      return core.createPracticeRound({ ...options, random: customRandom ?? random, now });
    },
    submitPracticeBet: (round, bet) => core.submitPracticeBet(round, bet, now),
    expirePracticeRound: (round) => core.expirePracticeRound(round, now),
    practiceActionView: (round) => core.practiceActionView(round, now),
    document: {
      createElement: () => new Element(),
      querySelector: selector,
      querySelectorAll: (name) => name === "[data-practice-size]" ? shortcuts
        : [...nodes].filter(([id]) => id.startsWith("practice-")).map(([, node]) => node),
      addEventListener() {},
    },
    window: { localStorage: storage, addEventListener() {}, confirm: () => true },
    navigator: { locks: { request: async (_key, operation) => operation() } },
    crypto: { randomUUID: () => `ui-round-${++nextId}` },
    Date: { now: () => now },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.targets = new Set(); resizeCallbacks.push(this); }
      observe(target) { this.targets.add(target); }
      disconnect() { this.targets.clear(); }
    },
    setInterval: (callback) => { const id = ++nextId; timers.set(id, callback); return id; },
    clearInterval: (id) => timers.delete(id),
    console: { error: (...values) => errors.push(values) },
    $: (id) => nodes.get(id),
    separator: ".",
    state: { page: "calculator", language },
    translate: (key, values = {}) => realLabels
      ? catalog[language][key].replace(/\{([A-Za-z]+)\}/gu, (token, name) => values[name] ?? token)
      : `${key}${Object.keys(values).length ? ": " + Object.values(values).join(", ") : ""}`,
    announce: (message) => notices.push(message),
    fitNumbers() {},
    practice: null,
    SyntaxError,
  };
  const { PracticeUI, selectPage } = runInNewContext(`${controller}\n({ PracticeUI, selectPage });`, context);
  const ui = new PracticeUI();
  context.practice = ui;
  ui.init();
  await ui.work;
  return {
    ui, storage, nodes, timers, notices, errors, selectPage, shortcuts,
    resize(width, sizes = { actual: [40, 60], ideal: [40, 70], accepted: [110, 110] }) {
      for (const chart of nodes.get("practice-ranges").querySelectorAll(".practice-range-chart")) {
        chart.clientWidth = width;
        for (const [kind, measurements] of Object.entries(sizes)) {
          const group = chart.querySelector(`.practice-range-${kind}`);
          if (!group) continue;
          group.children.forEach((node, index) => { node.layoutWidth = Math.min(width, measurements[index]); });
        }
      }
      for (const observer of resizeCallbacks) if (observer.targets.size) observer.callback();
    },
    async run(operation) {
      await ui.perform(operation);
      if (autoActions && ui.round && ["check", "call", "pause"].includes(core.practiceActionView(ui.round, now).phase)) {
        now = ui.round.action.readyAt;
        ui.tick();
        await ui.work;
      }
    },
    enter(text) {
      nodes.get("practice-bet").value = text;
      nodes.get("practice-bet").listeners.input({ target: nodes.get("practice-bet") });
    },
    async advance(value) {
      now = value;
      for (const callback of [...timers.values()]) callback();
      await ui.work;
    },
  };
}
function findClass(node, name) {
  if (node.className === name) return node;
  for (const child of node.children) {
    const found = findClass(child, name);
    if (found) return found;
  }
  return null;
}
function rangeLabels(node) {
  return ["accepted", "actual"].map((kind) => findClass(node, `practice-range-${kind}`));
}
function displayedRange(node) {
  return findClass(findClass(node, "practice-range-accepted"), "practice-range-amount").textContent;
}
function visibleText(node) {
  if (node.hidden || node.className === "sr-only" || node.attributes["aria-hidden"] === "true") return "";
  return [node.content, ...node.children.map(visibleText)].join(" ");
}

test("Live UI shows the actual updated pot between answers without revealing the solution", async () => {
  const h = await harness();
  assert.equal(h.storage.writes, 0, "Calculator-only startup must not create saved data");
  await h.run(() => h.ui.start());
  assert.equal(h.ui.round.e, 3);
  assert.equal(h.nodes.get("practice-units").hidden, true);
  assert.equal(h.nodes.get("practice-shortcuts").hidden, true);
  assert.equal(h.nodes.get("practice-timer").hidden, true);
  assert.equal(h.nodes.get("practice-clock").hidden, true);
  assert.equal(h.nodes.get("practice-time-track").hidden, true);
  assert.equal(h.timers.size, 0);
  const first = Math.round(core.practiceTarget(h.ui.round).idealBet);
  h.enter(String(first));
  await h.run(() => h.ui.submit());
  assert.equal(h.ui.round.status, "playing");
  assert.equal(h.ui.store.data.live.stats.played, 0);
  assert.equal(h.nodes.get("practice-result").hidden, true);
  assert.equal(h.nodes.has("practice-explanation"), false);
  assert.equal(h.nodes.has("practice-explain"), false);
  assert.equal(h.nodes.get("practice-ranges").hidden, true);
  assert.equal(h.nodes.get("practice-ranges").children.length, 0);
  const pot = findClass(h.nodes.get("practice-table"), "table-pot");
  assert.ok(pot.textContent.includes(String(h.ui.round.initialPot)));
  assert.ok(pot.textContent.includes(String(h.ui.round.pot)));
  assert.ok(h.nodes.get("practice-action").textContent.includes(String(first)));
  assert.equal(h.nodes.get("practice-stage").dataset.state, "playing");
  assert.equal(h.nodes.get("practice-progress").children[0].dataset.complete, "true");
  assert.equal(h.nodes.get("practice-progress").children[1].dataset.current, "true");
  assert.equal(h.nodes.get("practice-table").dataset.phase, "hero");
  h.enter("1");
  await h.run(() => h.ui.submit());
  assert.equal(h.ui.round.status, "incorrect");
  assert.equal(h.ui.store.data.live.stats.played, 1);
  const bars = h.nodes.get("practice-ranges");
  assert.equal(bars.hidden, false);
  assert.equal(bars.children.length, 2);
  assert.ok(!bars.textContent.includes("expm1"));
  assert.ok(!bars.textContent.includes("min("));
});

test("game opens at the table with Play; starts do not leave help/settings in the play area", async () => {
  const h = await harness();
  assert.equal(h.nodes.get("practice-stage").dataset.state, "idle");
  assert.equal(h.nodes.get("practice-idle").hidden, false);
  assert.equal(h.nodes.get("practice-table").hidden, true);
  assert.equal(h.nodes.get("practice-spot").hidden, true);
  assert.equal(h.nodes.get("practice-current-stake").textContent, "1 / 2");
  h.nodes.get("practice-settings").open = true;
  h.nodes.get("practice-help").open = true;
  await h.run(() => h.ui.start());
  assert.equal(h.nodes.get("practice-settings").open, false);
  assert.equal(h.nodes.get("practice-help").open, false);
  assert.equal(h.nodes.get("practice-idle").hidden, true);
  assert.equal(h.nodes.get("practice-table").hidden, false);
  assert.equal(h.nodes.get("practice-table").dataset.motion, "deal");
  assert.equal(h.nodes.get("practice-stage").dataset.state, "playing");
});

test("Live betting keeps the input enabled through short operations and through the matching flop call", async () => {
  const h = await harness();
  await h.run(() => h.ui.start());
  h.enter(String(Math.round(core.practiceTarget(h.ui.round).idealBet)));
  const work = h.ui.perform(() => h.ui.submit());
  assert.equal(h.nodes.get("practice-bet").disabled, false);
  assert.equal(h.nodes.get("practice-bet").readOnly, true);
  await work;
  assert.equal(h.ui.round.status, "playing");
  assert.equal(h.nodes.get("practice-bet").blurred, undefined);
  assert.equal(h.nodes.get("practice-bet").readOnly, true);
  await h.advance(h.ui.round.action.readyAt);
  assert.equal(h.nodes.get("practice-bet").readOnly, false);
  assert.equal(h.nodes.get("practice-bet").value, "");
});

test("Online check bubble precedes hero controls and the full clock; toggles and hidden time cannot restart either", async () => {
  for (const language of ["en", "he"]) {
    const h = await harness(storagePort(), true, language, { autoActions: false, random: () => 0.75 });
    await h.run(() => h.ui.changeMode("online"));
    await h.run(() => h.ui.start());
    const table = h.nodes.get("practice-table");
    const { readyAt } = h.ui.round.action;
    const { deadline } = h.ui.round;
    const writes = h.storage.writes;
    assert.equal(table.dataset.phase, "check");
    assert.equal(table.dataset.playing, "false");
    assert.equal(findClass(table, "seat-speech").textContent, catalog[language].practiceCheck);
    assert.equal(findClass(table, "wager-chips"), null);
    assert.equal(h.nodes.get("practice-clock").hidden, true);
    assert.equal(h.nodes.get("practice-submit").disabled, true);
    assert.equal(h.nodes.get("practice-bet").disabled, false);
    assert.equal(h.nodes.get("practice-bet").readOnly, true);
    assert.ok(h.shortcuts.every((button) => button.disabled));
    assert.equal(JSON.parse(h.storage.getItem(core.PRACTICE_STORAGE_KEY)).pending.deadline, deadline);
    h.enter(core.practiceInputText(core.practiceTarget(h.ui.round).idealBet));
    await h.run(() => h.ui.submit());
    assert.equal(h.ui.round.answers.length, 0);
    assert.equal(h.ui.store.data.online.stats.played, 0);
    assert.equal(h.nodes.get("practice-bet-error").textContent, catalog[language].practiceWaitForAction);
    await h.advance(readyAt - 1);
    h.nodes.get("practice-bb").listeners.click();
    await h.ui.work;
    assert.equal(table.dataset.phase, "check");
    assert.equal(table.style.values["--action-delay"], `${1 - core.PRACTICE_ACTION_MS}ms`);
    assert.equal(h.ui.round.deadline, deadline);
    await h.advance(readyAt);
    assert.equal(table.dataset.phase, "hero");
    assert.equal(findClass(table, "seat-speech"), null);
    assert.equal(h.nodes.get("practice-timer").textContent, "30");
    assert.equal(h.nodes.get("practice-time-fill").style.values["--time-left"], "1");
    assert.equal(h.nodes.get("practice-submit").disabled, false);
    assert.equal(h.nodes.get("practice-bet").readOnly, false);
    assert.equal(h.nodes.get("practice-bet-error").hidden, true);
    h.selectPage("calculator");
    await h.advance(readyAt + 5000);
    h.selectPage("practice");
    assert.equal(h.nodes.get("practice-timer").textContent, "25");
    assert.equal(h.ui.round.deadline, deadline);
    assert.equal(h.storage.writes, writes);
    await h.advance(deadline + 100_000);
    assert.equal(h.ui.round.status, "timeout");
    assert.equal(h.ui.store.data.online.stats.played, 1);
    assert.equal(h.timers.size, 0);
    await h.run(() => h.ui.submit());
    assert.equal(h.ui.store.data.online.stats.played, 1);
    assert.equal(h.errors.length, 0);
  }
});

test("Live calls send both actual wagers to the visible pot, then check when in position, without leaking a solution", async () => {
  for (const language of ["en", "he"]) for (const checks of [false, true]) {
    const h = await harness(storagePort(), true, language, { autoActions: false, random: checks ? () => 0.75 : undefined });
    await h.run(() => h.ui.start());
    await h.advance(h.ui.round.action.readyAt);
    h.ui.round = { ...h.ui.round, e: 3, street: "flop", pot: 100, initialPot: 100, heroStack: 400, opponentStack: 245 };
    h.ui.render();
    h.enter("41");
    await h.run(() => h.ui.submit());
    const table = h.nodes.get("practice-table");
    const action = h.ui.round.action;
    const bubble = findClass(table, "seat-speech");
    assert.equal(table.dataset.phase, "call");
    assert.ok(bubble.textContent.includes(catalog[language].practiceCall));
    assert.ok(bubble.textContent.includes("41"));
    const chips = table.children.filter((node) => node.className === "wager-chips");
    assert.equal(chips.length, 2);
    for (const chip of chips) {
      assert.equal(chip.textContent, "41");
      assert.equal(chip.attributes["aria-hidden"], "true");
      assert.ok(chip.style.values["--seat-x"]);
    }
    assert.ok(findClass(table, "table-pot").textContent.includes("182"));
    assert.ok(findClass(table, "pot-start").textContent.includes("100"));
    assert.equal(findClass(table.children[0], "seat-stack").textContent, "359");
    const opponent = table.children.find((node) => node.className === "poker-seat opponent");
    assert.equal(findClass(opponent, "seat-stack").textContent, "204");
    assert.equal(h.nodes.get("practice-bet").readOnly, true);
    assert.equal(h.nodes.get("practice-bet").disabled, false);
    assert.equal(h.nodes.get("practice-submit").disabled, true);
    assert.equal(h.nodes.get("practice-clock").hidden, true);
    assert.equal(h.nodes.get("practice-ranges").children.length, 0);
    assert.equal(h.ui.store.data.live.stats.played, 0);
    await h.advance(action.startedAt + core.PRACTICE_ACTION_MS / 2);
    h.ui.localize();
    assert.equal(findClass(table, "seat-speech"), bubble, "An unchanged render must not replay the call");
    const callEnd = action.startedAt + core.PRACTICE_ACTION_MS;
    await h.advance(callEnd);
    assert.equal(table.dataset.phase, checks ? "pause" : "hero");
    assert.equal(findClass(table, "wager-chips"), null);
    if (checks) {
      assert.equal(findClass(table, "seat-speech"), null);
      assert.equal(h.nodes.get("practice-submit").disabled, true);
      assert.equal(h.nodes.get("practice-bet").readOnly, true);
      assert.equal(h.timers.size, 1);
      await h.advance(callEnd + 999);
      assert.equal(table.dataset.phase, "pause");
      assert.equal(findClass(table, "seat-speech"), null);
      assert.equal(h.nodes.get("practice-ranges").children.length, 0);
      await h.advance(callEnd + 1000);
      assert.equal(table.dataset.phase, "check");
      assert.equal(findClass(table, "seat-speech").textContent, catalog[language].practiceCheck);
      assert.equal(h.nodes.get("practice-submit").disabled, true);
    }
    await h.advance(action.readyAt);
    assert.equal(table.dataset.phase, "hero");
    assert.equal(findClass(table, "seat-speech"), null);
    assert.equal(h.nodes.get("practice-bet").readOnly, false);
    assert.equal(h.nodes.get("practice-submit").disabled, false);
    assert.equal(h.nodes.get("practice-ranges").children.length, 0);
    assert.equal(h.timers.size, 0);
    h.enter(String(Math.round(core.practiceTarget(h.ui.round).idealBet)));
    await h.run(() => h.ui.submit());
    assert.equal(h.ui.round.status, "correct");
    assert.equal(table.dataset.phase, "call");
    assert.equal(h.ui.store.data.live.stats.played, 1);
    assert.equal(h.nodes.get("practice-clock").hidden, true);
    const writes = h.storage.writes;
    await h.advance(h.ui.round.action.readyAt);
    assert.equal(table.dataset.phase, "complete");
    assert.equal(findClass(table, "wager-chips"), null);
    assert.equal(h.timers.size, 0);
    assert.equal(h.storage.writes, writes);
    assert.equal(h.errors.length, 0);
  }
});

test("reload or mode changes during the opening check still abandon Online exactly once", async () => {
  for (const reload of [false, true]) {
    const storage = storagePort();
    const h = await harness(storage, true, "en", { autoActions: false, random: () => 0.75 });
    await h.run(() => h.ui.changeMode("online"));
    await h.run(() => h.ui.start());
    assert.equal(h.nodes.get("practice-table").dataset.phase, "check");
    const deadline = h.ui.round.deadline;
    if (reload) {
      const restored = await harness(storage);
      assert.equal(restored.ui.store.data.online.stats.played, 1);
      await h.run(() => h.ui.submit());
      assert.equal(h.ui.round.status, "abandoned");
    } else await h.run(() => h.ui.changeMode("live"));
    await h.advance(deadline + 1000);
    assert.equal(h.ui.store.data.online.stats.played, 1);
    assert.equal(h.ui.store.data.online.stats.correct, 0);
    assert.equal(h.ui.store.data.pending, null);
    assert.equal(h.timers.size, 0);
  }
});

test("over-stack entry keeps Live open with a clear maximum and allows a corrected bet", async () => {
  for (const heroShorter of [true, false]) {
    const h = await harness(storagePort(), true);
    await h.run(() => h.ui.start());
    h.ui.round = { ...h.ui.round, e: 2, street: "turn", pot: 100, initialPot: 100,
      heroStack: heroShorter ? 150 : 240, opponentStack: heroShorter ? 240 : 150 };
    h.ui.render();
    const writes = h.storage.writes;
    h.enter("300");
    await h.run(() => h.ui.submit());
    assert.equal(h.ui.round.status, "playing");
    assert.equal(h.ui.round.answers.length, 0);
    assert.equal(h.ui.store.data.live.stats.played, 0);
    assert.equal(h.storage.writes, writes);
    assert.equal(h.nodes.get("practice-result").hidden, true);
    assert.equal(h.nodes.get("practice-stage").dataset.feedback, "");
    assert.equal(h.nodes.get("practice-stage").dataset.feedbackArrival, "false");
    assert.equal(h.nodes.get("practice-bet").value, "300");
    assert.equal(h.nodes.get("practice-bet").blurred, undefined);
    assert.equal(h.nodes.get("practice-bet-error").textContent, "Maximum bet: 150 Chips");
    assert.equal(h.nodes.get("practice-bet").attributes["aria-invalid"], "true");
    h.ui.localize();
    assert.equal(h.nodes.get("practice-bet-error").textContent, "Maximum bet: 150 Chips");
    h.enter("50");
    assert.equal(h.nodes.get("practice-bet-error").hidden, true);
    await h.run(() => h.ui.submit());
    assert.equal(h.ui.round.status, "correct");
    assert.equal(h.ui.store.data.live.stats.played, 1);
  }
});

test("over-stack Live turn entry preserves the accepted flop and its remaining stacks", async () => {
  const h = await harness();
  await h.run(() => h.ui.start());
  h.enter(String(Math.round(core.practiceTarget(h.ui.round).idealBet)));
  await h.run(() => h.ui.submit());
  const turn = h.ui.round;
  h.enter(String(Math.ceil(Math.max(turn.heroStack, turn.opponentStack)) + 1));
  await h.run(() => h.ui.submit());
  assert.equal(h.ui.round, turn);
  assert.equal(h.ui.round.answers.length, 1);
  assert.equal(h.nodes.get("practice-ranges").hidden, true);
  assert.equal(h.ui.store.data.live.stats.played, 0);
  h.enter(String(Math.round(core.practiceTarget(turn).idealBet)));
  await h.run(() => h.ui.submit());
  assert.equal(h.ui.round.status, "correct");
  assert.equal(h.ui.store.data.live.stats.played, 1);
});

test("Live 5/10 generates five-chip starting amounts but accepts exact non-multiple bets and calls", async () => {
  for (const language of ["en", "he"]) {
    const h = await harness(storagePort(), true, language);
    await h.run(() => h.ui.store.saveSettings("live", { smallBlind: 5, bigBlind: 10 }));
    await h.run(() => h.ui.start());
    for (const value of [h.ui.round.pot, h.ui.round.heroStack, h.ui.round.opponentStack]) assert.equal(value % 5, 0);
    assert.equal(h.nodes.get("practice-bet-hint").textContent, catalog[language].practiceLiveHint);
    h.ui.round = { ...h.ui.round, e: 3, street: "flop", pot: 100, initialPot: 100, heroStack: 400, opponentStack: 245 };
    h.ui.render();
    h.enter("41");
    await h.run(() => h.ui.submit());
    assert.equal(h.ui.round.status, "playing");
    assert.equal(h.ui.round.answers.length, 1);
    assert.equal(h.ui.store.data.live.stats.played, 0);
    assert.equal(h.nodes.get("practice-bet").attributes["aria-invalid"], "false");
    assert.equal(h.nodes.get("practice-result").hidden, true);
    assert.equal(h.ui.round.pot, 182);
    assert.equal(h.ui.round.heroStack, 359);
    assert.equal(h.ui.round.opponentStack, 204);
    assert.equal(h.nodes.get("practice-bet-error").hidden, true);
    assert.equal(h.nodes.get("practice-ranges").children.length, 0);
    const target = core.practiceTarget(h.ui.round);
    h.enter(String(Math.round(target.idealBet)));
    await h.run(() => h.ui.submit());
    assert.equal(h.ui.round.status, "correct");
    assert.equal(h.ui.store.data.live.stats.played, 1);
    for (const [index, bar] of h.nodes.get("practice-ranges").children.entries()) {
      const answer = h.ui.round.answers[index];
      assert.equal(displayedRange(bar), `${answer.minimumWholeBet} - ${answer.maximumWholeBet}`);
    }
    assert.equal(h.errors.length, 0);
  }
});

test("over-stack validation does not pause Online time and the maximum follows display units", async () => {
  const h = await harness(storagePort(), true);
  await h.run(() => h.ui.changeMode("online"));
  await h.run(() => h.ui.start());
  h.ui.round = { ...h.ui.round, heroStack: 150, opponentStack: 240 };
  const deadline = h.ui.round.deadline;
  h.enter("300");
  await h.run(() => h.ui.submit());
  assert.equal(h.ui.round.status, "playing");
  assert.equal(h.nodes.get("practice-bet-error").textContent, "Maximum bet: 150 Chips");
  h.nodes.get("practice-bb").listeners.click();
  await h.ui.work;
  assert.equal(h.nodes.get("practice-bet-error").textContent, "Maximum bet: 1500 BB");
  assert.equal(h.ui.round.deadline, deadline);
  await h.advance(deadline);
  assert.equal(h.ui.round.status, "timeout");
  assert.equal(h.ui.store.data.online.stats.played, 1);
});

test("active Live table uses short labels/badges rather than instruction paragraphs", async () => {
  const h = await harness(storagePort(), true);
  await h.run(() => h.ui.start());
  const surfaceText = () => [
    visibleText(h.nodes.get("practice-table")),
    visibleText(h.nodes.get("practice-action")),
    visibleText(h.nodes.get("practice-progress")),
  ].join(" ");
  assert.ok(surfaceText().split(/\s+/u).filter(Boolean).length <= 24);
  assert.ok(!surfaceText().includes("Out of hand"));
  assert.ok(!surfaceText().includes("Stack"));
  assert.ok(!surfaceText().includes("calculate"));
  h.enter(String(Math.round(core.practiceTarget(h.ui.round).idealBet)));
  await h.run(() => h.ui.submit());
  assert.equal(h.ui.round.status, "playing");
  assert.ok(surfaceText().split(/\s+/u).filter(Boolean).length <= 24);
  assert.ok(surfaceText().includes(String(h.ui.round.pot)));
  assert.ok(surfaceText().includes("Call"));
  assert.ok(!surfaceText().includes("remaining"));
  assert.ok(!surfaceText().includes("sizing"));
});

test("2E/3E header shows only the badge and streets-to-all-in goal throughout a round", async () => {
  for (const language of ["en", "he"]) for (const mode of ["live", "online"]) for (const e of [2, 3]) {
    const h = await harness(storagePort(), true, language);
    await h.run(() => h.ui.changeMode(mode));
    await h.run(() => h.ui.start());
    h.ui.round = { ...h.ui.round, e, street: e === 3 ? "flop" : "turn" };
    h.ui.render();
    assert.equal(h.nodes.get("practice-challenge").hidden, false);
    assert.equal(h.nodes.get("practice-kind").textContent, `${e}E`);
    const goal = catalog[language].practiceAllInGoal.replace("{streets}", String(e));
    assert.equal(h.nodes.get("practice-goal").textContent, goal);
    assert.equal(h.nodes.has("practice-task"), false);
    const total = mode === "live" && e === 3 ? 2 : 1;
    const deadline = h.ui.round.deadline;
    const ideal = core.practiceTarget(h.ui.round).idealBet;
    h.enter(String(mode === "live" ? Math.round(ideal) : ideal));
    await h.run(() => h.ui.submit());
    assert.equal(h.ui.round.deadline, deadline);
    if (total === 2) {
      assert.equal(h.ui.round.status, "playing");
      assert.equal(h.nodes.get("practice-result").hidden, true);
      assert.equal(findClass(h.nodes.get("practice-table"), "table-pot").textContent.includes(String(h.ui.round.pot)), true);
    } else {
      assert.equal(h.ui.round.status, "correct");
    }
    assert.equal(h.nodes.get("practice-kind").textContent, `${e}E`);
    assert.equal(h.nodes.get("practice-goal").textContent, goal);
  }
});

test("decorative backs show two cards per seat and a three/four-card board without disclosing any card values", async () => {
  for (const mode of ["live", "online"]) {
    const h = await harness();
    await h.run(() => h.ui.changeMode(mode));
    await h.run(() => h.ui.start());
    const table = h.nodes.get("practice-table");
    const assertBoard = (count) => {
      const board = findClass(table, "community-cards");
      assert.equal(board.children.length, count);
      assert.equal(board.attributes["aria-hidden"], "true");
      assert.equal(board.textContent, "");
      const seats = table.children.filter((node) => node.className?.startsWith("poker-seat "));
      assert.equal(seats.length, mode === "live" ? 9 : 6);
      for (const seat of seats) {
        const cards = findClass(seat, "hole-cards");
        assert.equal(cards.children.length, 2);
        assert.equal(cards.attributes["aria-hidden"], "true");
        assert.ok(cards.children.every((card) => card.className === "card-back" && card.textContent === ""));
      }
    };
    assertBoard(3);
    if (mode === "live") {
      h.enter(String(Math.round(core.practiceTarget(h.ui.round).idealBet)));
      await h.run(() => h.ui.submit());
      assert.equal(h.ui.round.status, "playing");
    } else {
      h.ui.round = { ...h.ui.round, e: 2, street: "turn" };
      h.ui.render();
    }
    assertBoard(4);
    assert.equal(h.nodes.get("practice-ranges").hidden, true);
  }
});

test("result bars replace Explain with clear SPR, pot percentages, accepted amounts and ideal sizing", async () => {
  const h = await harness(storagePort(), true);
  await h.run(() => h.ui.start());
  h.ui.round = { ...h.ui.round, e: 2, street: "turn", pot: 20, initialPot: 20,
    heroStack: 30, opponentStack: 40, initialHeroStack: 30, initialOpponentStack: 40 };
  h.enter("7");
  await h.run(() => h.ui.submit());
  assert.equal(h.nodes.has("practice-explain"), false);
  assert.equal(h.nodes.has("practice-explanation"), false);
  const bar = h.nodes.get("practice-ranges").children[0];
  assert.equal(findClass(bar, "practice-range-spr").textContent, "SPR 1.5");
  const labels = rangeLabels(bar);
  assert.equal(findClass(labels[0], "practice-range-percent").textContent, "45% - 55%");
  assert.equal(findClass(labels[1], "practice-range-percent").textContent, "35%");
  assert.equal(displayedRange(bar), "9 - 11");
  assert.equal(findClass(labels[1], "practice-range-amount").textContent, "7");
  const ideal = findClass(bar, "practice-range-ideal");
  assert.ok(ideal.textContent.includes("Correct bet"));
  assert.ok(ideal.textContent.includes("50%"));
  assert.equal(findClass(ideal, "practice-range-amount").textContent, "10");
  assert.ok(bar.attributes["aria-label"].includes("SPR 1.5"));
  assert.ok(bar.attributes["aria-label"].includes("35% of pot"));
});

test("Live feedback annotates the band with rounded, unit-free amounts and plain percentages", async () => {
  for (const language of ["en", "he"]) {
    const h = await harness(storagePort(), true, language);
    await h.run(() => h.ui.start());
    h.ui.round = { ...h.ui.round, e: 3, street: "flop", pot: 150, initialPot: 150, heroStack: 2510, opponentStack: 3000 };
    h.enter("200");
    await h.run(() => h.ui.submit());
    const bar = h.nodes.get("practice-ranges").children[0];
    const [accepted, actual] = rangeLabels(bar);
    const ideal = findClass(bar, "practice-range-ideal");
    assert.equal(displayedRange(bar), "162 - 176");
    assert.equal(findClass(ideal, "practice-range-amount").textContent, "169");
    assert.equal(findClass(ideal, "practice-range-percent").textContent, "113%");
    assert.equal(findClass(actual, "practice-range-amount").textContent, "200");
    assert.equal(findClass(actual, "practice-range-percent").textContent, "133%");
    assert.equal(findClass(accepted, "practice-range-percent").textContent, "108% - 117%");
    assert.equal(findClass(accepted, "practice-range-amount").textContent, "162 - 176");
    assert.ok(!bar.textContent.includes(catalog[language].practiceChips));
    assert.ok(!bar.textContent.includes("of pot"));
    assert.ok(!bar.textContent.includes("|"));
    assert.equal(h.ui.round.status, "incorrect");
    assert.notEqual(h.ui.round.answers[0].idealBet, 169);
    assert.ok(bar.attributes["aria-label"].includes(catalog[language].practiceChips));
    assert.equal(h.errors.length, 0);
  }
});

test("a correct-bet label keeps necessary BB decimals when whole-number rounding would suggest an incorrect bet", async () => {
  const h = await harness(storagePort(), true);
  await h.run(() => h.ui.changeMode("online"));
  await h.run(() => h.ui.start());
  h.ui.round = { ...h.ui.round, e: 2, street: "turn", pot: 500, initialPot: 500, heroStack: 390, opponentStack: 500,
    settings: { smallBlind: 50, bigBlind: 100 } };
  h.enter("150");
  await h.run(() => h.ui.submit());
  assert.equal(h.ui.round.status, "correct");
  const answer = h.ui.round.answers[0];
  h.nodes.get("practice-bb").listeners.click();
  await h.ui.work;
  const ideal = findClass(h.nodes.get("practice-ranges"), "practice-range-ideal");
  assert.equal(findClass(ideal, "practice-range-amount").textContent, "1.5 BB");
  assert.ok(answer.upper < 200);
  assert.equal(h.ui.round.answers[0], answer);
});

test("bet amounts and captions annotate the bar while only the SPR badge stays outside, with at most one decimal", async () => {
  for (const language of ["en", "he"]) for (const mode of ["live", "online"]) for (const spr of [3, 4.24]) {
    const h = await harness(storagePort(), true, language);
    await h.run(() => h.ui.changeMode(mode));
    await h.run(() => h.ui.start());
    h.ui.round = { ...h.ui.round, e: 2, street: "turn", pot: 100, initialPot: 100, heroStack: spr * 100, opponentStack: 500 };
    h.enter("150");
    await h.run(() => h.ui.submit());
    const bar = h.nodes.get("practice-ranges").children[0];
    const chart = findClass(bar, "practice-range-chart");
    const ratio = findClass(bar, "practice-range-spr");
    assert.equal(ratio.textContent, spr === 3 ? "SPR 3" : "SPR 4.2");
    assert.equal(chart.contains(ratio), false);
    assert.equal(findClass(bar, "practice-range-labels"), null);
    const [accepted, actual] = rangeLabels(bar);
    const ideal = findClass(bar, "practice-range-ideal");
    for (const group of [accepted, actual, ideal]) {
      assert.equal(chart.contains(group), true);
      assert.ok(findClass(group, "practice-range-percent"));
    }
    assert.ok(findClass(ideal, "practice-range-amount"));
    assert.ok(findClass(accepted, "practice-range-amount"));
    assert.equal(actual.children[0].className, "practice-range-value");
    assert.equal(actual.children[1].className, "practice-range-caption");
    assert.equal(findClass(actual, "practice-range-amount").textContent, "150");
    assert.equal(findClass(actual, "practice-range-caption").textContent, catalog[language].practiceActual);
    assert.equal(findClass(ideal, "practice-range-caption").textContent, catalog[language].practiceIdeal);
    assert.equal(findClass(accepted, "practice-range-caption").textContent, catalog[language].practiceRange);
    assert.ok(findClass(chart, "practice-range-bracket"));
    assert.ok(findClass(chart, "practice-range-band"));
    assert.ok(findClass(chart, "practice-range-marker"));
    assert.ok(findClass(chart, "practice-range-ideal-mark"));
    const axis = findClass(chart, "practice-range-axis");
    assert.equal(axis.children.length, 1);
    assert.equal(axis.children[0], findClass(chart, "practice-range-track"));
    assert.equal(findClass(chart, "practice-range-scale"), null);
    for (const kind of ["ideal", "actual", "accepted"]) assert.equal(findClass(chart, `practice-range-guide-${kind}`), null);
    assert.equal(chart.attributes["aria-hidden"], "true");
    assert.ok(bar.attributes["aria-label"].includes(ratio.textContent));
    assert.equal(h.ui.round.answers[0].spr, spr);
    assert.equal(h.errors.length, 0);
  }
});

test("resizing pins labels to their markers and stacks collisions without overflow or changes to grading", async () => {
  for (const language of ["en", "he"]) for (const mode of ["live", "online"]) for (const bet of [1, 45, 50, 55, 60, 150]) {
    const h = await harness(storagePort(), true, language);
    await h.run(() => h.ui.changeMode(mode));
    await h.run(() => h.ui.start());
    h.ui.round = { ...h.ui.round, e: 2, street: "turn", pot: 100, initialPot: 100, heroStack: 150, opponentStack: 240 };
    h.enter(String(bet));
    await h.run(() => h.ui.submit());
    const bar = h.nodes.get("practice-ranges").children[0];
    const chart = findClass(bar, "practice-range-chart");
    const markerKeys = ["--range-start", "--range-width", "--range-center", "--ideal-position", "--bet-position"];
    const original = markerKeys.map((key) => chart.style.getPropertyValue(key));
    const round = h.ui.round;
    const writes = h.storage.writes;
    const sizes = language === "he"
      ? { actual: [64, 90], ideal: [72, 100], accepted: [150, 130] }
      : { actual: [40, 60], ideal: [40, 70], accepted: [110, 110] };
    let firstLayout;
    for (const width of [200, 280, 390, 550, 900, 200]) {
      h.resize(width, sizes);
      const labels = [
        ["actual", "--bet-position"], ["ideal", "--ideal-position"], ["accepted", "--range-center"],
      ].map(([kind, property]) => {
        const group = chart.querySelector(`.practice-range-${kind}`);
        const position = parseFloat(group.style.getPropertyValue("--label-position"));
        const lane = Number(group.style.getPropertyValue("--label-lane"));
        const half = Math.max(...sizes[kind]) / 2;
        const anchor = parseFloat(chart.style.getPropertyValue(property)) / 100 * width;
        assert.ok(Math.abs(position - Math.max(half, Math.min(anchor, width - half))) < 1e-10);
        assert.ok(position - half >= -1e-10);
        assert.ok(position + half <= width + 1e-10);
        return { position, lane, half };
      });
      assert.equal(labels[0].lane, 0, "Your bet must stay closest to the bar");
      for (let index = 0; index < labels.length; index++) for (const other of labels.slice(index + 1)) {
        const label = labels[index];
        if (label.lane === other.lane) {
          assert.ok(Math.abs(label.position - other.position) >= label.half + other.half + 12 - 1e-10);
        }
      }
      assert.equal(Number(chart.style.getPropertyValue("--label-lanes")), Math.max(...labels.map((label) => label.lane)) + 1);
      if (bet === 50) assert.equal(chart.style.getPropertyValue("--label-lanes"), "3");
      if (width === 200) {
        if (firstLayout) assert.deepEqual(labels, firstLayout);
        else firstLayout = labels;
      }
      assert.deepEqual(markerKeys.map((key) => chart.style.getPropertyValue(key)), original);
    }
    for (const kind of ["ideal", "actual", "accepted"]) {
      const group = findClass(chart, `practice-range-${kind}`);
      assert.equal(group.children[0].className, "practice-range-value");
      assert.equal(group.children[1].className, "practice-range-caption");
    }
    assert.equal(h.ui.round, round);
    assert.equal(h.storage.writes, writes);
    assert.equal(h.errors.length, 0);
  }
});

test("a submitted 100 stays directly above its diamond beside the 102-122 range, rather than a detached column", async () => {
  const h = await harness(storagePort(), true);
  await h.run(() => h.ui.start());
  h.ui.round = { ...h.ui.round, e: 2, street: "turn", pot: 215, initialPot: 215, heroStack: 341, opponentStack: 500 };
  h.enter("100");
  await h.run(() => h.ui.submit());
  const chart = findClass(h.nodes.get("practice-ranges"), "practice-range-chart");
  const actual = findClass(chart, "practice-range-actual");
  const ideal = findClass(chart, "practice-range-ideal");
  const accepted = findClass(chart, "practice-range-accepted");
  const widths = { actual: [34, 48], ideal: [34, 66], accepted: [84, 82] };
  h.resize(516, widths);
  assert.equal(findClass(actual, "practice-range-amount").textContent, "100");
  assert.equal(findClass(ideal, "practice-range-amount").textContent, "112");
  assert.equal(displayedRange(chart), "102 - 122");
  assert.equal(h.ui.round.answers[0].actualBet, 100);
  const position = parseFloat(actual.style.getPropertyValue("--label-position"));
  const marker = parseFloat(chart.style.getPropertyValue("--bet-position")) / 100 * 516;
  assert.ok(Math.abs(position - marker) < 1e-10);
  assert.equal(actual.style.getPropertyValue("--label-lane"), "0");
  assert.equal(ideal.style.getPropertyValue("--label-lane"), "0");
  assert.equal(accepted.style.getPropertyValue("--label-lane"), "1");
  assert.equal(h.ui.rangeObserver.targets.size, 1);
  assert.ok(h.ui.rangeObserver.targets.has(findClass(chart, "practice-range-track")));
  await h.run(() => h.ui.start());
  assert.equal(h.ui.rangeObserver.targets.size, 0);
});

test("Online UI shortcuts fill, unit toggles preserve amount, and Calculator navigation keeps the deadline", async () => {
  const h = await harness();
  await h.run(() => h.ui.changeMode("online"));
  await h.run(() => h.ui.start());
  const deadline = h.ui.round.deadline;
  const writes = h.storage.writes;
  h.shortcuts[0].listeners.click();
  await h.ui.work;
  assert.equal(h.ui.draft.value, core.practiceShortcut(h.ui.round, 0.33));
  assert.equal(h.ui.round.answers.length, 0);
  assert.equal(h.shortcuts[0].dataset.selected, "true");
  const ideal = core.practiceTarget(h.ui.round).idealBet;
  h.enter(core.practiceInputText(ideal));
  assert.ok(h.shortcuts.every((button) => button.dataset.selected === "false"));
  const exact = h.ui.draft.value;
  await h.nodes.get("practice-bb").listeners.click();
  await h.ui.work;
  assert.equal(h.ui.draft.value, exact);
  await h.nodes.get("practice-chips").listeners.click();
  await h.ui.work;
  assert.equal(h.ui.draft.value, exact);
  assert.equal(h.ui.round.deadline, deadline);
  assert.equal(h.storage.writes, writes);
  assert.equal(h.ui.round.answers.length, 0);
  h.selectPage("practice");
  h.selectPage("calculator");
  assert.equal(h.nodes.get("practice").hidden, true);
  assert.equal(h.ui.round.status, "playing");
  assert.equal(h.ui.round.deadline, deadline);
  assert.equal(h.timers.size, 1);
  await h.advance(deadline);
  assert.equal(h.ui.round.status, "timeout");
  assert.equal(h.ui.store.data.online.stats.played, 1);
  assert.equal(h.ui.store.data.online.stats.correct, 0);
  assert.equal(h.timers.size, 0);
  const finalWrites = h.storage.writes;
  await h.run(() => h.ui.submit());
  await h.advance(deadline + 100_000);
  assert.equal(h.storage.writes, finalWrites);
  assert.equal(h.ui.store.data.online.stats.played, 1);
});

test("HUD countdown drains from the deadline; help/settings do not pause or reset an Online round", async () => {
  const h = await harness();
  await h.run(() => h.ui.changeMode("online"));
  await h.run(() => h.ui.start());
  const deadline = h.ui.round.deadline;
  assert.equal(h.nodes.get("practice-timer").textContent, "30");
  assert.equal(h.nodes.get("practice-time-fill").style.values["--time-left"], "1");
  const settings = h.nodes.get("practice-settings");
  const help = h.nodes.get("practice-help");
  help.open = true;
  settings.open = true;
  settings.listeners.toggle();
  assert.equal(help.open, false);
  await h.advance(deadline - 15_000);
  assert.equal(h.nodes.get("practice-timer").textContent, "15");
  assert.equal(h.nodes.get("practice-time-fill").style.values["--time-left"], "0.5");
  assert.equal(h.nodes.get("practice-clock").dataset.urgent, "false");
  settings.listeners.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(settings.open, false);
  assert.equal(settings.querySelector("summary").focused, true);
  assert.equal(h.ui.round.deadline, deadline);
  await h.advance(deadline - 4000);
  assert.equal(h.nodes.get("practice-clock").dataset.urgent, "true");
  await h.advance(deadline);
  assert.equal(h.nodes.get("practice-stage").dataset.state, "timeout");
  assert.equal(h.nodes.get("practice-stage").dataset.feedback, "");
  assert.equal(h.nodes.get("practice-result-text").className, "");
  assert.equal(h.nodes.get("practice-clock").hidden, true);
  assert.equal(h.nodes.get("practice-result").dataset.correct, "false");
  const ranges = h.nodes.get("practice-ranges");
  assert.equal(ranges.hidden, false);
  assert.equal(ranges.children.length, 1);
  assert.equal(findClass(ranges, "practice-range-marker"), null);
  assert.ok(findClass(ranges, "practice-range-ideal-mark"));
  assert.ok(ranges.textContent.includes("practiceNoBet"));
  h.resize(220);
  const chart = findClass(ranges, "practice-range-chart");
  assert.equal(chart.style.getPropertyValue("--label-lanes"), "2");
  assert.equal(chart.style.getPropertyValue("--bet-position"), "");
  const accepted = findClass(chart, "practice-range-accepted");
  const ideal = findClass(chart, "practice-range-ideal");
  assert.notEqual(accepted.style.getPropertyValue("--label-lane"), ideal.style.getPropertyValue("--label-lane"));
  assert.equal(findClass(chart, "practice-range-actual"), null);
});

test("table and shortcut input suppress floating-point tails and keep the exact submission", async () => {
  const h = await harness();
  await h.run(() => h.ui.changeMode("online"));
  await h.run(() => h.ui.start());
  h.ui.round = { ...h.ui.round, e: 2, street: "turn", pot: 46.63, initialPot: 46.63,
    heroStack: 161.80000000000004, opponentStack: 100.123456 };
  h.ui.render();
  assert.equal(h.ui.number(161.80000000000004), "161.8");
  assert.equal(h.ui.number(100.123456), "100.12");
  assert.equal(h.ui.number(0.001), "<0.01");
  h.shortcuts[0].listeners.click();
  await h.ui.work;
  assert.equal(h.nodes.get("practice-bet").value, "15.39");
  assert.equal(h.ui.draft.value, 46.63 * 0.33);
  await h.run(() => h.ui.submit());
  assert.equal(h.ui.round.answers[0].actualBet, 46.63 * 0.33);
});

test("successful rounds update the streak HUD and stop at feedback until manual Next", async () => {
  const h = await harness();
  await h.run(() => h.ui.changeMode("online"));
  for (let round = 1; round <= 2; round++) {
    await h.run(() => h.ui.start());
    h.enter(core.practiceInputText(core.practiceTarget(h.ui.round).idealBet));
    await h.run(() => h.ui.submit());
    assert.equal(h.nodes.get("practice-stage").dataset.state, "correct");
    assert.equal(h.nodes.get("practice-result").dataset.correct, "true");
    assert.equal(h.nodes.get("practice-streak").textContent, String(round));
    assert.equal(h.nodes.get("practice-played").textContent, String(round));
    assert.equal(h.nodes.get("practice-ranges").hidden, false);
    assert.equal(h.timers.size, 0);
    const id = h.ui.round.id;
    await h.advance(100_000 * round);
    assert.equal(h.ui.round.id, id);
    assert.equal(h.nodes.get("practice-result").hidden, false);
  }
  assert.equal(h.nodes.get("practice-result-streak").hidden, false);
});

test("graded form submissions show visual outcomes with clear localized screen-reader labels, once per answer", async () => {
  for (const language of ["en", "he"]) for (const correct of [true, false]) {
    const h = await harness(storagePort(), true, language);
    await h.run(() => h.ui.changeMode("online"));
    await h.run(() => h.ui.start());
    const stage = h.nodes.get("practice-stage");
    assert.equal(stage.dataset.feedback, "");
    const bet = correct ? core.practiceTarget(h.ui.round).idealBet : 0.001;
    h.enter(core.practiceInputText(bet));
    let prevented = false;
    h.nodes.get("practice-bet-form").listeners.submit({ preventDefault() { prevented = true; } });
    await h.ui.work;
    assert.equal(prevented, true);
    assert.equal(h.ui.round.answers[0].actualBet, bet);
    assert.equal(stage.dataset.feedback, correct ? "correct" : "incorrect");
    assert.equal(stage.dataset.feedbackArrival, "true");
    assert.equal(h.nodes.get("practice-result").dataset.arrival, "true");
    assert.ok(h.nodes.get("practice-result-icon").innerHTML.includes(correct ? "m5 12 4 4L19 6" : "m7 7 10 10M7 17 17 7"));
    assert.equal(h.nodes.get("practice-result-text").className, "sr-only");
    assert.equal(h.nodes.get("practice-result-text").textContent, catalog[language][correct ? "practiceCorrect" : "practiceIncorrect"]);
    assert.equal(h.nodes.get("practice-ranges").hidden, false);
    const writes = h.storage.writes;
    h.ui.render();
    assert.equal(stage.dataset.feedbackArrival, "false");
    assert.equal(h.nodes.get("practice-result").dataset.arrival, "false");
    assert.equal(h.storage.writes, writes);
    await h.run(() => h.ui.start());
    assert.equal(stage.dataset.feedback, "");
    assert.equal(h.nodes.get("practice-result").hidden, true);
  }
});

test("result bars place low, accepted boundary and high bets against the graded range in either Online unit", async () => {
  for (const language of ["en", "he"]) for (const bet of [40, 45, 50, 55, 60]) {
    const h = await harness(storagePort(), true, language);
    await h.run(() => h.ui.changeMode("online"));
    await h.run(() => h.ui.start());
    h.ui.round = { ...h.ui.round, e: 2, street: "turn", pot: 100, initialPot: 100, heroStack: 150, opponentStack: 240 };
    h.enter(String(bet));
    await h.run(() => h.ui.submit());
    const container = h.nodes.get("practice-ranges");
    assert.equal(container.hidden, false);
    assert.equal(container.children.length, 1);
    const bar = container.children[0];
    const chart = findClass(bar, "practice-range-chart");
    const geometry = { ...chart.style.values };
    const left = parseFloat(geometry["--range-start"]);
    const right = left + parseFloat(geometry["--range-width"]);
    const marker = parseFloat(geometry["--bet-position"]);
    const correct = bet >= 45 && bet <= 55;
    assert.equal(bar.dataset.correct, String(correct));
    assert.ok(left >= 0 && right <= 100 && marker >= 0 && marker <= 100);
    assert.equal(marker >= left - 1e-10 && marker <= right + 1e-10, correct);
    assert.equal(displayedRange(bar), "~45 - 55");
    assert.ok(bar.textContent.includes(String(bet)));
    assert.equal(bar.attributes.role, "img");
    assert.ok(bar.attributes["aria-label"].includes(catalog[language][correct ? "practiceWithinRange"
      : bet < 45 ? "practiceBelowRange" : "practiceAboveRange"]));
    const spr = findClass(bar, "practice-range-spr").textContent;
    assert.equal(spr, "SPR 1.5");
    const labels = rangeLabels(bar);
    const percentages = labels.map((label) => findClass(label, "practice-range-percent").textContent);
    assert.ok(percentages[0].includes("45% - 55%"));
    assert.ok(percentages[1].includes(`${bet}%`));
    assert.ok(bar.attributes["aria-label"].includes("45% - 55%"));
    const writes = h.storage.writes;
    h.nodes.get("practice-bb").listeners.click();
    await h.ui.work;
    const converted = container.children[0];
    assert.deepEqual(findClass(converted, "practice-range-chart").style.values, geometry);
    assert.equal(displayedRange(converted), "~450 - 550 BB");
    assert.ok(rangeLabels(converted)[0].textContent.includes("BB"));
    assert.ok(converted.attributes["aria-label"].includes("BB"));
    assert.equal(findClass(converted, "practice-range-spr").textContent, spr);
    assert.deepEqual(rangeLabels(converted).map((label) => findClass(label, "practice-range-percent").textContent), percentages);
    assert.equal(h.storage.writes, writes);
    assert.equal(h.ui.round.answers[0].actualBet, bet);
    await h.run(() => h.ui.start());
    assert.equal(container.hidden, true);
    assert.equal(container.children.length, 0);
  }
});

test("result ranges and percentages stay whole while SPR shows one decimal, without rounding grading or unit conversions", async () => {
  for (const language of ["en", "he"]) {
    const h = await harness(storagePort(), true, language);
    await h.run(() => h.ui.changeMode("online"));
    await h.run(() => h.ui.start());
    h.ui.round = { ...h.ui.round, e: 3, street: "flop", pot: 36, initialPot: 36, heroStack: 75, opponentStack: 100 };
    const deadline = h.ui.round.deadline;
    h.enter("15");
    await h.run(() => h.ui.submit());
    const answer = h.ui.round.answers[0];
    assert.equal(answer.spr, 75 / 36);
    assert.ok(answer.lower > 11 && answer.upper < 15);
    assert.equal(h.ui.round.status, "incorrect");
    assert.equal(answer.actualBet, 15);
    const container = h.nodes.get("practice-ranges");
    const bar = container.children[0];
    const labels = rangeLabels(bar);
    assert.equal(displayedRange(bar), "~11 - 15");
    const percentages = labels.map((label) => findClass(label, "practice-range-percent").textContent);
    assert.ok(percentages[0].includes("31% - 41%"));
    assert.ok(percentages[1].includes("42%"));
    assert.ok(findClass(bar, "practice-range-ideal").textContent.includes("36%"));
    assert.equal(findClass(bar, "practice-range-spr").textContent, "SPR 2.1");
    assert.ok(bar.attributes["aria-label"].includes("SPR 2.1"));
    assert.ok(bar.attributes["aria-label"].includes("11.32"));
    assert.ok(bar.attributes["aria-label"].includes("14.92"));
    assert.ok(bar.attributes["aria-label"].includes(catalog[language].practiceAboveRange));
    for (const percent of bar.querySelectorAll(".practice-range-percent")) {
      assert.doesNotMatch(percent.textContent, /\d+\.\d+%/u);
    }
    const geometry = { ...findClass(bar, "practice-range-chart").style.values };
    assert.ok(parseFloat(geometry["--bet-position"]) > parseFloat(geometry["--range-start"]) + parseFloat(geometry["--range-width"]));
    const writes = h.storage.writes;
    h.nodes.get("practice-bb").listeners.click();
    await h.ui.work;
    const converted = container.children[0];
    const convertedLabels = rangeLabels(converted);
    assert.equal(displayedRange(converted), "~113 - 149 BB");
    assert.deepEqual(convertedLabels.map((label) => findClass(label, "practice-range-percent").textContent), percentages);
    assert.deepEqual(findClass(converted, "practice-range-chart").style.values, geometry);
    assert.equal(findClass(converted, "practice-range-spr").textContent, "SPR 2.1");
    assert.equal(h.ui.round.answers[0], answer);
    assert.equal(h.ui.round.deadline, deadline);
    assert.equal(h.storage.writes, writes);
  }
});

test("Live result bars use each street's recorded whole-number range and actual called pot only after the round ends", async () => {
  for (const correct of [true, false]) {
    const h = await harness(storagePort(), true);
    await h.run(() => h.ui.start());
    h.ui.round = { ...h.ui.round, e: 3, street: "flop", pot: 97, initialPot: 97, heroStack: 240, opponentStack: 431 };
    h.enter("40");
    await h.run(() => h.ui.submit());
    assert.equal(h.ui.round.pot, 177);
    assert.equal(h.nodes.get("practice-ranges").hidden, true);
    assert.equal(h.nodes.get("practice-ranges").children.length, 0);
    assert.equal(findClass(h.nodes.get("practice-table"), "table-pot").textContent.includes("177"), true);
    const turn = core.practiceTarget(h.ui.round);
    h.enter(String(correct ? Math.round(turn.idealBet) : 1));
    await h.run(() => h.ui.submit());
    const bars = h.nodes.get("practice-ranges").children;
    assert.equal(bars.length, 2);
    for (const [index, bar] of bars.entries()) {
      const answer = h.ui.round.answers[index];
      assert.equal(bar.dataset.correct, String(answer.correct));
      assert.equal(displayedRange(bar), `${answer.minimumWholeBet} - ${answer.maximumWholeBet}`);
      assert.ok(bar.textContent.includes(catalog.en[answer.street]));
      assert.ok(!bar.textContent.includes("~"));
      assert.ok(bar.attributes["aria-label"].includes(String(answer.actualBet)));
      assert.equal(findClass(bar, "practice-range-spr").textContent, `SPR ${core.practiceInputText(answer.spr, ".", 1)}`);
      const actual = rangeLabels(bar)[1];
      assert.equal(findClass(actual, "practice-range-percent").textContent, `${core.practiceInputText(answer.actualBet / answer.pot * 100, ".", 0)}%`);
    }
    assert.equal(findClass(bars[0], "practice-range-spr").textContent, "SPR 2.5");
    assert.equal(findClass(bars[1], "practice-range-spr").textContent, "SPR 1.1");
    assert.ok(bars[0].textContent.includes("41%"));
    assert.equal(h.ui.store.data.live.stats.played, 1);
    assert.equal(h.ui.store.data.live.stats.correct, Number(correct));
  }
});

test("out-of-position flop 2E shows Flop to Turn and ends after one bet with a final result bar", async () => {
  for (const language of ["en", "he"]) for (const mode of ["live", "online"]) {
    const h = await harness(storagePort(), true, language);
    await h.run(() => h.ui.changeMode(mode));
    await h.run(() => h.ui.start());
    const count = mode === "live" ? 9 : 6;
    h.ui.round = { ...h.ui.round, e: 2, street: "flop", pot: 100, initialPot: 100, heroStack: 150, opponentStack: 240,
      seating: core.practiceSeating(count, 1, count - 2) };
    h.ui.render();
    assert.equal(h.ui.round.seating.opponentChecks, false);
    assert.equal(h.nodes.get("practice-kind").textContent, "2E");
    const progress = h.nodes.get("practice-progress").children;
    assert.deepEqual(Array.from(progress, (step) => step.textContent), [catalog[language].flop, catalog[language].turn]);
    assert.equal(progress[0].dataset.current, "true");
    assert.equal(findClass(h.nodes.get("practice-table"), "community-cards").children.length, 3);
    assert.equal(h.nodes.get("practice-ranges").hidden, true);
    const deadline = h.ui.round.deadline;
    h.enter("50");
    await h.run(() => h.ui.submit());
    assert.equal(h.ui.round.status, "correct");
    assert.equal(h.ui.round.answers.length, 1);
    assert.equal(h.ui.store.data[mode].stats.played, 1);
    assert.equal(h.ui.round.deadline, deadline);
    assert.equal(h.timers.size, 0);
    assert.equal(h.nodes.get("practice-ranges").children.length, 1);
    const bar = h.nodes.get("practice-ranges").children[0];
    assert.equal(findClass(bar, "practice-range-spr").textContent, "SPR 1.5");
    assert.ok(bar.textContent.includes("50%"));
  }
});

test("result bar scales include near-zero and all-in answers without going past the available stack", async () => {
  for (const [stack, bet] of [[0.01, 0.001], [0.01, 0.01], [150, 150]]) {
    const h = await harness();
    await h.run(() => h.ui.changeMode("online"));
    await h.run(() => h.ui.start());
    h.ui.round = { ...h.ui.round, e: 2, street: "turn", pot: 100, heroStack: stack, opponentStack: 240 };
    h.enter(String(bet));
    await h.run(() => h.ui.submit());
    const bar = h.nodes.get("practice-ranges").children[0];
    const values = findClass(bar, "practice-range-chart").style.values;
    for (const value of Object.values(values)) assert.ok(Number.isFinite(parseFloat(value)) && parseFloat(value) >= 0 && parseFloat(value) <= 100);
    assert.ok(h.ui.round.answers[0].upper <= stack);
    if (bet === stack) assert.equal(values["--bet-position"], "100%");
    if (stack === 0.01) {
      assert.equal(findClass(bar, "practice-range-spr").textContent, "SPR <0.1");
      assert.equal(displayedRange(bar), "~0 - 0.01");
    }
    if (bet === 0.001) {
      const actual = rangeLabels(bar)[1];
      assert.ok(findClass(actual, "practice-range-percent").textContent.includes("<1%"));
    }
  }
});

test("Live flop gets a positive effect without scoring or revealing a solution; an incorrect turn replaces it", async () => {
  const h = await harness(storagePort(), true);
  await h.run(() => h.ui.start());
  h.enter(String(Math.round(core.practiceTarget(h.ui.round).idealBet)));
  await h.run(() => h.ui.submit());
  const stage = h.nodes.get("practice-stage");
  assert.equal(stage.dataset.feedback, "correct");
  assert.equal(stage.dataset.feedbackArrival, "true");
  const check = findClass(h.nodes.get("practice-table"), "seat-feedback");
  assert.equal(check.attributes["aria-hidden"], "true");
  assert.ok(check.innerHTML.includes("m5 12 4 4L19 6"));
  assert.ok(h.nodes.get("practice-action").textContent.includes("Correct bet"));
  assert.equal(h.nodes.get("practice-result").hidden, true);
  assert.equal(h.nodes.get("practice-ranges").children.length, 0);
  assert.equal(findClass(h.nodes.get("practice-table"), "table-pot").textContent.includes(String(h.ui.round.pot)), true);
  assert.equal(h.ui.store.data.live.stats.played, 0);
  h.ui.render();
  assert.equal(stage.dataset.feedbackArrival, "false");
  h.enter("1");
  await h.run(() => h.ui.submit());
  assert.equal(stage.dataset.feedback, "incorrect");
  assert.equal(stage.dataset.feedbackArrival, "true");
  assert.equal(findClass(h.nodes.get("practice-table"), "seat-feedback"), null);
  assert.equal(h.nodes.get("practice-result-text").textContent, "Incorrect bet");
  assert.equal(h.ui.store.data.live.stats.played, 1);
  assert.equal(h.ui.store.data.live.stats.correct, 0);
});

test("an explicit final bet focuses Next for keyboard play; background timeout does not steal focus", async () => {
  const h = await harness();
  h.selectPage("practice");
  await h.run(() => h.ui.changeMode("online"));
  await h.run(() => h.ui.start());
  h.enter(core.practiceInputText(core.practiceTarget(h.ui.round).idealBet));
  await h.run(() => h.ui.submit());
  assert.equal(h.nodes.get("practice-next").focused, true);
  h.nodes.get("practice-next").focused = false;
  await h.run(() => h.ui.start());
  h.selectPage("calculator");
  await h.advance(h.ui.round.deadline);
  assert.equal(h.ui.round.status, "timeout");
  assert.equal(h.nodes.get("practice-next").focused, false);
});

test("feedback can convert units even if the timed-out input was unfinished", async () => {
  const h = await harness();
  await h.run(() => h.ui.changeMode("online"));
  await h.run(() => h.ui.start());
  h.enter("unfinished");
  await h.advance(h.ui.round.deadline);
  assert.equal(h.ui.round.status, "timeout");
  h.nodes.get("practice-bb").listeners.click();
  await h.ui.work;
  assert.equal(h.ui.onlineUnit, "bb");
  assert.equal(h.ui.round.status, "timeout");
});

test("corrupt saved data has an explicit, confirmed practice-only recovery action", async () => {
  const storage = storagePort();
  storage.setItem(core.PRACTICE_STORAGE_KEY, "{");
  storage.setItem("unrelated", "preserve");
  const h = await harness(storage);
  assert.equal(h.ui.blocked, true);
  assert.equal(h.nodes.get("practice-repair").hidden, false);
  h.nodes.get("practice-repair").listeners.click();
  await h.ui.work;
  assert.equal(h.ui.blocked, false);
  assert.equal(h.ui.ready, true);
  assert.equal(storage.getItem("unrelated"), "preserve");
  assert.equal(h.ui.store.data.live.stats.played, 0);
  assert.equal(h.nodes.get("practice-storage-error").hidden, true);
});

test("mode/stake changes settle unfinished Online rounds without a clock-reset loophole", async () => {
  const h = await harness();
  await h.run(() => h.ui.changeMode("online"));
  await h.run(() => h.ui.start());
  h.nodes.get("practice-stake").value = "1";
  await h.run(() => h.ui.saveSettings());
  assert.equal(h.ui.round, null);
  assert.equal(h.ui.store.data.online.stats.played, 1);
  assert.equal(h.ui.store.data.online.stats.correct, 0);
  assert.equal(h.ui.store.data.online.settings.bigBlind, 0.5);
  await h.run(() => h.ui.start());
  assert.equal(h.ui.round.settings.bigBlind, 0.5);
  await h.run(() => h.ui.changeMode("live"));
  assert.equal(h.ui.store.data.online.stats.played, 2);
  assert.equal(h.ui.store.data.live.stats.played, 0);
  assert.equal(h.timers.size, 0);
});

test("reload settles a journal once; the original UI cannot later submit a stale success", async () => {
  const first = await harness();
  await first.run(() => first.ui.changeMode("online"));
  await first.run(() => first.ui.start());
  const reloaded = await harness(first.storage);
  assert.equal(reloaded.ui.store.data.online.stats.played, 1);
  first.enter(core.practiceInputText(core.practiceTarget(first.ui.round).idealBet));
  await first.run(() => first.ui.submit());
  assert.equal(first.ui.round.status, "abandoned");
  assert.equal(first.ui.store.data.online.stats.played, 1);
  assert.equal(first.ui.store.data.online.stats.correct, 0);
  assert.equal(first.timers.size, 0);
});

test("a failed result write pauses practice with explicit feedback and no success result", async () => {
  const h = await harness();
  await h.run(() => h.ui.changeMode("online"));
  await h.run(() => h.ui.start());
  h.enter(core.practiceInputText(core.practiceTarget(h.ui.round).idealBet));
  h.storage.fail = true;
  await h.run(() => h.ui.submit());
  assert.equal(h.ui.blocked, true);
  assert.equal(h.nodes.get("practice-storage-error").hidden, false);
  assert.equal(h.nodes.get("practice-start").disabled, true);
  assert.equal(h.nodes.get("practice-result").hidden, true);
  assert.equal(h.nodes.get("practice-stage").dataset.feedback, "");
  assert.equal(h.nodes.get("practice-ranges").hidden, true);
  assert.equal(h.nodes.get("practice-ranges").children.length, 0);
  assert.equal(h.ui.store.data.online.stats.correct, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.errors.length, 1);
  h.storage.fail = false;
  const loaded = await harness(h.storage);
  assert.equal(loaded.ui.store.data.online.stats.played, 1);
  assert.equal(loaded.ui.store.data.online.stats.correct, 0);
});
