import { mkdir, readFile, writeFile, copyFile, rm, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist");
await mkdir(output, { recursive: true });
// The publish root is an explicit allowlist, never the repository or native artifacts.
const assets = ["index.html", "styles.css", "app.js", "core.js", "i18n.js", "icon.svg"];
const permitted = new Set([...assets, "native-copy.js", "staticwebapp.config.json", "robots.txt"]);
for (const entry of await readdir(output)) {
  if (!permitted.has(entry)) throw new Error(`Unexpected file in publish directory: ${entry}. Review before deployment.`);
}
for (const asset of assets) await copyFile(resolve(root, "src", asset), resolve(output, asset));
const translations = JSON.parse(await readFile(resolve(root, "../windows/PokerCalculator.Core/Strings.json"), "utf8"));
const names = JSON.stringify(translations);
await writeFile(resolve(output, "native-copy.js"), `// Generated from the tested native language catalog.\nexport default ${names};\n`);
await writeFile(resolve(output, "robots.txt"), "User-agent: *\nAllow: /\n");
const config = resolve(root, "staticwebapp.config.json");
try { await copyFile(config, resolve(output, "staticwebapp.config.json")); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  await rm(resolve(output, "staticwebapp.config.json"), { force: true });
}
console.log(`Built ${output}; no runtime dependencies, backend, accounts or analytics.`);
