import { test, expect } from "@playwright/test";

test.use({ isMobile: true, hasTouch: true });

async function start(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  expect(errors).toEqual([]);
}

async function screen(page, tab, state) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const active = document.querySelector('.panel:not([hidden])');
    const visible = [...active.querySelectorAll("input, output.number, .amount-field label, .plan-top h2, .plan-top span, .bet-label strong, .step-context strong, .raise-group h3, .raise-target > span, [data-go]")];
    return {
      width: doc.clientWidth, height: doc.clientHeight,
      scrollWidth: doc.scrollWidth, scrollHeight: doc.scrollHeight,
      outputs: visible.filter((node) => node.tagName === "OUTPUT").map((node) => ({
        id: node.id, text: node.textContent, font: parseFloat(getComputedStyle(node).fontSize),
        scroll: node.scrollWidth, width: node.clientWidth, direction: getComputedStyle(node).direction,
      })),
      clipped: visible.filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width === 0 || box.height === 0 || box.x < -1 || box.right > doc.clientWidth + 1
          || box.y < -1 || box.bottom > doc.clientHeight + 1;
      }).map((node) => ({ id: node.id, text: node.textContent, box: node.getBoundingClientRect().toJSON() })),
      panel: active.getBoundingClientRect().toJSON(),
    };
  });
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.width);
  expect(metrics.scrollHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.height);
  expect(metrics.clipped, JSON.stringify(metrics)).toEqual([]);
  expect(metrics.outputs).toHaveLength(tab === "postflop" ? 8 : 4);
  for (const output of metrics.outputs) {
    expect(output.direction).toBe("ltr");
    expect(output.scroll, output.id).toBeLessThanOrEqual(output.width + 1);
    if (state === "valid" && output.id.startsWith("bet-")) expect(output.font, output.id).toBeGreaterThanOrEqual(30);
    if (state === "valid" && output.id.startsWith("raise-")) expect(output.font, output.id).toBeGreaterThanOrEqual(36);
    if (state === "extreme" && /^(bet|raise)-/.test(output.id)) expect(output.font, output.id).toBeGreaterThanOrEqual(20);
  }
  if (tab === "postflop") {
    for (const kind of ["two", "three"]) {
      const y = await page.locator(`.${kind} .bet-step`).evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().y));
      expect(new Set(y).size, `${kind} cards are side by side`).toBe(1);
    }
  }
}

async function standaloneCSS(page) {
  // Neither desktop engine emulates the iOS Home Screen host. Force only its
  // media condition, leaving the published declarations and size queries intact.
  const count = await page.evaluate(() => {
    let count = 0;
    for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) {
      if (rule instanceof CSSMediaRule && rule.conditionText.includes("(display-mode: standalone)")) {
        rule.media.mediaText = rule.conditionText.replace("(display-mode: standalone)", "(min-width: 0px)");
        count++;
      }
    }
    return count;
  });
  expect(count).toBe(1);
}

async function sharpHeader(page, standalone) {
  const metrics = await page.evaluate(() => {
    const header = document.querySelector(".app-header");
    const visible = [header, document.documentElement, document.body, ...header.querySelectorAll("*")]
      .filter((node) => node.getBoundingClientRect().width && node.getBoundingClientRect().height);
    return {
      margin: getComputedStyle(header).marginTop,
      top: header.getBoundingClientRect().top,
      padding: parseFloat(getComputedStyle(document.body).paddingTop),
      effects: visible.filter((node) => {
        const style = getComputedStyle(node);
        return style.filter !== "none" || style.backdropFilter !== "none"
          || style.maskImage !== "none" || style.opacity !== "1";
      }).map((node) => node.id || node.tagName),
      controls: ["lang-en", "lang-he", "theme", "new-hand", "mobile-help"].map((id) => {
        const node = document.getElementById(id), box = node.getBoundingClientRect();
        return { id, width: box.width, height: box.height, top: box.top, right: box.right, bottom: box.bottom };
      }),
      width: document.documentElement.clientWidth, height: document.documentElement.clientHeight,
    };
  });
  const buffer = standalone && metrics.width <= 600 && metrics.height >= 550 ? 24 : 0;
  expect(metrics.effects).toEqual([]);
  expect(metrics.margin).toBe(`${buffer}px`);
  expect(metrics.top).toBeCloseTo(metrics.padding + buffer, 1);
  for (const control of metrics.controls) {
    expect(control.width, control.id).toBeGreaterThanOrEqual(44);
    expect(control.height, control.id).toBeGreaterThanOrEqual(44);
    expect(control.top, control.id).toBeGreaterThanOrEqual(metrics.top);
    expect(control.right, control.id).toBeLessThanOrEqual(metrics.width);
    expect(control.bottom, control.id).toBeLessThanOrEqual(metrics.height);
  }
}

for (const [width, height] of [[320, 568], [390, 844], [402, 874]]) for (const standalone of [false, true]) {
  test(`mobile sharp header ${width}x${height} ${standalone ? "standalone CSS" : "browser"}`, async ({ page }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height });
    await start(page);
    if (standalone) await standaloneCSS(page);
    await sharpHeader(page, standalone);
    for (const language of ["en", "he"]) for (const theme of ["light", "dark"]) {
      await page.locator("#theme").selectOption(theme);
      await page.locator("#tab-postflop").tap();
      await page.locator("#pot").fill("100");
      await page.locator("#stack").fill("241.6");
      await page.locator("#stack").evaluate((node) => node.setSelectionRange(1, 3));
      await page.locator(`#lang-${language}`).tap();
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.locator(`#lang-${language}`)).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("#stack")).toBeFocused();
      expect(await page.locator("#stack").evaluate((node) => [node.selectionStart, node.selectionEnd])).toEqual([1, 3]);
      await sharpHeader(page, standalone);
      await page.locator('[data-go="postflop"]').tap();
      await expect(page.locator("#stack")).not.toBeFocused();
      await screen(page, "postflop", "valid");
      await page.locator(".app-header").screenshot({ path: info.outputPath(`header-${language}-${theme}.png`) });
      if (standalone) await page.screenshot({ path: info.outputPath(`screen-${language}-${theme}.png`) });
      await page.locator("#tab-preflop").tap();
      await page.locator("#facingBet").fill("3");
      await page.locator('[data-go="preflop"]').tap();
      await screen(page, "preflop", "valid");
      await sharpHeader(page, standalone);
    }
    await page.locator("#lang-en").focus();
    await page.keyboard.press("Tab");
    // WebKit's Tab policy can skip buttons; test keyboard focus styling without
    // assuming the host's Full Keyboard Access preference.
    await page.locator("#lang-he").focus();
    await expect(page.locator("#lang-he")).toBeFocused();
    expect(await page.locator("#lang-he").evaluate((node) => getComputedStyle(node).outlineWidth)).toBe("3px");
    await page.keyboard.press("Tab");
    await page.locator("#theme").focus();
    await expect(page.locator("#theme")).toBeFocused();
    expect(await page.locator(".theme-control").evaluate((node) => getComputedStyle(node).outlineWidth)).toBe("3px");
    await page.setViewportSize({ width: 320, height: 518 });
    await sharpHeader(page, standalone);
    await page.setViewportSize({ width, height: 300 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.evaluate(() => window.scrollTo(0, 0));
    await sharpHeader(page, standalone);
    await page.setViewportSize({ width, height });
    await sharpHeader(page, standalone);
    await screen(page, "preflop", "valid");
  });
}

test("standalone header buffer preserves portrait no-scroll and synthetic safe areas", async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  await standaloneCSS(page);
  for (const [width, height] of [[320, 518], [320, 568], [360, 640], [375, 667], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width, height });
    for (const language of ["en", "he"]) for (const theme of ["light", "dark"]) for (const state of ["empty", "valid", "error"]) {
      await page.locator(`#lang-${language}`).click();
      await page.locator("#theme").selectOption(theme);
      await page.locator("#new-hand").click();
      await page.locator("#tab-postflop").click();
      if (state !== "empty") {
        await page.locator("#pot").fill(state === "valid" ? "100" : "oops");
        await page.locator("#stack").fill(state === "valid" ? "241.6" : "0");
        await page.locator('[data-go="postflop"]').tap();
      }
      await sharpHeader(page, true);
      await screen(page, "postflop", state);
      await page.locator("#tab-preflop").click();
      if (state !== "empty") {
        await page.locator("#facingBet").fill(state === "valid" ? "3" : "oops");
        await page.locator('[data-go="preflop"]').tap();
      }
      await screen(page, "preflop", state);
    }
  }
  for (const [width, height, top, bottom] of [[320, 568, 20, 0], [390, 844, 59, 34], [402, 874, 62, 34]]) {
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
    await standaloneCSS(page);
    // Substitute test insets in CSSOM; this does not reproduce native chrome.
    await page.evaluate(({ top, bottom }) => {
      const visit = (rules) => {
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule && rule.selectorText === "body") {
            rule.style.cssText = rule.style.cssText
              .replaceAll("env(safe-area-inset-top)", `${top}px`)
              .replaceAll("env(safe-area-inset-bottom)", `${bottom}px`);
          } else if (rule.cssRules) visit(rule.cssRules);
        }
      };
      for (const sheet of document.styleSheets) visit(sheet.cssRules);
    }, { top, bottom });
    await page.setViewportSize({ width, height });
    await page.locator("#pot").fill("oops");
    await page.locator("#stack").fill("0");
    await page.locator('[data-go="postflop"]').tap();
    await sharpHeader(page, true);
    expect(await page.locator(".app-header").evaluate((node) => node.getBoundingClientRect().top)).toBe(top + 24);
    await screen(page, "postflop", "error");
    await page.locator("#tab-preflop").click();
    await screen(page, "preflop", "empty");
  }
});

for (const [width, height] of [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [320, 518]]) {
  test(`mobile one screen ${width}x${height}, both calculators/languages/themes/states`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await start(page);
    await expect(page.locator("#tab-postflop")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#preflop")).toBeHidden();
    expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe("INPUT");
    for (const language of ["en", "he"]) for (const theme of ["light", "dark"]) {
      await page.locator(`#lang-${language}`).click();
      await page.locator("#theme").selectOption(theme);
      for (const state of ["empty", "valid", "error"]) {
        await page.locator("#new-hand").click();
        await page.locator("#tab-postflop").click();
        if (state !== "empty") {
          await page.locator("#pot").fill(state === "error" ? "oops" : "100");
          await page.locator("#stack").fill(state === "error" ? "0" : "241.6");
          await page.locator('[data-go="postflop"]').click();
        }
        await screen(page, "postflop", state);
        if (state === "valid") {
          await expect(page.locator("#bet-3-1")).toHaveText("40.0");
          await expect(page.locator("#bet-3-2")).toHaveText("72.0");
          await expect(page.locator("#bet-3-3")).toHaveText("129.6");
          if (width === 320 || width === 390) await page.screenshot({ path: info.outputPath(`plans-${language}-${theme}.png`) });
        }
        if (state === "error") {
          await expect(page.locator("#pot-error")).toBeVisible();
          await expect(page.locator("#stack-error")).toBeVisible();
          await expect(page.locator("#bet-3-3")).toHaveText("—");
        }
        await page.locator("#tab-preflop").click();
        if (state !== "empty") {
          await page.locator("#facingBet").fill(state === "error" ? "oops" : "3");
          await page.locator('[data-go="preflop"]').click();
        }
        await screen(page, "preflop", state);
        if (state === "valid") {
          for (const [id, value] of [["threeBetIP", "9.0"], ["threeBetOOP", "12.0"], ["fourBetIP", "7.2"], ["fourBetOOP", "7.8"]]) {
            await expect(page.locator(`#raise-${id}`)).toHaveText(value);
          }
          if (width === 320 || width === 390) await page.screenshot({ path: info.outputPath(`raises-${language}-${theme}.png`) });
        }
        await page.locator("#tab-postflop").click();
        await expect(page.locator("#pot")).toHaveValue(state === "empty" ? "" : state === "error" ? "oops" : "100");
      }
    }
  });
}

test("mobile Go/Enter, tab keyboard navigation and persistent editing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await expect(page.locator("#pot")).toHaveAttribute("enterkeyhint", "next");
  await expect(page.locator("#stack")).toHaveAttribute("enterkeyhint", "go");
  await page.locator("#pot").fill("100");
  await expect(page.locator("#pot")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#stack")).toBeFocused();
  await page.locator("#stack").fill("241.6");
  await expect(page.locator("#bet-3-3")).toHaveText("129.6");
  await expect(page.locator("#stack")).toBeFocused();
  await page.locator("#stack").evaluate((node) => node.setSelectionRange(1, 3));
  await page.locator('[data-go="postflop"]').tap();
  await expect(page.locator("#stack")).not.toBeFocused();
  expect(await page.locator("#stack").evaluate((node) => [node.selectionStart, node.selectionEnd])).toEqual([1, 3]);
  await expect(page.locator("#stack")).toHaveValue("241.6");
  await page.locator("#tab-postflop").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tab-preflop")).toBeFocused();
  await expect(page.locator("#preflop")).toBeVisible();
  await page.locator("#facingBet").fill("3");
  await expect(page.locator("#facingBet")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#facingBet")).not.toBeFocused();
  await expect(page.locator("#raise-fourBetOOP")).toHaveText("7.8");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("#postflop-panel")).toBeVisible();
  await expect(page.locator("#preflop")).toBeVisible();
  await expect(page.locator(".reference")).toBeVisible();
  await expect(page.locator('[data-go="preflop"]')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#postflop-panel")).toBeHidden();
  await expect(page.locator("#facingBet")).toHaveValue("3");
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#pot")).toBeFocused();
  await expect(page.locator("#tab-postflop")).toHaveAttribute("aria-selected", "true");
  await page.locator("#tab-preflop").tap();
  await page.locator("#tab-preflop").focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#tab-postflop")).toBeFocused();
  await expect(page.locator("#stack")).toHaveValue("241.6");
  await page.locator("#pot").fill("16");
  await page.locator("#stack").fill("89");
  for (const [id, value] of [["bet-2-1", "19.9"], ["bet-2-2", "69.1"], ["bet-3-1", "10.4"], ["bet-3-2", "23.8"], ["bet-3-3", "54.8"]]) {
    await expect(page.locator(`#${id}`)).toHaveText(value);
  }
  await page.locator("#new-hand").click();
  await page.locator('[data-go="postflop"]').click();
  await expect(page.locator("#pot")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#stack-error")).toBeVisible();
  await expect(page.locator('[data-copy="bet-3-3"]')).toBeDisabled();
  await expect(page.locator("#feedback")).toContainText("Current pot");
  await page.locator("#tab-preflop").click();
  await page.locator("#facingBet").fill(".");
  await page.locator('[data-go="preflop"]').click();
  await expect(page.locator("#facingBet-error")).toBeVisible();
  await expect(page.locator("#raise-threeBetIP")).toHaveText("—");
  await page.reload();
  await expect(page.locator("#tab-postflop")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#pot")).toHaveValue("");
});

test("mobile help/reference/source without main scroll; accessible reduced-height and zoom fallback", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await start(page);
  await page.locator("#mobile-help").click();
  await expect(page.locator("#assumptions-dialog")).toBeVisible();
  await expect(page.locator("#reference-heading")).toBeVisible();
  await expect(page.locator("#reference-body td")).toHaveCount(14);
  expect(await page.locator("#github-dialog").getAttribute("href")).toBe("https://github.com/MagalHoresh/PokerSPRCalculator");
  await page.keyboard.press("Escape");
  await expect(page.locator("#mobile-help")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 300 });
  await page.locator("#stack").fill("241.6");
  await expect(page.locator('[data-go="postflop"]')).toBeInViewport({ ratio: 1 });
  await page.locator('[data-go="postflop"]').click();
  await expect(page.locator("#stack")).not.toBeFocused();
  for (const [width, height] of [[844, 390], [200, 400]]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.evaluate(() => ({
      width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
      overflow: getComputedStyle(document.body).overflowY,
    }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.overflow).not.toBe("hidden");
    await page.locator('[data-go="postflop"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-go="postflop"]')).toBeInViewport();
  }
});

for (const standalone of [false, true]) test(`mobile tiny and largest amounts retain full LTR text, safe copying and one-screen plans ${standalone ? "standalone CSS" : "browser"}`, async ({ page }) => {
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { writeText: async (value) => { window.__copied.push(value); } },
    });
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await start(page);
  if (standalone) await standaloneCSS(page);
  for (const language of ["en", "he"]) for (const theme of ["light", "dark"]) {
    await page.locator(`#lang-${language}`).click();
    await page.locator("#theme").selectOption(theme);
    for (const [pot, stack] of [["1000000000000", "0.001"], ["0.001", "1000000000000"]]) {
      await page.locator("#tab-postflop").click();
      await page.locator("#pot").fill(pot);
      await page.locator("#stack").fill(stack);
      await page.locator('[data-go="postflop"]').tap();
      await screen(page, "postflop", "extreme");
      await expect(page.locator("#bet-3-3")).not.toHaveText("—");
      if (stack === "0.001") {
        await expect(page.locator("#bet-3-3")).toHaveText("<0.1");
        await expect(page.locator('[data-copy="bet-3-3"]')).toBeDisabled();
      } else {
        await expect(page.locator("#bet-3-3")).toHaveText(/^\d{12,13}\.\d$/);
        await expect(page.locator('[data-copy="bet-3-3"]')).toBeEnabled();
        const allIn = await page.locator("#bet-3-3").textContent();
        await page.locator('[data-copy="bet-3-3"]').tap();
        await expect.poll(() => page.evaluate(() => window.__copied.at(-1))).toBe(allIn);
      }
      await page.locator("#tab-preflop").click();
      await page.locator("#facingBet").fill(stack);
      await page.locator('[data-go="preflop"]').tap();
      await screen(page, "preflop", "extreme");
      await expect(page.locator("#raise-threeBetOOP")).toHaveText(stack === "0.001" ? "<0.1" : "4000000000000.0");
      if (stack !== "0.001") {
        await page.locator('[data-copy="raise-threeBetOOP"]').tap();
        await expect.poll(() => page.evaluate(() => window.__copied.at(-1))).toBe("4000000000000.0");
      }
    }
  }
});
