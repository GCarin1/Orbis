// Render the Android app's launcher icons from the brand's SVGs (docs/brand stays the source of truth):
// the legacy square icon per density, and the adaptive icon's foreground (the mark inside the 66 dp safe
// zone; its background is the brand's night blue in res/values/colors.xml). Needs Playwright's Chromium,
// or ORBIS_BROWSER_EXECUTABLE.   npm run brand:android
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brand = path.join(root, "docs/brand");
const res = path.join(root, "packages/android/app/src/main/res");
const svgUrl = (text) => `data:image/svg+xml;base64,${Buffer.from(text).toString("base64")}`;

const appIcon = readFileSync(path.join(brand, "app-icon.svg"), "utf8");
// The maskable icon without its background square: the mark alone, already inside the safe zone.
const foreground = readFileSync(path.join(brand, "app-icon-maskable.svg"), "utf8").replace(/<rect width="128" height="128" fill="#0b1020"\/>/, "");
if (foreground.includes('fill="#0b1020"/>\n  <g')) throw new Error("the maskable icon's background was not removed");

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage();

async function png(svg, size, out, round = false) {
  await page.setViewportSize({ width: size, height: size });
  const clip = round ? "border-radius:50%;overflow:hidden;" : "";
  await page.setContent(
    `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;${clip}"><img src="${svgUrl(svg)}" style="display:block;width:${size}px;height:${size}px"></div></body>`,
  );
  await page.locator("img").evaluate((img) => img.decode());
  await page.screenshot({ path: out, omitBackground: true });
  console.log("wrote", path.relative(root, out));
}

for (const [density, scale] of Object.entries(DENSITIES)) {
  const dir = path.join(res, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  await png(appIcon, 48 * scale, path.join(dir, "ic_launcher.png"));
  await png(readFileSync(path.join(brand, "app-icon-maskable.svg"), "utf8"), 48 * scale, path.join(dir, "ic_launcher_round.png"), true);
  await png(foreground, 108 * scale, path.join(dir, "ic_launcher_foreground.png"));
}
await browser.close();
