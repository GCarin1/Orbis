// Make docs/brand/orbis.ico (the icon of the Windows shortcuts) from docs/brand/app-icon.svg,
// the source of truth. Needs Playwright's Chromium, or ORBIS_BROWSER_EXECUTABLE.   npm run brand:ico
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { packIco } from "./ico.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = `data:image/svg+xml;base64,${readFileSync(path.join(root, "docs/brand/app-icon.svg")).toString("base64")}`;
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage();
const images = [];
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent"><img src="${svg}" style="display:block;width:${size}px;height:${size}px"></body>`);
  await page.locator("img").evaluate((img) => img.decode());
  images.push({ size, png: await page.screenshot({ omitBackground: true }) });
}
await browser.close();

const file = path.join(root, "docs/brand/orbis.ico");
writeFileSync(file, packIco(images));
console.log("wrote", path.relative(root, file), `(${SIZES.join(", ")} px)`);
