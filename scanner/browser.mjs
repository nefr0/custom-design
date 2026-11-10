// Optional browser tier: drives Playwright (never installed by this skill) to run the page-side rules.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { pixelContrastFindings } from './browser-contrast.mjs';

const PAGE_SCRIPT = fs.readFileSync(new URL('./browser-page.js', import.meta.url), 'utf8');
const VIEWPORT = { width: 1280, height: 800 };
const NAVIGATION_TIMEOUT_MS = 30000;

async function importPlaywright() {
  try {
    return await import('playwright');
  } catch {
    try {
      return await import('playwright-core');
    } catch {
      return null;
    }
  }
}

export async function launchBrowser() {
  const playwright = await importPlaywright();
  if (!playwright) return { error: 'playwright is not importable' };
  const chromium = playwright.chromium || playwright.default?.chromium;
  try {
    return { browser: await chromium.launch({ headless: true }) };
  } catch (error) {
    return { error: `chromium failed to launch: ${String(error.message).split('\n')[0]}` };
  }
}

export function toNavigationUrl(target) {
  if (/^https?:\/\//i.test(target)) return target;
  return pathToFileURL(path.resolve(target)).href;
}

function toFinding(found) {
  return { id: found.id, snippet: found.detail, line: 1 };
}

export async function scanPage(browser, target) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const scriptErrors = [];
  page.on('pageerror', (error) => scriptErrors.push(String(error.message).split('\n')[0]));
  try {
    await page.goto(toNavigationUrl(target), { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
    await page.addScriptTag({ content: PAGE_SCRIPT });
    const found = await page.evaluate(() => window.__designScan.run());
    found.push(...await pixelContrastFindings(page));
    const errors = scriptErrors.slice(0, 3).map((message) => ({ id: 'script-error', detail: `Uncaught page error: ${message}` }));
    return [...found, ...errors].map(toFinding);
  } finally {
    await page.close();
  }
}
