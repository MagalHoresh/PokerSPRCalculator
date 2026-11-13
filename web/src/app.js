import {
  evaluate, amount, percent, sprText, fraction, RAISES, parseAmount, CalculationError,
  PRACTICE_STAKES, PRACTICE_STORAGE_KEY, PracticeStore, PracticeBetDraft, practiceInputText,
  createPracticeRound, submitPracticeBet, expirePracticeRound, practiceTarget,
  practiceTableView, practiceShortcut, practiceDisplayValue, validatePracticeSettings, practiceActionView, PRACTICE_ACTION_MS,
} from "./core.js";
import { t } from "./i18n.js";

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const fields = ["pot", "stack", "facingBet"];
const numbers = [...document.querySelectorAll("output.number")];
const copies = [...document.querySelectorAll("[data-copy]")];
const separator = new Intl.NumberFormat(navigator.language).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
const state = { language: "en", theme: "system", page: "calculator", pot: "", stack: "", facingBet: "", tab: "postflop", submitted: { postflop: false, preflop: false } };
let practice;
const mobile = matchMedia("(max-width: 600px), (max-width: 960px) and (max-height: 600px)");
const reference = document.querySelector(".reference");
const referenceMarker = document.createComment("Desktop reference");
reference.before(referenceMarker);
const labels = { spr: "sprName" };
const values = new Map();
let feedbackTimer;
let fitFrame;
const translate = (key, values = {}) => t(state.language, key, { separator, ...values });
const copyIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="3" width="12" height="15" rx="2"/><path d="M5 7H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1"/></svg>';

// Native selects may match :focus-visible after pointer use, unlike buttons.
document.addEventListener("pointerdown", () => { root.dataset.focusInput = "pointer"; }, true);
document.addEventListener("keydown", (event) => {
  if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) root.dataset.focusInput = "keyboard";
}, true);

for (const streets of [2, 3]) {
  labels[`percent-${streets}`] = `streetPercentage${streets}`;
  for (let number = 1; number <= streets; number++) labels[`bet-${streets}-${number}`] = `betCopy${streets}-${number}`;
}
for (const kind of RAISES) labels[`raise-${kind.id}`] = `raiseLabel-${kind.id}`;
for (const button of copies) button.innerHTML = copyIcon;

function announce(message, error = false, quiet = false) {
  clearTimeout(feedbackTimer);
  $("feedback").textContent = message;
  $("feedback").dataset.error = String(error);
  $("feedback").classList.toggle("sr-only", quiet);
  feedbackTimer = setTimeout(() => { $("feedback").textContent = ""; }, error ? 6500 : 2600);
}

function put(id, result) {
  const node = $(id);
  const text = result === null ? "—" : result.text ?? translate(result.key);
  node.textContent = text;
  node.classList.toggle("empty", result === null);
  node.setAttribute("aria-label", `${translate(labels[id])}: ${result === null ? translate("unavailable") : text}`);
  node.title = node.getAttribute("aria-label");
  values.set(id, result?.copy ?? null);
}

function errorText(error) {
  const text = translate(error.key);
  return error.field ? translate(`${error.field === "pot" ? "pot" : error.field === "stack" ? "stack" : "facingBet"}Error`, { message: text }) : text;
}

function update() {
  const result = evaluate(state, separator);
  for (const field of fields) {
    const input = $(field);
    const parsed = result.inputs[field];
    const active = document.activeElement === input;
    const typingZero = active && ["0", `0${separator}`].includes(input.value.trim());
    const required = state.submitted[field === "facingBet" ? "preflop" : "postflop"] && parsed.status === "Empty";
    const message = required ? translate("requiredAmount") : parsed.status === "Invalid" && !typingZero ? translate(parsed.key)
      : parsed.status === "Incomplete" && !active ? translate("finishAmount") : "";
    const error = $(`${field}-error`);
    error.textContent = message;
    error.hidden = !message;
    input.setAttribute("aria-invalid", String(Boolean(message)));
  }
  put("spr", result.geometric ? sprText(result.geometric.spr, separator) : null);
  for (const streets of [2, 3]) {
    const plan = result.geometric?.[streets === 2 ? "twoStreet" : "threeStreet"];
    put(`percent-${streets}`, plan ? percent(plan.fraction, separator) : null);
    for (let number = 1; number <= streets; number++) put(`bet-${streets}-${number}`, plan ? amount(plan.bets[number - 1], separator) : null);
    $(`over-${streets}`).hidden = !(plan?.fraction > 1 + 1e-12);
    placePlanWarning(streets);
  }
  for (const kind of RAISES) {
    const size = result.preflop?.find((entry) => entry.id === kind.id);
    put(`raise-${kind.id}`, size ? amount(size.amount, separator) : null);
  }
  $("geometric-status").textContent = result.geometricError ? errorText(result.geometricError)
    : translate(result.geometric ? result.geometric.twoStreet.fraction > 1 + 1e-12 ? "overPotNote" : "callRule" : "waitingForAmounts");
  $("geometric-status").classList.toggle("error", Boolean(result.geometricError));
  $("geometric-status").dataset.mathError = String(Boolean(result.geometricError && !result.geometricError.field));
  $("preflop-status").textContent = result.preflopError ? errorText(result.preflopError) : translate("totalTargets");
  $("preflop-status").classList.toggle("error", Boolean(result.preflopError));
  for (const button of copies) {
    const label = translate(labels[button.dataset.copy]);
    button.disabled = values.get(button.dataset.copy) === null;
    button.setAttribute("aria-label", translate("copyLabel", { label }));
    button.title = translate("copyHelp", { label });
  }
  fitNumbers();
}

// Full values remain intact; only their font shrinks for exceptionally long amounts.
function fitNumbers() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    const practiceAmounts = document.querySelectorAll(".seat-stack:has(.practice-amount-unit), .table-pot > strong:has(.practice-amount-unit)");
    for (const node of [...numbers, ...practiceAmounts]) {
      node.style.removeProperty("font-size");
      delete node.dataset.wrap;
      const available = node.clientWidth;
      if (!available || node.scrollWidth <= available) continue;
      const size = parseFloat(getComputedStyle(node).fontSize);
      if (mobile.matches && node.closest(".bet-step, .raise-target") && size * available / node.scrollWidth < 20) {
        node.dataset.wrap = "true";
        node.style.fontSize = "20px";
        continue;
      }
      let lower = 10;
      let upper = size;
      while (upper - lower > 0.25) {
        const middle = (lower + upper) / 2;
        node.style.fontSize = `${middle}px`;
        if (node.scrollWidth <= node.clientWidth) lower = middle;
        else upper = middle;
      }
      node.style.fontSize = `${Math.floor(lower * 4) / 4}px`;
    }
  });
}

function localize() {
  root.lang = state.language;
  root.dir = state.language === "he" ? "rtl" : "ltr";
  document.title = state.language === "he" ? `${translate("pageTitle")} | Poker SPR Calculator` : translate("pageTitle");
  for (const node of document.querySelectorAll("[data-t]")) node.textContent = translate(node.dataset.t);
  $("lang-en").setAttribute("aria-pressed", String(state.language === "en"));
  $("lang-he").setAttribute("aria-pressed", String(state.language === "he"));
  document.querySelector(".language-switch").setAttribute("aria-label", translate("language"));
  $("theme").setAttribute("aria-label", translate("theme"));
  $("new-hand").title = translate("resetHelp");
  $("new-hand").setAttribute("aria-label", translate("newHand"));
  $("mobile-help").setAttribute("aria-label", translate("helpReference"));
  document.querySelector(".mobile-tabs").setAttribute("aria-label", translate("calculators"));
  document.querySelectorAll("[data-go]").forEach((button) => button.setAttribute("aria-label", `${translate("go")}: ${translate("finishEntry")}`));
  $("assumptions-close").setAttribute("aria-label", translate("close"));
  $("github").setAttribute("aria-label", translate("github"));
  $("github").title = translate("githubSource");
  $("github-dialog").title = translate("githubSource");
  $("units-note").textContent = translate("units");
  fields.forEach((field, index) => {
    const input = $(field);
    input.placeholder = `0${separator}0`;
    input.title = translate("keyFocus", { label: translate(field === "pot" ? "potLabel" : field === "stack" ? "stackLabel" : "facingBet"), key: index + 1 });
  });
  renderReference();
  update();
  practice?.localize();
}

function renderReference() {
  for (const [id, ratios] of [["reference-body", [2, 3, 4, 7, 10, 13, 30]], ["mobile-reference-body", [2, 3, 4, 5]]]) {
    const rows = [2, 3].map((streets) => {
      const row = document.createElement("tr");
      const header = document.createElement("th");
      header.scope = "row";
      header.dir = "ltr";
      header.textContent = `${streets}e`;
      row.append(header);
      for (const ratio of ratios) {
        const cell = document.createElement("td");
        cell.dir = "ltr";
        cell.textContent = percent(fraction(ratio, streets), separator).text;
        row.append(cell);
      }
      return row;
    });
    $(id).replaceChildren(...rows);
  }
}

function placePlanWarning(streets) {
  const warning = $(`over-${streets}`);
  const plan = warning.closest(".street-plan");
  const target = mobile.matches ? plan.querySelector(".plan-top > div") : plan;
  if (warning.parentElement !== target) target.append(warning);
  plan.querySelector(`[data-t="streets${streets}"]`).hidden = mobile.matches && !warning.hidden;
}

function focusField(field) {
  if (mobile.matches) selectTab(field === "facingBet" ? "preflop" : "postflop");
  $(field).focus({ preventScroll: false });
  $(field).select();
}

function newHand() {
  state.submitted = { postflop: false, preflop: false };
  for (const field of fields) {
    state[field] = "";
    $(field).value = "";
  }
  update();
  if (!mobile.matches && matchMedia("(pointer: fine)").matches) focusField("pot");
  else {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (!mobile.matches) $("pot").scrollIntoView({ block: "center", behavior: "instant" });
  }
  announce(translate("handCleared"));
}

for (const field of fields) {
  $(field).addEventListener("input", (event) => { state[field] = event.target.value; update(); });
  $(field).addEventListener("focus", update);
  $(field).addEventListener("blur", update);
  $(field).addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    if (field !== "pot" && mobile.matches) finishEntry(field === "facingBet" ? "preflop" : "postflop");
    else if (field !== "pot" && matchMedia("(pointer: coarse)").matches) $(field).blur();
    else focusField(fields[(fields.indexOf(field) + 1) % fields.length]);
  });
}

for (const language of ["en", "he"]) {
  const button = $(language === "en" ? "lang-en" : "lang-he");
  button.addEventListener("pointerdown", (event) => {
    // Do not blur the currently edited amount just to change its language/alignment.
    if (fields.some((field) => $(field) === document.activeElement)) event.preventDefault();
  });
  button.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch" || !event.isPrimary
        || !fields.some((field) => $(field) === document.activeElement)) return;
    // WebKit can suppress the touch click after the focus-preserving pointerdown.
    const box = button.getBoundingClientRect();
    if (event.clientX >= box.left && event.clientX <= box.right
        && event.clientY >= box.top && event.clientY <= box.bottom) button.click();
  });
  button.addEventListener("click", () => {
    if (state.language === language) return;
    const active = document.activeElement;
    const selection = active instanceof HTMLInputElement ? [active.selectionStart, active.selectionEnd] : null;
    state.language = language;
    $("feedback").textContent = "";
    localize();
    if (selection && active instanceof HTMLInputElement) active.setSelectionRange(...selection);
  });
}

$("theme").addEventListener("change", (event) => {
  state.theme = event.target.value;
  root.dataset.theme = state.theme;
  updateThemeColor();
});
function updateThemeColor() {
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue("--canvas").trim();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateThemeColor);
$("new-hand").addEventListener("click", newHand);
document.addEventListener("keydown", (event) => {
  if (state.page !== "calculator") return;
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (["1", "2", "3"].includes(event.key)) { event.preventDefault(); focusField(fields[Number(event.key) - 1]); }
    if (event.code === "KeyN") { event.preventDefault(); newHand(); }
  }
});

for (const button of copies) button.addEventListener("click", async () => {
  const text = values.get(button.dataset.copy);
  if (typeof text !== "string") { announce(translate("noValidAmount"), true); return; }
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
    await navigator.clipboard.writeText(text);
    announce(translate("copied", { label: translate(labels[button.dataset.copy]), amount: text }));
  } catch (error) {
    console.warn("Explicit clipboard copy unavailable:", error.name);
    const range = document.createRange();
    range.selectNodeContents($(button.dataset.copy));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    announce(translate("copyManual"), true);
  }
});

const dialog = $("assumptions-dialog");
let dialogOpener = $("assumptions-open");
for (const id of ["assumptions-open", "mobile-help"]) $(id).addEventListener("click", () => {
  dialogOpener = $(id);
  dialog.showModal();
});
$("assumptions-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => dialogOpener.focus({ preventScroll: true }));
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
function selectTab(tab) {
  state.tab = tab;
  for (const kind of ["postflop", "preflop"]) {
    const button = $(`tab-${kind}`);
    button.setAttribute("aria-selected", String(kind === tab));
    button.tabIndex = kind === tab ? 0 : -1;
    const panel = $(kind === "postflop" ? "postflop-panel" : "preflop");
    panel.hidden = mobile.matches && kind !== tab;
    if (mobile.matches) panel.setAttribute("role", "tabpanel");
    else panel.removeAttribute("role");
    panel.setAttribute("aria-labelledby", mobile.matches ? `tab-${kind}` : `${kind}-heading`);
  }
  fitNumbers();
}
function mobileLayout() {
  if (mobile.matches) $("dialog-reference").append(reference);
  else referenceMarker.after(reference);
  $("stack").enterKeyHint = mobile.matches ? "go" : "done";
  $("facingBet").enterKeyHint = mobile.matches ? "go" : "done";
  for (const streets of [2, 3]) placePlanWarning(streets);
  selectTab(state.tab);
}
for (const kind of ["postflop", "preflop"]) {
  const button = $(`tab-${kind}`);
  button.addEventListener("click", () => selectTab(kind));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tab = event.key === "Home" ? "postflop" : event.key === "End" ? "preflop" : kind === "postflop" ? "preflop" : "postflop";
    selectTab(tab);
    $(`tab-${tab}`).focus();
  });
}
function finishEntry(kind) {
  state.submitted[kind] = true;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  update();
  const required = kind === "postflop" ? ["pot", "stack"] : ["facingBet"];
  const invalid = required.find((field) => $(field).getAttribute("aria-invalid") === "true");
  if (invalid) {
    const label = translate(invalid === "pot" ? "potLabel" : invalid === "stack" ? "stackLabel" : "facingBet");
    announce(`${label}: ${$(`${invalid}-error`).textContent}`, true, true);
  } else {
    const status = $(kind === "postflop" ? "geometric-status" : "preflop-status");
    announce(status.classList.contains("error") ? status.textContent : translate("amountsReady"), status.classList.contains("error"), true);
  }
}
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => finishEntry(button.dataset.go)));
document.querySelector(".skip-link").addEventListener("click", (event) => {
  if (state.page === "practice") {
    event.preventDefault();
    $("practice-heading").focus();
    return;
  }
  if (!mobile.matches) return;
  event.preventDefault();
  selectTab("postflop");
  $("pot").focus();
});
mobile.addEventListener("change", mobileLayout);
new ResizeObserver(fitNumbers).observe($("calculator"));
window.addEventListener("resize", fitNumbers);

class PracticeUI {
  constructor() {
    this.mode = "live";
    this.onlineUnit = "chips";
    this.round = null;
    this.store = new PracticeStore(null);
    this.draft = new PracticeBetDraft("live", this.store.data.live.settings.bigBlind, separator);
    this.work = Promise.resolve();
    this.busy = 0;
    this.ready = false;
    this.blocked = false;
    this.timer = null;
    this.timerQueued = false;
    this.fieldErrors = {};
    this.selectedShortcut = null;
    this.rangeObserver = new ResizeObserver(() => this.positionRangeLabels());
    for (const id of ["practice-settings", "practice-help"]) {
      const menu = $(id);
      menu.addEventListener("toggle", () => {
        if (menu.open) $(id === "practice-settings" ? "practice-help" : "practice-settings").open = false;
      });
      menu.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        menu.open = false;
        menu.querySelector("summary").focus({ preventScroll: true });
      });
    }
    document.addEventListener("pointerdown", (event) => {
      for (const id of ["practice-settings", "practice-help"]) {
        if (!$(id).contains(event.target)) $(id).open = false;
      }
    });
    for (const mode of ["live", "online"]) {
      $(`practice-${mode}`).addEventListener("click", () => this.perform(() => this.changeMode(mode)));
    }
    $("practice-start").addEventListener("click", () => this.perform(() => this.start()));
    $("practice-next").addEventListener("click", () => this.perform(() => this.start()));
    $("practice-bet").addEventListener("input", (event) => {
      this.draft.setText(event.target.value);
      this.selectedShortcut = null;
      this.renderShortcuts();
      this.fieldError("practice-bet", "");
    });
    $("practice-bet-form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.perform(() => this.submit());
    });
    document.querySelectorAll("[data-practice-size]").forEach((button) => {
      button.addEventListener("click", () => this.perform(() => {
        if (!this.heroActing()) return;
        if (this.expire()) return;
        this.draft.fill(practiceShortcut(this.round, Number(button.dataset.practiceSize)));
        this.selectedShortcut = button.dataset.practiceSize;
        $("practice-bet").value = this.draft.text;
        this.fieldError("practice-bet", "");
      }));
    });
    for (const unit of ["chips", "bb"]) {
      $(`practice-${unit}`).addEventListener("click", () => this.perform(() => {
        if (this.mode !== "online") return;
        this.expire();
        try { this.draft.toggle(unit); }
        catch (error) {
          if (!(error instanceof CalculationError)) throw error;
          this.fieldError("practice-bet", error.key);
          return;
        }
        this.onlineUnit = unit;
        $("practice-bet").value = this.draft.text;
        if (this.fieldErrors["practice-bet"] === "practiceMaximumBet") this.fieldError("practice-bet", "practiceMaximumBet");
      }));
    }
    $("practice-stake").addEventListener("change", () => {
      $("practice-custom").hidden = $("practice-stake").value !== "custom";
      this.fieldError("practice-settings", "");
    });
    $("practice-settings-form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.perform(() => this.saveSettings());
    });
    $("practice-reset").addEventListener("click", () => {
      if (this.playing() || !window.confirm(translate("practiceConfirmReset"))) return;
      this.perform(() => {
        this.useStore(() => this.store.reset(this.mode));
        announce(translate("practiceResetDone"));
      });
    });
    $("practice-repair").addEventListener("click", () => {
      if (!window.confirm(translate("practiceConfirmRepair"))) return;
      this.blocked = false;
      this.perform(() => {
        this.useStore(() => this.store.clear());
        this.round = null;
        this.ready = true;
        $("practice-storage-error").hidden = true;
        $("practice-repair").hidden = true;
        this.renderSettings();
        announce(translate("practiceResetDone"));
      }, true);
    });
    window.addEventListener("storage", (event) => {
      if (event.key === PRACTICE_STORAGE_KEY || event.key === null) this.perform(() => {});
    });
    document.addEventListener("visibilitychange", () => this.tick());
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) this.perform(() => this.abandon());
      else this.tick();
    });
  }
  useStore(operation) {
    try { return operation(); }
    catch (cause) { throw new Error("practiceStorageError", { cause }); }
  }
  perform(operation, initializing = false) {
    this.busy++;
    this.disableControls();
    this.work = this.work.then(async () => {
      if (this.blocked) return;
      if (!navigator.locks?.request) throw new CalculationError("practiceLockError");
      await navigator.locks.request(PRACTICE_STORAGE_KEY, () => {
        if (!initializing) {
          this.useStore(() => this.store.refresh());
          if (this.playing() && this.mode === "online" && this.store.data.pending?.id !== this.round.id) {
            this.round = { ...this.round, status: "abandoned" };
            this.stopTimer();
            this.draft.clear();
            $("practice-bet").value = "";
            announce(translate("practiceOtherTab"), true);
          }
        }
        operation();
      });
    }).catch((error) => {
      console.error("Practice operation failed:", error);
      const key = error instanceof CalculationError ? error.key : "practiceStorageError";
      const corrupt = key === "practiceStorageError" && (error.cause instanceof SyntaxError || error.cause instanceof CalculationError);
      const message = translate(corrupt ? "practiceStorageRepair" : key);
      if (key === "practiceStorageError" || key === "practiceLockError") {
        this.blocked = true;
        this.storageMessageKey = corrupt ? "practiceStorageRepair" : key;
        this.stopTimer();
        $("practice-storage-error").textContent = message;
        $("practice-storage-error").hidden = false;
        $("practice-repair").hidden = !corrupt;
      }
      announce(message, true);
    }).finally(() => {
      this.busy--;
      this.render();
      if (this.nextFocusRequested && this.busy === 0) {
        this.nextFocusRequested = false;
        if (!this.blocked && !this.playing() && state.page === "practice") $("practice-next").focus({ preventScroll: true });
      }
    });
    return this.work;
  }
  init() {
    this.perform(() => {
      this.useStore(() => {
        this.store.storage = window.localStorage;
        if (this.store.recover()) announce(translate("practiceRecovered"), true);
      });
      this.ready = true;
      this.renderSettings();
    }, true);
  }
  playing() { return this.round?.status === "playing"; }
  heroActing() { return this.playing() && practiceActionView(this.round).phase === "hero"; }
  closeMenus() {
    $("practice-settings").open = false;
    $("practice-help").open = false;
  }
  unit() { return this.mode === "online" ? this.onlineUnit : "chips"; }
  decimal(value) {
    return value > 0 && value < 0.005 ? `<0${separator}01` : practiceInputText(value, separator, 2);
  }
  number(value) {
    const bigBlind = this.round?.settings.bigBlind ?? this.store.data[this.mode].settings.bigBlind;
    return this.decimal(practiceDisplayValue(value, this.unit(), bigBlind));
  }
  amountNode(value) {
    const amount = document.createElement("bdi");
    amount.dir = "ltr";
    amount.textContent = this.number(value);
    if (this.unit() === "bb") {
      const unit = document.createElement("span");
      unit.className = "practice-amount-unit";
      unit.textContent = ` ${this.unitName()}`;
      amount.append(unit);
    }
    return amount;
  }
  unitName() { return translate(this.unit() === "bb" ? "practiceBB" : "practiceChips"); }
  fieldError(prefix, key) {
    this.fieldErrors[prefix] = key;
    const message = key ? translate(key, key === "practiceMaximumBet" ? {
      maximum: this.number(Math.min(this.round.heroStack, this.round.opponentStack)), unit: this.unitName(),
    } : {}) : "";
    $(`${prefix}-error`).textContent = message;
    $(`${prefix}-error`).hidden = !message;
    if (prefix === "practice-bet") $("practice-bet").setAttribute("aria-invalid", String(Boolean(message)));
    else for (const id of ["practice-small-blind", "practice-big-blind"]) $(id).setAttribute("aria-invalid", String(Boolean(message)));
  }
  start() {
    if (this.playing()) return;
    const settings = this.store.data[this.mode].settings;
    const next = createPracticeRound({ mode: this.mode, settings, id: crypto.randomUUID() });
    this.useStore(() => this.store.begin(next));
    this.round = next;
    this.closeMenus();
    this.draft = new PracticeBetDraft(this.mode, settings.bigBlind, separator);
    if (this.mode === "online") this.draft.toggle(this.onlineUnit);
    $("practice-bet").value = "";
    this.selectedShortcut = null;
    this.fieldError("practice-bet", "");
  }
  submit() {
    if (!this.playing() || this.expire()) return;
    if (!this.heroActing()) { this.fieldError("practice-bet", "practiceWaitForAction"); return; }
    const parsed = this.draft.value === null
      ? this.draft.setText($("practice-bet").value) : { status: "Valid", value: this.draft.value };
    if (parsed.status !== "Valid") {
      this.fieldError("practice-bet", parsed.key ?? "requiredAmount");
      return;
    }
    let next;
    try { next = submitPracticeBet(this.round, parsed.value); }
    catch (error) {
      if (!(error instanceof CalculationError) || error.key !== "practiceMaximumBet") throw error;
      this.fieldError("practice-bet", error.key);
      return;
    }
    if (next.status === "playing") {
      this.round = next;
      this.draft.clear();
      $("practice-bet").value = "";
      this.fieldError("practice-bet", "");
    } else {
      this.finish(next);
      $("practice-bet").blur();
      this.nextFocusRequested = true;
    }
  }
  finish(next) {
    const recorded = this.useStore(() => this.store.finish(next));
    this.round = recorded ? next : { ...next, status: "abandoned" };
    this.stopTimer();
    this.fieldError("practice-bet", "");
    this.draft.clear();
    this.selectedShortcut = null;
    $("practice-bet").value = "";
  }
  expire() {
    if (!this.round) return false;
    const next = expirePracticeRound(this.round);
    if (next === this.round) return false;
    this.finish(next);
    return true;
  }
  tick() {
    if (this.round) this.renderTable();
    if (this.heroActing() && this.fieldErrors["practice-bet"] === "practiceWaitForAction") this.fieldError("practice-bet", "");
    this.renderTimer();
    this.disableControls();
    this.syncTimer();
    if (!this.playing() || this.round.deadline === null || Date.now() < this.round.deadline || this.timerQueued || this.blocked) return;
    this.timerQueued = true;
    this.perform(() => this.expire()).finally(() => { this.timerQueued = false; });
  }
  stopTimer() { clearInterval(this.timer); this.timer = null; }
  syncTimer() {
    const phase = this.round ? practiceActionView(this.round).phase : "complete";
    const needed = !this.blocked && ((this.playing() && this.mode === "online") || ["bet", "check", "call"].includes(phase));
    if (needed && this.timer === null) this.timer = setInterval(() => this.tick(), 100);
    else if (!needed && this.timer !== null) this.stopTimer();
  }
  abandon() {
    if (!this.playing()) return;
    if (this.mode === "online") {
      const next = expirePracticeRound(this.round);
      this.finish(next === this.round ? { ...this.round, status: "abandoned" } : next);
      announce(translate("practiceAbandoned"), true);
    }
    this.stopTimer();
  }
  changeMode(mode) {
    if (mode === this.mode) return;
    this.abandon();
    this.mode = mode;
    this.closeMenus();
    this.round = null;
    this.draft = new PracticeBetDraft(mode, this.store.data[mode].settings.bigBlind, separator);
    if (mode === "online") this.draft.toggle(this.onlineUnit);
    $("practice-bet").value = "";
    this.selectedShortcut = null;
    this.fieldError("practice-bet", "");
    this.fieldError("practice-settings", "");
    this.renderSettings();
  }
  saveSettings() {
    let settings;
    if ($("practice-stake").value === "custom") {
      const small = parseAmount($("practice-small-blind").value, separator);
      const big = parseAmount($("practice-big-blind").value, separator);
      try { settings = validatePracticeSettings({ smallBlind: small.value, bigBlind: big.value }); }
      catch (error) {
        if (!(error instanceof CalculationError)) throw error;
        this.fieldError("practice-settings", error.key);
        return;
      }
    } else {
      const preset = PRACTICE_STAKES[this.mode][Number($("practice-stake").value)];
      settings = { smallBlind: preset[0], bigBlind: preset[1] };
    }
    const previous = this.store.data[this.mode].settings;
    if (previous.smallBlind !== settings.smallBlind || previous.bigBlind !== settings.bigBlind) {
      this.abandon();
      this.useStore(() => this.store.saveSettings(this.mode, settings));
      this.round = null;
      this.draft = new PracticeBetDraft(this.mode, settings.bigBlind, separator);
      if (this.mode === "online") this.draft.toggle(this.onlineUnit);
      $("practice-bet").value = "";
    }
    this.fieldError("practice-settings", "");
    this.renderSettings();
    $("practice-settings").open = false;
    announce(translate("practiceSaved"));
  }
  renderSettings(preserve = false) {
    const select = $("practice-stake");
    const settings = this.store.data[this.mode].settings;
    const selected = PRACTICE_STAKES[this.mode].findIndex(([small, big]) => small === settings.smallBlind && big === settings.bigBlind);
    const value = preserve && select.options.length ? select.value : selected === -1 ? "custom" : String(selected);
    const options = PRACTICE_STAKES[this.mode].map(([small, big], index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${practiceInputText(small, separator)} / ${practiceInputText(big, separator)}`;
      option.dir = "ltr";
      return option;
    });
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = translate("practiceCustom");
    select.replaceChildren(...options, custom);
    select.value = value;
    if (!preserve) {
      $("practice-small-blind").value = practiceInputText(settings.smallBlind, separator);
      $("practice-big-blind").value = practiceInputText(settings.bigBlind, separator);
    }
    $("practice-custom").hidden = value !== "custom";
  }
  localize() {
    document.querySelector(".page-nav").setAttribute("aria-label", `${translate("practiceCalculator")} / ${translate("practiceTitle")}`);
    document.querySelector(".practice-mode").setAttribute("aria-label", translate("practiceMode"));
    document.querySelector(".practice-stats").setAttribute("aria-label", translate("practiceStats"));
    $("practice-settings").querySelector("summary").setAttribute("aria-label", translate("practiceSettings"));
    $("practice-help").querySelector("summary").setAttribute("aria-label", translate("practiceHowTo"));
    $("practice-units").setAttribute("aria-label", translate("practiceUnits"));
    $("practice-shortcuts").setAttribute("aria-label", translate("practiceOnlineHint"));
    $("practice-table").setAttribute("aria-label", translate("practiceTable"));
    $("practice-progress").setAttribute("aria-label", translate("practiceStreets"));
    document.querySelector(".skip-link").textContent = translate(state.page === "practice" ? "practiceHeading" : "mainJump");
    for (const prefix of ["practice-bet", "practice-settings"]) this.fieldError(prefix, this.fieldErrors[prefix] ?? "");
    if (this.storageMessageKey) $("practice-storage-error").textContent = translate(this.storageMessageKey);
    this.renderSettings(true);
    this.render();
  }
  disableControls() {
    const disabled = !this.ready || this.blocked || this.busy > 0;
    document.querySelectorAll("#practice button:not(#practice-repair), #practice select").forEach((node) => {
      node.disabled = disabled;
    });
    for (const id of ["practice-bet", "practice-small-blind", "practice-big-blind"]) {
      $(id).disabled = !this.ready || this.blocked;
      $(id).readOnly = this.busy > 0;
    }
    const waiting = this.playing() && !this.heroActing();
    $("practice-bet").readOnly = this.busy > 0 || waiting;
    $("practice-submit").disabled = disabled || !this.heroActing();
    $("practice-bet-form").setAttribute("aria-busy", String(waiting));
    document.querySelectorAll("[data-practice-size]").forEach((button) => { button.disabled = disabled || !this.heroActing(); });
    $("practice-reset").disabled = disabled || this.playing();
    $("practice-repair").disabled = this.busy > 0;
  }
  render() {
    const stats = this.store.data[this.mode].stats;
    $("practice-played").textContent = String(stats.played);
    $("practice-accuracy").textContent = `${stats.played ? Math.round(stats.correct / stats.played * 100) : 0}%`;
    $("practice-streak").textContent = String(stats.current);
    $("practice-best").textContent = String(stats.best);
    document.querySelector(".streak-score").dataset.active = String(stats.current > 0);
    $("practice-rules").textContent = translate(this.mode === "live" ? "practiceLiveRules" : "practiceOnlineRules");
    for (const mode of ["live", "online"]) $(`practice-${mode}`).setAttribute("aria-pressed", String(mode === this.mode));
    for (const unit of ["chips", "bb"]) $(`practice-${unit}`).setAttribute("aria-pressed", String(unit === this.unit()));
    $("practice-units").hidden = this.mode !== "online";
    const stake = this.round?.settings ?? this.store.data[this.mode].settings;
    $("practice-current-stake").textContent = `${practiceInputText(stake.smallBlind, separator)} / ${practiceInputText(stake.bigBlind, separator)}`;
    $("practice-current-stake").dir = "ltr";
    $("practice-current-stake").setAttribute("aria-label", `${translate("practiceStake")}: ${$("practice-current-stake").textContent}`);
    $("practice-stage").dataset.state = this.round?.status ?? "idle";
    $("practice-stage").dataset.mode = this.mode;
    const answer = this.round?.answers.at(-1);
    const feedback = !this.blocked && answer && ["playing", "correct", "incorrect"].includes(this.round.status)
      ? answer.correct ? "correct" : "incorrect" : "";
    const feedbackRevision = feedback ? `${this.round.id}:${this.round.answers.length}:${feedback}` : null;
    $("practice-stage").dataset.feedback = feedback;
    $("practice-stage").dataset.feedbackArrival = String(feedbackRevision !== null && feedbackRevision !== this.feedbackRevision);
    this.feedbackRevision = feedbackRevision;
    $("practice-idle").hidden = Boolean(this.round);
    $("practice-table").hidden = !this.round;
    $("practice-spot").hidden = !this.round;
    $("practice-bet").inputMode = this.mode === "live" ? "numeric" : "decimal";
    $("practice-bet-label").textContent = `${translate("practiceBet")} · ${this.unitName()}`;
    $("practice-input-unit").textContent = this.unitName();
    $("practice-bet-hint").textContent = translate(this.mode === "live" ? "practiceLiveHint" : "practiceOnlineHint");
    this.renderShortcuts();
    $("practice-challenge").hidden = !this.round;
    $("practice-progress").hidden = !this.round;
    if (this.round) {
      const round = this.round;
      $("practice-kind").textContent = `${round.e}E`;
      $("practice-goal").textContent = translate("practiceAllInGoal", { streets: round.e });
      $("practice-bet-form").hidden = !this.playing();
      $("practice-result").hidden = this.playing();
      $("practice-result-text").textContent = translate({
        correct: "practiceCorrect", incorrect: "practiceIncorrect", timeout: "practiceTimeout", abandoned: "practiceAbandoned",
        playing: "practiceYourTurn",
      }[round.status]);
      $("practice-result-text").className = ["correct", "incorrect"].includes(round.status) ? "sr-only" : "";
      $("practice-result-text").dataset.correct = String(round.status === "correct");
      $("practice-result").dataset.correct = String(round.status === "correct");
      const resultRevision = this.playing() ? null : `${round.id}:${round.status}`;
      $("practice-result").dataset.arrival = String(resultRevision !== null && resultRevision !== this.resultRevision);
      this.resultRevision = resultRevision;
      $("practice-result-icon").innerHTML = round.status === "correct"
        ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>'
        : round.status === "timeout"
          ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 6v6l4 2"/></svg>'
          : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 7 10 10M7 17 17 7"/></svg>';
      $("practice-result-streak").hidden = round.status !== "correct" || stats.current < 2;
      $("practice-result-streak").textContent = `${translate("practiceStreak")} ${stats.current}`;
      this.renderProgress();
      this.renderTable();
    }
    this.renderRanges();
    this.renderTimer();
    this.disableControls();
    this.syncTimer();
  }
  renderRanges() {
    const container = $("practice-ranges");
    this.rangeObserver.disconnect();
    const round = this.round;
    const visible = Boolean(round) && !this.playing() && !this.blocked;
    container.hidden = !visible;
    if (!visible) { container.replaceChildren(); return; }
    const live = round.mode === "live";
    const shortUnit = this.unit() === "bb" ? this.unitName() : "";
    const answers = [...round.answers];
    if (!answers.length || (live && round.e === 3 && answers.length === 1 && answers[0].correct)) {
      answers.push({ ...practiceTarget(round), street: round.street, actualBet: null });
    }
    const ranges = answers.map((answer) => {
      const hasBet = answer.actualBet !== null;
      const lower = live ? answer.minimumWholeBet : answer.lower;
      const upper = live ? answer.maximumWholeBet : answer.upper;
      const roundedBounds = [lower, upper].map((value) => Math.round(practiceDisplayValue(value, this.unit(), round.settings.bigBlind)));
      const rangeAmounts = roundedBounds[0] > 0 && roundedBounds[0] < roundedBounds[1]
        ? roundedBounds.map(String) : [this.number(lower), this.number(upper)];
      const potPercent = (value) => {
        const percent = value / answer.pot * 100;
        return `${percent > 0 && percent < 0.5 ? "<1" : practiceInputText(percent, separator, 0)}%`;
      };
      const rangePercent = `${potPercent(lower)} - ${potPercent(upper)}`;
      const betPercent = hasBet ? potPercent(answer.actualBet) : null;
      const idealPercent = potPercent(answer.idealBet);
      const roundedIdeal = Math.round(practiceDisplayValue(answer.idealBet, this.unit(), round.settings.bigBlind));
      const roundedIdealChips = this.unit() === "bb" ? roundedIdeal * round.settings.bigBlind : roundedIdeal;
      const idealAmount = roundedIdeal > 0 && roundedIdealChips >= answer.lower && roundedIdealChips <= answer.upper
        ? practiceInputText(roundedIdeal, separator, 0) : this.number(answer.idealBet);
      const spr = answer.spr > 0 && answer.spr < 0.05 ? "<0.1" : practiceInputText(answer.spr, separator, 1);
      const padding = Math.max(upper - lower, answer.pot * 0.1);
      const minimum = Math.max(0, Math.min(lower, hasBet ? answer.actualBet : lower) - padding);
      const maximum = Math.min(answer.effectiveStack, Math.max(upper, hasBet ? answer.actualBet : upper) + padding);
      const start = live ? Math.floor(minimum) : minimum;
      const end = live ? Math.ceil(maximum) : maximum;
      const span = end - start;
      const position = !hasBet ? "practiceNoBet" : answer.correct ? "practiceWithinRange"
        : answer.actualBet < lower ? "practiceBelowRange" : "practiceAboveRange";
      const article = document.createElement("article");
      article.className = "practice-bet-range";
      article.dataset.correct = hasBet ? String(answer.correct) : "none";
      article.setAttribute("role", "img");
      article.setAttribute("aria-label", translate("practiceRangeSummary", {
        street: translate(answer.street), spr, lower: this.number(lower), upper: this.number(upper), rangePercent,
        ideal: this.number(answer.idealBet), idealPercent, unit: this.unitName(),
        answer: hasBet ? `${translate("practiceActual")}: ${this.number(answer.actualBet)} ${this.unitName()}, ${translate("practicePercentOfPot", { percent: betPercent })}` : translate("practiceNoBet"),
        position: hasBet ? translate(position) : "",
      }));
      const heading = document.createElement("h3");
      const street = document.createElement("span");
      street.textContent = translate(answer.street);
      const ratio = document.createElement("bdi");
      ratio.className = "practice-range-spr";
      ratio.dir = "ltr";
      ratio.textContent = `SPR ${spr}`;
      heading.append(street, ratio);
      const chart = document.createElement("div");
      chart.className = "practice-range-chart";
      chart.setAttribute("aria-hidden", "true");
      chart.style.setProperty("--label-lanes", hasBet ? "3" : "2");
      chart.style.setProperty("--range-start", `${(lower - start) / span * 100}%`);
      chart.style.setProperty("--range-width", `${(upper - lower) / span * 100}%`);
      chart.style.setProperty("--range-center", `${((lower + upper) / 2 - start) / span * 100}%`);
      chart.style.setProperty("--ideal-position", `${(answer.idealBet - start) / span * 100}%`);
      for (const [kind, key, value, percentage] of [
        ["ideal", "practiceIdeal", idealAmount, idealPercent],
        ["actual", "practiceActual", hasBet ? this.number(answer.actualBet) : null, betPercent],
        ["accepted", "practiceRange", `${live ? "" : "~"}${rangeAmounts.join(" - ")}`, rangePercent],
      ]) {
        if (kind === "actual" && !hasBet) continue;
        const group = document.createElement("div");
        group.className = `practice-range-${kind}`;
        const lane = kind === "actual" ? 0 : kind === "ideal" ? Number(hasBet) : Number(hasBet) + 1;
        group.style.setProperty("--label-lane", String(lane));
        group.style.setProperty("--caption-gap", lane === 0 ? "14px" : "6px");
        const caption = document.createElement("span");
        caption.className = "practice-range-caption";
        caption.textContent = `${translate(key)}${kind === "accepted" && shortUnit ? ` · ${shortUnit}` : ""}`;
        const label = document.createElement("div");
        label.className = "practice-range-value";
        if (value !== null) {
          const amount = document.createElement("bdi");
          amount.className = "practice-range-amount";
          amount.dir = "ltr";
          amount.textContent = `${value}${shortUnit ? ` ${shortUnit}` : ""}`;
          label.append(amount);
        }
        const percent = document.createElement("strong");
        percent.className = "practice-range-percent";
        percent.textContent = percentage;
        label.append(percent);
        group.append(label, caption);
        chart.append(group);
      }
      const track = document.createElement("div");
      track.className = "practice-range-track";
      const band = document.createElement("span");
      band.className = "practice-range-band";
      const target = document.createElement("span");
      target.className = "practice-range-ideal-mark";
      track.append(band, target);
      if (hasBet) {
        chart.style.setProperty("--bet-position", `${(answer.actualBet - start) / span * 100}%`);
        const marker = document.createElement("span");
        marker.className = "practice-range-marker";
        track.append(marker);
      } else {
        const missing = document.createElement("span");
        missing.className = "practice-range-no-bet";
        missing.textContent = translate("practiceNoBet");
        chart.append(missing);
      }
      const bracket = document.createElement("div");
      bracket.className = "practice-range-bracket";
      const axis = document.createElement("div");
      axis.className = "practice-range-axis";
      axis.append(track);
      chart.append(axis, bracket);
      article.append(heading, chart);
      return article;
    });
    container.replaceChildren(...ranges);
    this.positionRangeLabels();
    // Fixed-height tracks avoid resize feedback from changing label rows.
    for (const track of container.querySelectorAll(".practice-range-track")) this.rangeObserver.observe(track);
  }
  positionRangeLabels() {
    for (const chart of $("practice-ranges").querySelectorAll(".practice-range-chart")) {
      const width = chart.clientWidth;
      if (!width) continue;
      const labels = [
        ["actual", "--bet-position"], ["ideal", "--ideal-position"], ["accepted", "--range-center"],
      ].flatMap(([kind, property]) => {
        const group = chart.querySelector(`.practice-range-${kind}`);
        if (!group) return [];
        const half = Math.max(...[...group.children].map((node) => node.getBoundingClientRect().width)) / 2;
        const anchor = parseFloat(chart.style.getPropertyValue(property)) / 100 * width;
        const position = Math.max(half, Math.min(anchor, width - half));
        return [{ group, position, left: position - half, right: position + half }];
      });
      const lanes = [];
      // Keep the submitted bet closest to the bar; stack collisions instead of moving their anchors.
      for (const label of labels) {
        let lane = lanes.findIndex((others) => others.every((other) =>
          label.left >= other.right + 12 || label.right <= other.left - 12));
        if (lane === -1) { lane = lanes.length; lanes.push([]); }
        lanes[lane].push(label);
        label.group.style.setProperty("--label-position", `${label.position}px`);
        label.group.style.setProperty("--label-lane", String(lane));
        label.group.style.setProperty("--caption-gap", lane === 0 ? "14px" : "6px");
      }
      chart.style.setProperty("--label-lanes", String(lanes.length));
    }
  }
  renderTimer() {
    const node = $("practice-timer");
    node.hidden = !this.heroActing() || this.mode !== "online" || this.blocked;
    $("practice-clock").hidden = node.hidden;
    $("practice-time-track").hidden = node.hidden;
    if (!node.hidden) {
      const remaining = Math.max(0, this.round.deadline - Date.now());
      const seconds = Math.ceil(remaining / 1000);
      node.textContent = String(seconds);
      node.setAttribute("aria-label", translate("practiceTimer", { seconds }));
      $("practice-time-fill").style.setProperty("--time-left", String(Math.min(1, remaining / 30_000)));
      $("practice-clock").dataset.urgent = String(seconds <= 5);
      $("practice-time-track").dataset.urgent = String(seconds <= 5);
    }
  }
  renderShortcuts() {
    $("practice-shortcuts").hidden = this.mode !== "online";
    document.querySelectorAll("[data-practice-size]").forEach((button) => {
      button.dataset.selected = String(button.dataset.practiceSize === this.selectedShortcut);
    });
  }
  renderProgress() {
    const currentStreet = practiceTableView(this.round).street;
    $("practice-street").textContent = `${this.round.e}e · ${translate(currentStreet)}`;
    $("practice-street").dir = state.language === "he" ? "rtl" : "ltr";
    const start = this.round.e === 3 || currentStreet === "flop" ? 0 : 1;
    const streets = ["flop", "turn", "river"].slice(start, start + this.round.e);
    const steps = streets.map((street) => {
      const step = document.createElement("li");
      step.textContent = translate(street);
      step.dataset.current = String(this.playing() && currentStreet === street);
      step.dataset.complete = String(this.round.answers.some((answer) => answer.street === street && answer.correct));
      step.setAttribute("aria-current", step.dataset.current === "true" ? "step" : "false");
      return step;
    });
    $("practice-progress").replaceChildren(...steps);
  }
  renderTable() {
    const view = practiceTableView(this.round);
    const effect = practiceActionView(this.round);
    const table = $("practice-table");
    const revision = JSON.stringify([this.round.id, view, this.round.status, effect.phase, this.unit(), state.language]);
    if (revision === this.tableRevision) return;
    this.tableRevision = revision;
    table.dataset.motion = this.tableRoundId !== this.round.id ? "deal" : this.tableStreet !== view.street ? "turn" : "";
    table.dataset.playing = String(this.heroActing());
    table.dataset.phase = effect.phase;
    table.style.setProperty("--action-duration", `${PRACTICE_ACTION_MS}ms`);
    table.style.setProperty("--action-delay", `${Math.min(0, (effect.startedAt ?? this.round.action.readyAt) - Date.now())}ms`);
    this.tableRoundId = this.round.id;
    this.tableStreet = view.street;
    this.renderProgress();
    table.className = "poker-table";
    const wagers = [];
    const seats = [false, true].map((hero) => {
      const node = document.createElement("div");
      node.className = `poker-seat ${hero ? "hero" : "opponent"}`;
      const x = "50%";
      const y = hero ? "84%" : "16%";
      node.style.setProperty("--seat-x", x);
      node.style.setProperty("--seat-y", y);
      const card = document.createElement("div");
      card.className = "seat-card";
      const name = document.createElement("span");
      name.className = "seat-name";
      name.textContent = translate(hero ? "practiceHero" : "practiceOpponent");
      const label = document.createElement("div");
      label.className = "sr-only";
      label.textContent = `${translate("practiceStack")}${this.unit() === "bb" ? "" : ` · ${this.unitName()}`}`;
      const stack = document.createElement("div");
      stack.className = "seat-stack";
      stack.append(this.amountNode(hero ? view.heroStack : view.opponentStack));
      card.append(name, label, stack);
      if (hero && this.playing() && this.round.answers.at(-1)?.correct) {
        const accepted = document.createElement("span");
        accepted.className = "seat-feedback";
        accepted.setAttribute("aria-hidden", "true");
        accepted.innerHTML = '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>';
        card.append(accepted);
      }
      const speech = hero ? effect.phase === "bet" ? "bet" : null
        : ["check", "call"].includes(effect.phase) ? effect.phase
        : effect.phase === "hero" && view.calledBet !== null && view.seating.opponentChecks ? "check" : null;
      if (speech) {
        const bubble = document.createElement("div");
        bubble.className = "seat-speech";
        bubble.textContent = translate({ bet: "practiceBet", check: "practiceCheck", call: "practiceCall" }[speech]);
        if (speech !== "check") bubble.append(this.amountNode(this.round.answers.at(-1).actualBet));
        card.append(bubble);
      }
      if (effect.phase === "call") {
        const wager = document.createElement("span");
        wager.className = "wager-chips";
        wager.setAttribute("aria-hidden", "true");
        wager.style.setProperty("--seat-x", x);
        wager.style.setProperty("--seat-y", y);
        wager.append(this.amountNode(this.round.answers.at(-1).actualBet));
        wagers.push(wager);
      }
      node.append(card);
      return node;
    });
    const pot = document.createElement("div");
    pot.className = "table-pot";
    const label = document.createElement("span");
    label.textContent = translate("practicePot");
    const initial = document.createElement("strong");
    initial.append(this.amountNode(view.visiblePot));
    const units = document.createElement("span");
    units.className = "sr-only";
    units.textContent = this.unit() === "bb" ? "" : this.unitName();
    pot.append(label, initial, units);
    if (view.visiblePot !== view.initialPot) {
      const start = document.createElement("span");
      start.className = "pot-start";
      const caption = document.createElement("span");
      caption.textContent = translate("practicePotStart");
      start.append(caption, this.amountNode(view.initialPot));
      pot.append(start);
    }
    const center = document.createElement("div");
    center.className = "table-center";
    center.append(pot);
    table.replaceChildren(seats[0], center, seats[1], ...wagers);
    fitNumbers();
    const action = $("practice-action");
    const lines = [];
    if (this.playing() && this.round.answers.at(-1)?.correct) {
      const accepted = document.createElement("span");
      accepted.className = "sr-only";
      accepted.textContent = translate("practiceCorrect");
      lines.push(accepted);
    }
    if (view.calledBet !== null && this.round.mode === "live" && this.round.e === 3) {
      const flop = document.createElement("span");
      flop.className = "action-pill";
      flop.textContent = translate("flop");
      lines.push(flop);
      for (const key of ["practiceBet", "practiceCall"]) {
        const chip = document.createElement("span");
        chip.className = "action-pill";
        const label = document.createElement("span");
        label.textContent = translate(key);
        chip.append(label, this.amountNode(view.calledBet));
        lines.push(chip);
      }
      const history = document.createElement("p");
      history.className = "sr-only";
      history.textContent = translate("practiceFlopAction", { bet: this.number(view.calledBet) });
      lines.push(history);
    }
    if (this.heroActing()) {
      const next = document.createElement("span");
      next.className = "turn-prompt";
      next.textContent = translate("practiceYourTurn");
      lines.push(next);
    }
    if (effect.phase === "check" || effect.phase === "call") {
      const narration = document.createElement("span");
      narration.className = "sr-only";
      narration.textContent = translate(effect.phase === "check" ? "practiceChecked" : "practiceOpponentCalls",
        { bet: effect.phase === "call" ? this.number(this.round.answers.at(-1).actualBet) : "" });
      lines.push(narration);
    }
    action.replaceChildren(...lines);
  }
}

function selectPage(page) {
  state.page = page;
  $("calculator").hidden = page !== "calculator";
  $("calculator-tabs").hidden = page !== "calculator";
  $("practice").hidden = page !== "practice";
  $("new-hand").hidden = page !== "calculator";
  $("mobile-help").hidden = page !== "calculator";
  for (const kind of ["calculator", "practice"]) $(`nav-${kind}`).setAttribute("aria-pressed", String(kind === page));
  const skip = document.querySelector(".skip-link");
  skip.href = page === "practice" ? "#practice-heading" : "#pot";
  skip.textContent = translate(page === "practice" ? "practiceHeading" : "mainJump");
  practice.tick();
  if (page !== "practice") practice.closeMenus();
  fitNumbers();
}
for (const page of ["calculator", "practice"]) $(`nav-${page}`).addEventListener("click", () => selectPage(page));
try {
  practice = new PracticeUI();
  mobileLayout();
  localize();
  updateThemeColor();
  practice.init();
  $("startup").hidden = true;
  root.dataset.ready = "true";
} catch (error) {
  $("startup").textContent = translate("failed");
  console.error("Calculator startup failed:", error);
}
