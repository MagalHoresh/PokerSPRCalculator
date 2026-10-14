import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const port = Number(process.env.PORT ?? 4173);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain" };
let config = {};
try { config = JSON.parse(await readFile(resolve(root, "staticwebapp.config.json"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const previewHeaders = { ...config.globalHeaders };
// This loopback server is HTTP. WebKit otherwise upgrades its local assets to nonexistent TLS.
// The deployed config retains HTTPS upgrading and HSTS; only this local preview omits them.
if (previewHeaders["Content-Security-Policy"]) {
  previewHeaders["Content-Security-Policy"] = previewHeaders["Content-Security-Policy"].replace(/;\s*upgrade-insecure-requests/gu, "");
}
delete previewHeaders["Strict-Transport-Security"];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const path = resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!path.startsWith(root + "/") || !(await stat(path)).isFile()) {
      res.writeHead(404).end("Not found"); return;
    }
    res.writeHead(200, { ...previewHeaders, "Content-Type": types[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(await readFile(path));
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR" || error instanceof URIError) res.writeHead(404).end("Not found");
    else { console.error(error); res.writeHead(500).end("Preview failed"); }
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Poker preview: http://127.0.0.1:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
