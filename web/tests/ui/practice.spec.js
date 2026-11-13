import { test, expect } from "@playwright/test";
import { fraction } from "../../src/core.js";

test.use({ isMobile: true, hasTouch: true, reducedMotion: "reduce" });

async function openPractice(page, { mode = "live", e = 3, language = "en", seat } = {}) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ streets, opponentSeat, seats }) => {
    let calls = 0;
    Math.random = () => {
      const call = calls++;
      if (call === 0) return streets === 3 ? 0.75 : 0.25;
      if (call === 8 && opponentSeat !== undefined) return (opponentSeat - 0.5) / (seats - 1);
      return 0.4;
    };
  }, { streets: e, opponentSeat: seat, seats: mode === "live" ? 9 : 6 });
  await page.clock.install();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.locator(`#lang-${language}`).click();
  await page.locator("#nav-practice").click();
  await page.locator(`#practice-${mode}`).click();
  await expect(page.locator("#practice-current-stake")).toHaveText(mode === "live" ? "5 / 10" : "1 / 2");
  await page.locator("#practice-start").click();
  await expect(page.locator("#practice-kind")).toHaveText(`${e}E`);
  await page.clock.runFor(1000);
  await expect(page.locator("#practice-bet")).toHaveJSProperty("readOnly", false);
  expect(errors).toEqual([]);
}

async function fit(page) {
  await page.clock.runFor(50);
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const selectors = [
      ".app-header button", "#theme", ".page-nav button", ".practice-mode button", ".practice-menu > summary",
      ".practice-stats", "#practice-units button", "#practice-kind", "#practice-goal", "#practice-progress",
      ".poker-seat:not(.inactive) .seat-card", ".seat-stack", ".seat-name", ".seat-position", ".table-pot", ".seat-speech",
      "#practice-bet", "#practice-submit", "#practice-shortcuts button", "#practice-bet-error",
      ".practice-range-spr", ".practice-range-value", ".practice-range-caption",
      ".practice-range-track", "#practice-result-icon", "#practice-next",
    ];
    const nodes = [...document.querySelectorAll(selectors.join(","))]
      .filter((node) => node.getBoundingClientRect().width && node.getBoundingClientRect().height);
    const labels = [...document.querySelectorAll(".practice-range-value, .practice-range-caption")]
      .map((node) => node.getBoundingClientRect());
    const overlaps = labels.flatMap((box, index) => labels.slice(index + 1).filter((other) =>
      box.left < other.right - 1 && box.right > other.left + 1
      && box.top < other.bottom - 1 && box.bottom > other.top + 1));
    const pot = document.querySelector(".table-pot").getBoundingClientRect();
    const tableOverlaps = [...document.querySelectorAll(".poker-seat:not(.inactive) .seat-card")]
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width && pot.width && box.left < pot.right - 1 && box.right > pot.left + 1
          && box.top < pot.bottom - 1 && box.bottom > pot.top + 1;
      }).map((node) => node.textContent);
    return {
      width: doc.clientWidth, height: doc.clientHeight, scrollWidth: doc.scrollWidth, scrollHeight: doc.scrollHeight,
      clipped: nodes.filter((node) => {
        const box = node.getBoundingClientRect();
        return box.left < -1 || box.right > doc.clientWidth + 1 || box.top < -1 || box.bottom > doc.clientHeight + 1
          || (node.matches(".practice-range-value, .practice-range-caption, .seat-stack")
            && node.scrollWidth > node.clientWidth + 1);
      }).map((node) => ({ id: node.id || node.className, text: node.textContent, box: node.getBoundingClientRect().toJSON() })),
      smallControls: nodes.filter((node) => node.matches("button, input, select, summary")
        && (node.getBoundingClientRect().width < 44 || node.getBoundingClientRect().height < 44)).map((node) => node.id),
      labelOverlaps: overlaps.length,
      tableOverlaps,
      amounts: [...document.querySelectorAll(".practice-range-amount")].map((node) => parseFloat(getComputedStyle(node).fontSize)),
    };
  });
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.width);
  expect(metrics.scrollHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.height);
  expect(metrics.clipped, JSON.stringify(metrics)).toEqual([]);
  expect(metrics.smallControls, JSON.stringify(metrics)).toEqual([]);
  expect(metrics.labelOverlaps, JSON.stringify(metrics)).toBe(0);
  expect(metrics.tableOverlaps, JSON.stringify(metrics)).toEqual([]);
  expect(metrics.amounts.every((size) => size >= 14)).toBe(true);
}

async function idealBet(page, streets, mode) {
  const amounts = await page.evaluate(() => ({
    pot: Number(document.querySelector(".table-pot > strong bdi").textContent),
    stacks: [...document.querySelectorAll(".seat-stack bdi")].map((node) => Number(node.textContent)),
  }));
  const ideal = amounts.pot * fraction(Math.min(...amounts.stacks) / amounts.pot, streets);
  return mode === "live" ? String(Math.round(ideal)) : ideal.toFixed(2);
}

for (const [width, height] of [[320, 518], [320, 568], [360, 640], [390, 844], [402, 874], [430, 932]]) {
  for (const language of ["en", "he"]) {
    for (const [mode, e, outcome] of [
      ["online", 2, "correct"], ["online", 3, "timeout"], ["live", 2, "incorrect"], ["live", 3, "correct"],
    ]) {
      test(`practice fits ${width}x${height} ${language} ${mode} ${e}E ${outcome}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await openPractice(page, { mode, e, language });
        await fit(page);
        if (outcome === "timeout") {
          await page.clock.fastForward(31_000);
        } else {
          await page.locator("#practice-bet").fill(outcome === "incorrect" ? "1" : await idealBet(page, e, mode));
          await page.locator("#practice-submit").click();
          await expect(page.locator("#practice-bet")).toHaveValue("");
          if (mode === "live" && e === 3) {
            await expect(page.locator("#practice-result")).toBeHidden();
            await expect(page.locator("#practice-played")).toHaveText("0");
            await page.clock.runFor(3000);
            await fit(page);
            await page.locator("#practice-bet").fill(await idealBet(page, 2, mode));
            await page.locator("#practice-submit").click();
          }
        }
        await expect(page.locator("#practice-stage")).toHaveAttribute("data-state", outcome);
        await expect(page.locator(".practice-bet-range")).toHaveCount(mode === "live" && e === 3 ? 2 : 1);
        await expect(page.locator("#practice-played")).toHaveText("1");
        await fit(page);
        if (mode === "online") {
          await page.locator("#practice-bb").click();
          await fit(page);
        }
        await page.locator("#practice-next").click();
        await expect(page.locator("#practice-result")).toBeHidden();
        await page.clock.runFor(1000);
        await fit(page);
      });
    }
  }
}

for (const [mode, seats] of [["live", 9], ["online", 6]]) {
  for (let seat = 1; seat < seats; seat++) {
    test(`short-screen ${mode} opponent seat ${seat} remains readable`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 518 });
      await openPractice(page, { mode, seat });
      await fit(page);
      if (mode === "live") {
        await page.locator("#practice-bet").fill(await idealBet(page, 3, mode));
        await page.locator("#practice-submit").click();
        await expect(page.locator("#practice-bet")).toHaveValue("");
        await page.clock.runFor(3000);
        await fit(page);
      }
    });
  }
}

for (const height of [724, 844]) {
  test(`notch insets preserve the ${height}px mobile layout`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await page.route("**/styles.css", async (route) => {
      const response = await route.fetch();
      const css = (await response.text()).replaceAll("env(safe-area-inset-top)", "44px")
        .replaceAll("env(safe-area-inset-bottom)", "34px");
      await route.fulfill({ response, body: css });
    });
    await openPractice(page, { mode: "online" });
    await fit(page);
    await page.clock.fastForward(31_000);
    await expect(page.locator("#practice-result")).toBeVisible();
    await fit(page);
  });
}

test("short keyboard and zoomed layouts retain scrolling and reachable controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPractice(page);
  await page.setViewportSize({ width: 390, height: 360 });
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.locator("#practice-submit").scrollIntoViewIfNeeded();
  await expect(page.locator("#practice-submit")).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.body.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.locator("#practice-submit").scrollIntoViewIfNeeded();
  await expect(page.locator("#practice-submit")).toBeInViewport();
});
