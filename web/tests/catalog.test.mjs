import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const [html, app, source, nativeSource] = await Promise.all([
  readFile(new URL("../src/index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/i18n.js", import.meta.url), "utf8"),
  readFile(new URL("../../windows/PokerCalculator.Core/Strings.json", import.meta.url), "utf8"),
]);
const native = JSON.parse(nativeSource);
const literal = source.slice(source.indexOf("const web ="), source.indexOf("export function t"));
const web = runInNewContext(`${literal}\nweb;`, Object.create(null), { timeout: 1000 });

test("every website label and directly requested translation exists in English and Hebrew", () => {
  const keys = new Set([
    ...[...html.matchAll(/data-t="([^"]+)"/gu)].map((match) => match[1]),
    ...[...app.matchAll(/translate\("([^"]+)"/gu)].map((match) => match[1]),
  ]);
  for (const language of ["en", "he"]) for (const key of keys) {
    assert.equal(typeof (web[language][key] ?? native[language][key]), "string", `${language}: ${key}`);
  }
  for (const key of new Set([...Object.keys(web.en), ...Object.keys(web.he)])) {
    const placeholders = (text) => [...text.matchAll(/\{([A-Za-z]+)\}/gu)].map((match) => match[1]).sort();
    const english = web.en[key] ?? native.en[key];
    const hebrew = web.he[key] ?? native.he[key];
    assert.equal(typeof english, "string", `en: ${key}`);
    assert.equal(typeof hebrew, "string", `he: ${key}`);
    assert.deepEqual(placeholders(english), placeholders(hebrew), key);
  }
});

test("static UI references resolve to unique elements, including new navigation/forms", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "Duplicate HTML ids");
  for (const match of app.matchAll(/\$\("([^"]+)"\)/gu)) assert.ok(ids.includes(match[1]), `Missing #${match[1]}`);
  for (const match of html.matchAll(/(?:for|aria-controls|aria-describedby|aria-labelledby)="([^"]+)"/gu)) {
    for (const id of match[1].split(" ")) assert.ok(ids.includes(id), `Missing associated #${id}`);
  }
});
