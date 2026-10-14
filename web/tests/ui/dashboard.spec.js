import { test, expect } from "@playwright/test";

async function start(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  expect(errors).toEqual([]);
}
async function hand(page, pot = "100", stack = "241.6", facing = "3") {
  await page.locator("#pot").fill(pot);
  await page.locator("#stack").fill(stack);
  await page.locator("#facingBet").fill(facing);
}
async function noOverflow(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    width: document.documentElement.scrollWidth,
    bad: [...document.querySelectorAll("output.number")].filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => ({ id: node.id, width: node.clientWidth, scroll: node.scrollWidth })),
  }));
  expect(metrics.width, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.bad).toEqual([]);
}

async function leadingAmounts(page, language) {
  await noOverflow(page);
  const metrics = await page.locator(".bet-step .number, .raise-target .number, #spr").evaluateAll((nodes, language) => nodes.map((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const text = range.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const card = node.closest(".bet-step, .raise-target");
    const label = card?.querySelector(".bet-label strong, .raise-target > span");
    const labelBox = label?.getBoundingClientRect();
    const cardBox = card?.getBoundingClientRect();
    const style = getComputedStyle(node);
    const right = language === "he";
    const cardStyle = card && getComputedStyle(card);
    return {
      id: node.id, text: node.textContent,
      alignment: style.textAlign, direction: style.direction,
      outputEdge: right ? box.right : box.left,
      textEdge: right ? text.right : text.left,
      labelEdge: labelBox && (right ? labelBox.right : labelBox.left),
      paddedEdge: cardBox && (right
        ? cardBox.right - parseFloat(cardStyle.paddingRight)
        : cardBox.left + parseFloat(cardStyle.paddingLeft)),
      font: parseFloat(style.fontSize),
    };
  }), language);
  expect(metrics).toHaveLength(10);
  for (const metric of metrics) {
    const description = `${language} ${metric.id}: ${metric.text}`;
    expect(metric.alignment, description).toBe(language === "he" ? "right" : "left");
    expect(metric.direction, description).toBe("ltr");
    expect(Math.abs(metric.textEdge - metric.outputEdge), description).toBeLessThanOrEqual(2);
    if (metric.labelEdge !== undefined) {
      expect(Math.abs(metric.textEdge - metric.labelEdge), description).toBeLessThanOrEqual(2);
      expect(Math.abs(metric.textEdge - metric.paddedEdge), description).toBeLessThanOrEqual(2);
    }
  }
  const reference = await page.locator("#reference-body td").evaluateAll((nodes) => nodes.map((node) => ({
    align: getComputedStyle(node).textAlign, direction: getComputedStyle(node).direction,
  })));
  expect(reference).toHaveLength(14);
  expect(reference.every((cell) => cell.align === "center" && cell.direction === "ltr")).toBe(true);
}

for (const [width, height] of [[320, 640], [360, 740], [390, 844], [430, 932], [844, 390], [1280, 800], [1440, 900]]) {
  test(`complete dashboard and startup input prominence ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await start(page);
    await expect(page.locator("#pot")).toHaveValue("");
    await expect(page.locator("#stack")).toHaveValue("");
    await expect(page.locator("#spr")).toHaveText("—");
    expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe("INPUT");
    if (width <= 600) {
      for (const control of ["lang-en", "lang-he", "theme", "new-hand"]) {
        const box = await page.locator(`#${control}`).boundingBox();
        expect(box.height, `${control} touch height`).toBeGreaterThanOrEqual(44);
        expect(box.width, `${control} touch width`).toBeGreaterThanOrEqual(44);
      }
    }
    for (const id of ["pot", "stack"]) {
      const rect = await page.locator(`#${id}`).boundingBox();
      expect(rect.y + rect.height).toBeLessThan(Math.min(height, 380));
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(parseFloat(await page.locator(`#${id}`).evaluate((node) => getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    }
    await noOverflow(page);
    if (width === 390) await page.screenshot({ path: info.outputPath("mobile-startup.png") });
    await hand(page);
    await expect(page.locator("#percent-3")).toHaveText("40.0%");
    await expect(page.locator("#bet-3-1")).toHaveText("40.0");
    await expect(page.locator("#bet-3-2")).toHaveText("72.0");
    await expect(page.locator("#bet-3-3")).toHaveText("129.6");
    await expect(page.locator("#bet-2-1")).toHaveText("70.7");
    await expect(page.locator("#bet-2-2")).toHaveText("170.9");
    for (const [id, value] of [["threeBetIP", "9.0"], ["threeBetOOP", "12.0"], ["fourBetIP", "7.2"], ["fourBetOOP", "7.8"]]) {
      await expect(page.locator(`#raise-${id}`)).toHaveText(value);
    }
    await noOverflow(page);
    if (width === 1440) await page.screenshot({ path: info.outputPath("desktop-light.png"), fullPage: true });
    expect(parseFloat(await page.locator("#bet-3-1").evaluate((node) => getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(width < 600 ? 56 : 60);
    if (width >= 1280) {
      for (const id of ["bet-3-3", "raise-fourBetOOP", "reference-heading"]) {
        const rect = await page.locator(`#${id}`).boundingBox();
        expect(rect.y + rect.height, id).toBeLessThan(height);
      }
    }
    await page.locator("#lang-he").click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await noOverflow(page);
    await page.locator("#theme").selectOption("dark");
    await page.screenshot({ path: info.outputPath(`hebrew-dark-${width}.png`), fullPage: true });
    await hand(page, "1000000000000", "1000000000000", "1000000000000");
    await noOverflow(page);
    for (const output of await page.locator("output.number").all()) {
      expect(await output.textContent()).not.toMatch(/NaN|Infinity|\.{3}|…/u);
    }
  });
}

test("instant independent validation, no stale values, keyboard and reset", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await page.keyboard.press("Alt+1");
  await expect(page.locator("#pot")).toBeFocused();
  await page.keyboard.type("100");
  await page.keyboard.press("Tab");
  await expect(page.locator("#stack")).toBeFocused();
  await page.keyboard.type("241.6");
  await page.keyboard.press("Enter");
  await expect(page.locator("#facingBet")).toBeFocused();
  await page.keyboard.type("3");
  await expect(page.locator("#bet-3-3")).toHaveText("129.6");
  await page.locator("#pot").fill("oops");
  await expect(page.locator("#bet-3-3")).toHaveText("—");
  await expect(page.locator('[data-copy="bet-3-3"]')).toBeDisabled();
  await expect(page.locator("#raise-threeBetIP")).toHaveText("9.0");
  await page.locator("#pot").fill("100");
  await page.locator("#facingBet").fill("NaN");
  await expect(page.locator("#raise-threeBetIP")).toHaveText("—");
  await expect(page.locator("#bet-3-3")).toHaveText("129.6");
  await page.locator("#theme").selectOption("dark");
  await page.locator("#lang-he").click();
  await page.keyboard.press("Alt+n");
  await expect(page.locator("#pot")).toHaveValue("");
  await expect(page.locator("#stack")).toHaveValue("");
  await expect(page.locator("#facingBet")).toHaveValue("");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("switch language while editing every field preserves selection and immediate direction", async ({ page }) => {
  await start(page);
  await hand(page);
  for (const field of ["pot", "stack", "facingBet"]) {
    await page.locator(`#${field}`).focus();
    await page.locator(`#${field}`).evaluate((input) => input.setSelectionRange(1, 1));
    const original = await page.locator(`#${field}`).inputValue();
    for (const language of ["he", "en", "he", "en"]) {
      await page.locator(`#lang-${language}`).click();
      const input = await page.locator(`#${field}`).evaluate((node) => ({
        value: node.value, start: node.selectionStart, active: document.activeElement === node,
        align: getComputedStyle(node).textAlign, direction: getComputedStyle(node).direction,
      }));
      expect(input).toEqual({ value: original, start: 1, active: true, align: language === "he" ? "right" : "left", direction: "ltr" });
    }
  }
  await page.locator("#lang-he").click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#pot")).toHaveValue("");
});

test("clipboard explicit action and denied-permission feedback", async ({ page }) => {
  await page.addInitScript(() => {
    window.copyCalls = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text) => { window.copyCalls.push(text); },
    } });
  });
  await start(page);
  await hand(page);
  expect(await page.evaluate(() => window.copyCalls)).toEqual([]);
  await page.locator('[data-copy="bet-3-3"]').click();
  expect(await page.evaluate(() => window.copyCalls)).toEqual(["129.6"]);
  await expect(page.locator("#feedback")).toContainText("129.6");
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new DOMException("Denied", "NotAllowedError"); }; });
  await page.locator('[data-copy="bet-3-1"]').click();
  await expect(page.locator("#feedback")).toContainText("Copy was blocked");
  expect(await page.evaluate(() => getSelection().toString())).toBe("40.0");
});

test("theme/system, reduced motion, modal focus and public GitHub link", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await start(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
  await page.locator("#theme").selectOption("light");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
  await page.locator("#theme").selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
  expect(await page.locator("#github").getAttribute("href")).toBe("https://github.com/MagalHoresh/PokerSPRCalculator");
  await expect(page.locator("#github")).toHaveAttribute("title", "Public source code; no sign-in is required.");
  await page.locator("#assumptions-open").click();
  await expect(page.locator("#assumptions-dialog")).toBeVisible();
  await expect(page.locator("#assumptions-dialog")).toContainText("Public source code; no sign-in is required.");
  await page.keyboard.press("Escape");
  await expect(page.locator("#assumptions-dialog")).not.toBeVisible();
  await expect(page.locator("#assumptions-open")).toBeFocused();
  await page.locator("#lang-he").click();
  await expect(page.locator("#github")).toHaveAttribute("title", "קוד המקור גלוי לציבור, ללא צורך בהתחברות.");
});

test("appearance has no pointer focus box but keeps rounded keyboard focus", async ({ page }, info) => {
  await start(page);
  await page.locator("#theme").click();
  await page.locator("#theme").selectOption("light");
  await expect(page.locator("#theme")).toBeFocused();
  expect((await page.locator("#theme").boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect((await page.locator(".theme-control").boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.locator("#theme").evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("none");
  expect(await page.locator(".theme-control").evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("none");
  await page.screenshot({ path: info.outputPath("theme-pointer.png") });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#theme")).toBeFocused();
  const focus = await page.locator(".theme-control").evaluate((node) => ({
    outline: getComputedStyle(node).outlineStyle,
    width: getComputedStyle(node).outlineWidth,
    radius: getComputedStyle(node).borderRadius,
  }));
  expect(focus).toEqual({ outline: "solid", width: "3px", radius: "10px" });
  await page.keyboard.press("ArrowDown");
  expect(await page.locator(".theme-control").evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
  await page.locator("#pot").click();
  expect(await page.locator("#pot").evaluate((node) => getComputedStyle(node).borderColor)).not.toBe(
    await page.locator("#stack").evaluate((node) => getComputedStyle(node).borderColor),
  );
});

test("chronological street paths stay visible, stable and correctly mirrored", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  await hand(page);
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const language of ["en", "he"]) {
      await page.locator(`#lang-${language}`).click();
      await expect(page.locator(".three .bet-label strong")).toHaveText(language === "en" ? ["BET NOW", "Turn", "River"] : ["הימור כעת", "טרן", "ריבר"]);
      await expect(page.locator(".two .bet-label strong")).toHaveText(language === "en" ? ["BET NOW", "River"] : ["הימור כעת", "ריבר"]);
      await expect(page.locator(".three .step-context strong")).toHaveText(language === "en" ? "All-in" : "אול-אין");
      const steps = await page.locator(".three .bet-step").evaluateAll((nodes) => nodes.map((node) => {
        const box = node.getBoundingClientRect();
        const number = node.querySelector(".number");
        return {
          x: box.x, y: box.y, width: box.width, height: box.height,
          text: number.textContent, direction: getComputedStyle(number).direction,
          animation: getComputedStyle(node).animationName,
          transition: getComputedStyle(number).transitionDuration,
          arrow: getComputedStyle(node, "::before").content,
          font: parseFloat(getComputedStyle(number).fontSize),
        };
      }));
      expect(steps.map((step) => step.text)).toEqual(["40.0", "72.0", "129.6"]);
      for (const step of steps) {
        expect(step.direction).toBe("ltr");
        expect(step.animation).toBe("none");
        expect(step.transition).toBe("0s");
        expect(step.font).toBeGreaterThanOrEqual(48);
      }
      for (let i = 1; i < steps.length; i++) {
        if (width > 600) {
          expect(steps[i].y).toBe(steps[0].y);
          if (language === "en") expect(steps[i].x).toBeGreaterThan(steps[i - 1].x + steps[i - 1].width);
          else expect(steps[i].x + steps[i].width).toBeLessThan(steps[i - 1].x);
          expect(steps[i].arrow).toBe(language === "en" ? '"→"' : '"←"');
        } else {
          expect(steps[i].y).toBeGreaterThan(steps[i - 1].y + steps[i - 1].height);
          expect(steps[i].arrow).toBe('"↓"');
        }
      }
      await noOverflow(page);
      const before = await page.locator("#bet-3-3").boundingBox();
      await page.locator("#stack").fill("500");
      await page.locator("#stack").fill("241.6");
      await expect(page.locator("#bet-3-3")).toHaveText("129.6");
      expect(await page.locator("#bet-3-3").boundingBox()).toEqual(before);
    }
  }
});

for (const [width, height] of [[320, 640], [390, 844], [1280, 800], [1440, 900]]) {
  test(`amount text starts at label edge in either language ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await start(page);
    for (const [pot, stack, facing] of [
      ["", "", ""],
      ["16", "89", "3"],
      ["100", "241.6", "3"],
      ["1000000000000", "1000000000000", "1000000000000"],
      ["1000000000000", "0.001", "0.001"],
    ]) {
      await hand(page, pot, stack, facing);
      for (const language of ["he", "en"]) {
        await page.locator("#lang-" + language).click();
        await leadingAmounts(page, language);
      }
      if (pot === "16") {
        for (const [id, value] of [["bet-2-1", "19.9"], ["bet-2-2", "69.1"], ["bet-3-1", "10.4"], ["bet-3-2", "23.8"], ["bet-3-3", "54.8"]]) {
          await expect(page.locator(`#${id}`)).toHaveText(value);
        }
        await page.screenshot({ path: info.outputPath("english-leading-amounts.png"), fullPage: true });
        await page.locator("#lang-he").click();
        await page.screenshot({ path: info.outputPath("hebrew-leading-amounts.png"), fullPage: true });
      }
    }
    await hand(page);
    for (const field of ["pot", "stack", "facingBet"]) {
      const input = page.locator(`#${field}`);
      await input.focus();
      await input.evaluate((node) => node.setSelectionRange(1, 1));
      const original = await input.inputValue();
      for (const language of ["en", "he", "en"]) {
        await page.locator("#lang-" + language).click();
        await expect(input).toBeFocused();
        await expect(input).toHaveValue(original);
        expect(await input.evaluate((node) => node.selectionStart)).toBe(1);
        expect(await input.evaluate((node) => getComputedStyle(node).textAlign)).toBe(language === "he" ? "right" : "left");
        expect(await input.evaluate((node) => getComputedStyle(node).direction)).toBe("ltr");
        await leadingAmounts(page, language);
      }
    }
    await expect(page.locator("#bet-3-1")).toHaveText("40.0");
    await expect(page.locator("#bet-3-2")).toHaveText("72.0");
    await expect(page.locator("#bet-3-3")).toHaveText("129.6");
  });
}

for (const [width, height] of [[390, 844], [1280, 800]]) {
  test(`amount editors use one focused border in light and dark ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await start(page);
    await hand(page);
    for (const theme of ["light", "dark"]) {
      await page.locator("#theme").selectOption(theme);
      for (const field of ["pot", "stack", "facingBet"]) {
        const input = page.locator(`#${field}`);
        for (const method of ["pointer", "keyboard"]) {
          if (method === "pointer") await input.click();
          else await page.keyboard.press(`Alt+${["pot", "stack", "facingBet"].indexOf(field) + 1}`);
          await expect(input).toBeFocused();
          const styles = await page.locator(".amount-field input").evaluateAll((nodes) => nodes.map((node) => {
            const style = getComputedStyle(node);
            return {
              id: node.id, focused: document.activeElement === node,
              outline: style.outlineStyle, shadow: style.boxShadow,
              border: style.borderTopColor, width: style.borderTopWidth, radius: style.borderRadius,
            };
          }));
          expect(styles.filter((style) => style.focused)).toHaveLength(1);
          const focused = styles.find((style) => style.id === field);
          expect(focused.outline).toBe("none");
          expect(focused.shadow).toBe("none");
          expect(focused.width).toBe("2px");
          expect(focused.radius).toBe("10px");
          for (const inactive of styles.filter((style) => style.id !== field)) {
            expect(inactive.border).not.toBe(focused.border);
          }
          if (field === "stack" && method === "keyboard") {
            const box = await page.locator(".primary-inputs").boundingBox();
            await page.screenshot({ path: info.outputPath(`single-focus-${theme}.png`), clip: {
              x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12,
            } });
          }
        }
      }
      await page.locator("#stack").fill("oops");
      await expect(page.locator("#stack")).toHaveAttribute("aria-invalid", "true");
      await expect(page.locator("#stack-error")).toBeVisible();
      const invalid = await page.locator("#stack").evaluate((node) => ({
        focused: document.activeElement === node,
        outline: getComputedStyle(node).outlineStyle,
        shadow: getComputedStyle(node).boxShadow,
        border: getComputedStyle(node).borderTopColor,
        error: getComputedStyle(document.getElementById("stack-error")).color,
      }));
      expect(invalid).toEqual({ focused: true, outline: "none", shadow: "none", border: invalid.error, error: invalid.error });
      await page.locator("#stack").fill("241.6");
      await page.emulateMedia({ contrast: "more" });
      expect(await page.locator("#stack").evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("none");
      expect(await page.locator("#stack").evaluate((node) => getComputedStyle(node).boxShadow)).toBe("none");
      await page.emulateMedia({ contrast: "no-preference" });
    }
  });
}

test("amount focus honors the system highlight in forced colors", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "WebKit does not emulate Windows forced-color mode.");
  await page.emulateMedia({ forcedColors: "active" });
  await start(page);
  await page.keyboard.press("Alt+1");
  const focused = await page.locator("#pot").evaluate((node) => {
    const probe = document.createElement("span");
    probe.style.color = "Highlight";
    document.body.append(probe);
    const highlight = getComputedStyle(probe).color;
    probe.remove();
    return { border: getComputedStyle(node).borderColor, outline: getComputedStyle(node).outlineStyle, highlight };
  });
  expect(focused.border).toBe(focused.highlight);
  expect(focused.outline).toBe("none");
  await page.locator("#pot").fill("oops");
  await expect(page.locator("#pot-error")).toBeVisible();
  await expect(page.locator("#pot")).toBeFocused();
});

test("viewport/keyboard-height changes and 200% equivalent layout without overflow", async ({ page }, info) => {
  await page.setViewportSize({ width: 640, height: 400 });
  await start(page);
  await hand(page);
  await noOverflow(page);
  await page.setViewportSize({ width: 390, height: 400 });
  await page.locator("#stack").focus();
  await expect(page.locator("#stack")).toBeInViewport();
  await page.locator("#stack").fill("500");
  await noOverflow(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("landscape.png"), fullPage: true });
});

test("comma locale uses deterministic decimal and no calculation network or storage", async ({ browser }) => {
  const context = await browser.newContext({ locale: "de-DE", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const requests = [];
  await start(page);
  page.on("request", (request) => requests.push(request.url()));
  await hand(page, "100", "241,6", "3");
  await expect(page.locator("#bet-3-3")).toHaveText("129,6");
  await page.locator("#lang-he").click();
  await expect(page.locator("#bet-3-3")).toHaveText("129,6");
  await page.locator("#pot").fill("1.000");
  await expect(page.locator("#bet-3-3")).toHaveText("—");
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie }))).toEqual({ local: 0, session: 0, cookie: "" });
  await context.close();
});

test("touch mobile starts at primary inputs without opening keyboard and supports done/reset", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "en-US" });
  const page = await context.newPage();
  await start(page);
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe("INPUT");
  expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
  await page.locator("#pot").tap();
  await page.locator("#pot").fill("100");
  await page.keyboard.press("Enter");
  await expect(page.locator("#stack")).toBeFocused();
  await page.locator("#stack").fill("241.6");
  await page.keyboard.press("Enter");
  await expect(page.locator("#stack")).not.toBeFocused();
  await expect(page.locator("#bet-3-3")).toHaveText("129.6");
  await page.locator("#new-hand").tap();
  await expect(page.locator("#pot")).toHaveValue("");
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe("INPUT");
  await noOverflow(page);
  await context.close();
});

test("increased contrast keeps secondary text readable in system dark and explicit themes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", contrast: "more" });
  await start(page);
  for (const theme of ["system", "light", "dark"]) {
    await page.locator("#theme").selectOption(theme);
    const ratio = await page.locator("#pot-hint").evaluate((node) => {
      const parse = (text) => text.match(/[\d.]+/gu).slice(0, 3).map(Number).map((value) => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      const luminance = (text) => parse(text).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const foreground = luminance(getComputedStyle(node).color);
      const background = luminance(getComputedStyle(node.closest(".panel")).backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    expect(ratio, theme).toBeGreaterThanOrEqual(4.5);
  }
});

test("secure browser clipboard copies the displayed amount only after a click", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "WebKit permission automation does not expose clipboard grants; success/denial logic is tested above.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await start(page);
  await hand(page);
  await page.locator('[data-copy="bet-3-3"]').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("129.6");
  await expect(page.locator("#feedback")).toContainText("129.6");
  await page.locator("#lang-he").click();
  await page.locator('[data-copy="bet-3-2"]').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("72.0");
});
