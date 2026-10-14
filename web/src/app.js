import { evaluate, amount, percent, sprText, fraction, RAISES } from "./core.js";
import { t } from "./i18n.js";

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const fields = ["pot", "stack", "facingBet"];
const numbers = [...document.querySelectorAll("output.number")];
const copies = [...document.querySelectorAll("[data-copy]")];
const separator = new Intl.NumberFormat(navigator.language).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
const state = { language: "en", theme: "system", pot: "", stack: "", facingBet: "", tab: "postflop", submitted: { postflop: false, preflop: false } };
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
    for (const node of numbers) {
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
  if (!mobile.matches) return;
  event.preventDefault();
  selectTab("postflop");
  $("pot").focus();
});
mobile.addEventListener("change", mobileLayout);
new ResizeObserver(fitNumbers).observe($("calculator"));
window.addEventListener("resize", fitNumbers);
try {
  mobileLayout();
  localize();
  updateThemeColor();
  $("startup").hidden = true;
  root.dataset.ready = "true";
} catch (error) {
  $("startup").textContent = translate("failed");
  console.error("Calculator startup failed:", error);
}
