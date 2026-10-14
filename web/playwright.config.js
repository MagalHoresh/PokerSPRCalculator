import { defineConfig } from "@playwright/test";

const external = process.env.POKER_TEST_URL;
if (external) {
  const url = new URL(external);
  if (url.protocol !== "https:" || url.username || url.password
      || !["poker-spr-calculator.magalhoresh.com", "kind-plant-06127fa0f.3.azurestaticapps.net"].includes(url.hostname)) {
    throw new Error("Browser validation is scoped to the two approved HTTPS poker endpoints only.");
  }
}
export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: true,
  workers: 3,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: external ?? "http://127.0.0.1:4173",
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: external ? undefined : {
    command: "npm run build && node scripts/serve.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
