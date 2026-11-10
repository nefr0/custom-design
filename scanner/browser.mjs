// Optional browser tier: drives Playwright (never installed by this skill) to run the page-side rules.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { pixelContrastFindings } from './browser-contrast.mjs';

const PAGE_SCRIPT = fs.readFileSync(new URL('./browser-page.js', import.meta.url), 'utf8');
const VIEWPORT = { width: 1280, height: 800 };
const NAVIGATION_TIMEOUT_MS = 30000;
const IDLE_TIMEOUT_MS = 10000;
export const DEFAULT_SETTLE_MS = 1000;

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

// Pages served through route.fulfill() (needed to send a Cookie header to one origin only) count as public-network
// documents, so Chromium's Local Network Access check would block their loopback subresources. It is relaxed only
// for runs that send credentials.
const AUTH_LAUNCH_ARGS = ['--disable-features=LocalNetworkAccessChecks'];

export async function launchBrowser(withAuth = false) {
  const playwright = await importPlaywright();
  if (!playwright) return { error: 'playwright is not importable' };
  const chromium = playwright.chromium || playwright.default?.chromium;
  try {
    return { browser: await chromium.launch({ headless: true, args: withAuth ? AUTH_LAUNCH_ARGS : [] }) };
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

// Pages render data after `load`: wait for the network to go quiet (best effort), then let the page settle.
async function waitUntilSettled(page, settleMs) {
  await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT_MS }).catch(() => {});
  if (settleMs > 0) await page.waitForTimeout(settleMs);
}

// Extra headers (cookies, tokens) are added only to requests for the target's own origin, never to other origins.
// Chromium ignores a Cookie override in route.continue(), so same-origin requests go through route.fetch() and are
// fulfilled with the response; redirects are not followed there, the browser follows them and they are routed again.
async function routeExtraHeaders(context, target, extra) {
  if (!extra || Object.keys(extra).length === 0 || !/^https?:\/\//i.test(target)) return;
  const targetOrigin = new URL(target).origin;
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== targetOrigin) {
      await route.continue();
      return;
    }
    try {
      await route.fulfill({ response: await route.fetch({ headers: { ...request.headers(), ...extra }, maxRedirects: 0 }) });
    } catch {
      await route.abort('failed').catch(() => {});
    }
  });
}

// bypassCSP lets the injected scan script run on pages whose policy forbids inline scripts.
// Header values are only handed to the browser, never printed.
export async function scanPage(browser, target, options = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, bypassCSP: true });
  try {
    await routeExtraHeaders(context, target, options.headers);
    const page = await context.newPage();
    const scriptErrors = [];
    page.on('pageerror', (error) => scriptErrors.push(String(error.message).split('\n')[0]));
    await page.goto(toNavigationUrl(target), { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
    await waitUntilSettled(page, options.settleMs ?? DEFAULT_SETTLE_MS);
    await page.addScriptTag({ content: PAGE_SCRIPT });
    const found = await page.evaluate(() => window.__designScan.run());
    found.push(...await pixelContrastFindings(page));
    const errors = scriptErrors.slice(0, 3).map((message) => ({ id: 'script-error', detail: `Uncaught page error: ${message}` }));
    return [...found, ...errors].map(toFinding);
  } finally {
    await context.close();
  }
}
