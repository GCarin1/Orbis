// Render the PNG icons of the Orbis brand from the SVG sources in docs/brand
// (the SVGs are the source of truth). Needs Playwright's Chromium, or
// ORBIS_BROWSER_EXECUTABLE.   npm run brand:icons
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brand = path.join(root, "docs/brand");
const pub = path.join(root, "packages/web/public");
const dataUrl = (file) => `data:image/svg+xml;base64,${readFileSync(path.join(brand, file)).toString("base64")}`;

const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage();

async function png(svg, size, out, background = "transparent") {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:${background}"><img src="${dataUrl(svg)}" style="display:block;width:${size}px;height:${size}px"></body>`);
  await page.locator("img").evaluate((img) => img.decode());
  await page.screenshot({ path: out, omitBackground: background === "transparent" });
  console.log("wrote", path.relative(root, out));
}

await png("app-icon.svg", 192, path.join(pub, "icon-192.png"));
await png("app-icon.svg", 512, path.join(pub, "icon-512.png"));
await png("app-icon-maskable.svg", 512, path.join(pub, "icon-maskable-512.png"));
await png("app-icon.svg", 180, path.join(pub, "apple-touch-icon.png"), "#0b1020");
await png("app-icon.svg", 512, path.join(brand, "app-icon-512.png"));

// Social preview (GitHub → Settings → Social preview): 1280×640.
await page.setViewportSize({ width: 1280, height: 640 });
await page.setContent(`<body style="margin:0;width:1280px;height:640px;display:grid;place-items:center;
  background:radial-gradient(circle at 30% 40%, #16224a 0%, #0b1020 60%);font-family:Poppins,Montserrat,'Segoe UI',Arial,sans-serif">
  <div style="text-align:center"><img src="${dataUrl("logo-dark.svg")}" style="width:860px">
  <p style="color:#8ea0c8;letter-spacing:6px;font-size:22px;margin-top:36px">MORE AGENTS. BIGGER POSSIBILITIES.</p></div></body>`);
await page.locator("img").evaluate((img) => img.decode());
await page.screenshot({ path: path.join(brand, "social-preview.png") });
console.log("wrote docs/brand/social-preview.png");

// The favicon and in-app mark are the SVG mark itself.
copyFileSync(path.join(brand, "mark.svg"), path.join(pub, "icon.svg"));
copyFileSync(path.join(brand, "app-icon.svg"), path.join(pub, "app-icon.svg"));
console.log("copied mark.svg → packages/web/public/icon.svg, app-icon.svg");
await browser.close();
