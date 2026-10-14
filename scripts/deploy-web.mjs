import { spawnSync } from "node:child_process";
import { readdir, lstat, readFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = Object.freeze({
  subscription: "573de2b2-22e1-4dae-b848-62c799fd63cc",
  group: "rg-poker-spr-calculator-prod-f241",
  name: "swa-poker-spr-calculator-prod-f241",
});
if (!process.argv.includes("--approved")) throw new Error("Obtain deployment approval, then pass --approved for the fixed poker target.");
const auditPath = process.env.POKER_DEPLOY_AUDIT_PATH;
if (!auditPath || !resolve(auditPath).startsWith(resolve(root, ".copilot-azure/sessions") + "/")) {
  throw new Error("Set POKER_DEPLOY_AUDIT_PATH to deploy-audit.log inside the private onboarding session.");
}
function audit(action, status) {
  appendFileSync(auditPath, `${new Date().toISOString()} | ${action} | ${status}\n`, { mode: 0o600 });
}
const folder = resolve(root, "web/dist");
const allowed = ["index.html", "styles.css", "app.js", "core.js", "i18n.js", "icon.svg", "native-copy.js", "robots.txt", "staticwebapp.config.json"].sort();
const present = (await readdir(folder)).sort();
if (JSON.stringify(present) !== JSON.stringify(allowed)) throw new Error("Publish output differs from the reviewed asset allowlist. Rebuild and inspect it.");
for (const file of allowed) {
  const info = await lstat(resolve(folder, file));
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Invalid publish file: ${file}`);
}
const config = JSON.parse(await readFile(resolve(folder, "staticwebapp.config.json"), "utf8"));
if (!config.globalHeaders?.["Content-Security-Policy"]?.includes("connect-src 'none'")) {
  throw new Error("Reviewed client-only security headers are missing.");
}
function az(args, secret = false) {
  const action = secret ? "az staticwebapp secrets list (credential output redacted)" : `az ${args[0]} ${args[1]} ${target.name}`;
  audit(action, "started");
  const result = spawnSync("az", [...args, "--only-show-errors"], { encoding: "utf8", timeout: 90_000, maxBuffer: 4 * 1024 * 1024 });
  audit(action, result.error || result.status !== 0 ? "failed" : "succeeded");
  if (result.error || result.status !== 0) {
    if (!secret && result.stderr) process.stderr.write(result.stderr);
    throw new Error(secret ? "Unable to retrieve the poker resource deployment credential; no secret output is printed." : `Azure read failed: ${args[0]} ${args[1]}`);
  }
  return result.stdout.trim();
}
const metadata = JSON.parse(az(["staticwebapp", "show", "--subscription", target.subscription, "--resource-group", target.group, "--name", target.name, "-o", "json"]));
if (metadata.name !== target.name || metadata.resourceGroup?.toLowerCase() !== target.group
    || metadata.sku?.name !== "Free" || metadata.location?.replaceAll(" ", "").toLowerCase() !== "eastus2") {
  throw new Error("The deployment target does not match the approved poker-only Free resource.");
}
const token = az(["staticwebapp", "secrets", "list", "--subscription", target.subscription, "--resource-group", target.group, "--name", target.name, "--query", "properties.apiKey", "-o", "tsv"], true);
if (!token || /\s/u.test(token)) throw new Error("No usable resource-scoped deployment credential was returned.");
const cli = process.env.SWA_CLI_PATH ?? "swa";
audit(`swa deploy ${target.name} production (token in environment only)`, "started");
const result = spawnSync(cli, [
  "deploy", folder, "--env", "production",
  "--app-name", target.name, "--resource-group", target.group,
  "--subscription-id", target.subscription, "--no-use-keychain",
], {
  env: { ...process.env, SWA_CLI_DEPLOYMENT_TOKEN: token, SWA_CLI_TELEMETRY_DISABLED: "1" },
  encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024,
});
audit(`swa deploy ${target.name} production`, result.error || result.status !== 0 ? "failed" : "succeeded");
for (const output of [result.stdout, result.stderr]) {
  if (output) process.stdout.write(output.replaceAll(token, "[redacted]"));
}
if (result.error || result.status !== 0) throw new Error("Static deployment failed; no other target or paid fallback was attempted.");
console.log(`Deployed only Poker SPR Calculator: https://${metadata.defaultHostname}`);
