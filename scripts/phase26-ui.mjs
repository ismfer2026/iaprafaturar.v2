import { chromium } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const executablePath =
  process.env.PHASE26_CHROMIUM_PATH ??
  "C:\\Users\\Ismael Santos\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe";

if (!existsSync(executablePath)) throw new Error(`Existing Chromium not found: ${executablePath}`);

const apps = [
  {
    name: "professional",
    dist: "apps/professional/dist",
    port: 4173,
    baseUrl: process.env.PHASE26_PROFESSIONAL_URL ?? "http://127.0.0.1:4173",
    routes: ["/login", "/recuperar-senha", "/reset-password", "/rota-inexistente", "/dashboard"],
  },
  {
    name: "admin",
    dist: "apps/admin/dist",
    port: 4175,
    baseUrl: process.env.PHASE26_ADMIN_URL ?? "http://127.0.0.1:4175",
    routes: ["/login", "/rota-inexistente", "/dashboard"],
  },
  {
    name: "client",
    dist: "apps/client/dist",
    port: 4174,
    baseUrl: process.env.PHASE26_CLIENT_URL ?? "http://127.0.0.1:4174",
    routes: ["/", "/agendar/slug-inexistente", "/chat/slug-inexistente", "/rota-inexistente"],
  },
];
const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];
const failures = [];
let passes = 0;

const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

function serve(app) {
  const root = normalize(join(import.meta.dirname, "..", app.dist));
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      const requested = normalize(join(root, pathname));
      const target =
        requested.startsWith(root) && existsSync(requested) && statSync(requested).isFile()
          ? requested
          : join(root, "index.html");
      response.setHeader("content-type", mimeTypes[extname(target)] ?? "application/octet-stream");
      response.end(readFileSync(target));
    });
    server.on("error", reject);
    server.listen(app.port, "127.0.0.1", () => resolve(server));
  });
}

const servers = await Promise.all(apps.map(serve));
const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const app of apps) {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      for (const route of app.routes) {
        const runtimeErrors = [];
        page.on("pageerror", (error) => runtimeErrors.push(error.message));
        let response;
        try {
          response = await page.goto(`${app.baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
        } catch (error) {
          failures.push(`${app.name} ${viewport.name} ${route}: ${error instanceof Error ? error.message.split("\n")[0] : "navigation failed"}`);
          continue;
        }
        const metrics = await page.evaluate(() => {
          const focusable = [...document.querySelectorAll("button,a,input,select,textarea")];
          const unnamed = focusable.filter((element) => {
            const text = element.textContent?.trim();
            const aria = element.getAttribute("aria-label");
            const title = element.getAttribute("title");
            const placeholder = element.getAttribute("placeholder");
            const labelledBy = element.getAttribute("aria-labelledby");
            const id = element.getAttribute("id");
            const explicitLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
            const implicitLabel = element.closest("label");
            return !text && !aria && !title && !placeholder && !labelledBy && !explicitLabel && !implicitLabel;
          }).length;
          return {
            title: document.title,
            bodyText: document.body.innerText.trim(),
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            unnamed,
          };
        });
        const label = `${app.name} ${viewport.name} ${route}`;
        if (!response || response.status() >= 500) failures.push(`${label}: HTTP ${response?.status() ?? "none"}`);
        else if (runtimeErrors.length > 0) failures.push(`${label}: runtime error ${runtimeErrors[0]}`);
        else if (!metrics.bodyText) failures.push(`${label}: blank body`);
        else if (metrics.scrollWidth > metrics.clientWidth + 2) {
          failures.push(`${label}: horizontal overflow ${metrics.scrollWidth}/${metrics.clientWidth}`);
        }
        else if (metrics.unnamed > 0) failures.push(`${label}: ${metrics.unnamed} unnamed focusable control(s)`);
        else passes += 1;
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
}

console.log(`Phase 26 UI audit: ${passes} checks passed.`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
}
