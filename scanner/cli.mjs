// Command line entry: argument parsing, scanning, output and exit codes.
import fs from 'node:fs';
import process from 'node:process';

import { describeRule } from './registry.mjs';
import { DEFAULT_SETTLE_MS, launchBrowser, scanPage } from './browser.mjs';
import { scanContent } from './scan-content.mjs';
import { loadStaticModules } from './static-html.mjs';
import { collectFiles } from './walk.mjs';

const BROWSER_AUTHORITATIVE = new Set(['low-contrast', 'broken-image']);
const HTML_FILE = /\.html?$/i;

export const USAGE = 'usage: node scan.mjs <files-or-dirs...> [--json] [--browser] [--url <http(s)://...|file>]\n       [--header "Name: value"]... [--cookie "name=value"]... [--settle-ms <n>]\n';

function buildReport(filePath, found) {
  const rule = describeRule(found.id);
  return {
    file: filePath, line: found.line, rule: found.id, severity: rule.severity,
    message: `${rule.name} - ${found.snippet}`, description: rule.description,
  };
}

export function scanFile(filePath, modules) {
  const content = fs.readFileSync(filePath, 'utf8');
  return scanContent(content, filePath, modules)
    .map((found) => buildReport(filePath, found))
    .sort((one, two) => one.line - two.line || one.rule.localeCompare(two.rule));
}

const FLAGS = { '--json': 'json', '--browser': 'browser' };

function parseHeader(text) {
  const colon = text.indexOf(':');
  const name = text.slice(0, colon).trim();
  return colon > 0 && /^[\w!#$%&'*+.^`|~-]+$/.test(name) ? [name.toLowerCase(), text.slice(colon + 1).trim()] : null;
}

function addAuth(parsed, flag, text) {
  if (flag === '--cookie') {
    if (/^[^=;\s]+=/.test(text)) parsed.cookies.push(text.trim());
    else parsed.invalid.push(flag);
    return;
  }
  const header = parseHeader(text);
  if (header) parsed.headers.push(header);
  else parsed.invalid.push(flag);
}

function addSettle(parsed, text) {
  if (/^\d+$/.test(text)) parsed.settleMs = Number(text);
  else parsed.invalid.push('--settle-ms');
}

function parseArguments(args) {
  const parsed = { json: false, browser: false, urls: [], unknown: [], targets: [], headers: [], cookies: [], invalid: [], settleMs: DEFAULT_SETTLE_MS };
  for (let idx = 0; idx < args.length; idx++) {
    const arg = args[idx];
    if (FLAGS[arg]) parsed[FLAGS[arg]] = true;
    else if (arg === '--url') parsed.urls.push(args[++idx] ?? '');
    else if (arg === '--header' || arg === '--cookie') addAuth(parsed, arg, args[++idx] ?? '');
    else if (arg === '--settle-ms') addSettle(parsed, args[++idx] ?? '');
    else (arg.startsWith('-') ? parsed.unknown : parsed.targets).push(arg);
  }
  return parsed;
}

// Header names are lowercased; all cookie flags (and any --header Cookie) merge into one Cookie header.
function buildHeaders(parsed) {
  const headers = {};
  const cookies = [];
  for (const [name, value] of parsed.headers) {
    if (name === 'cookie') cookies.push(value);
    else headers[name] = value;
  }
  cookies.push(...parsed.cookies);
  if (cookies.length) headers.cookie = cookies.join('; ');
  return headers;
}

function printReports(reports, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
    return;
  }
  for (const report of reports) {
    process.stdout.write(`${report.file}:${report.line} ${report.rule} ${report.severity} ${report.message}\n`);
  }
}

function redact(message, secrets) {
  return secrets.reduce((text, secret) => (secret ? text.split(secret).join('[redacted]') : text), message);
}

async function browserReports(browser, target, options) {
  try {
    return (await scanPage(browser, target, options)).map((found) => buildReport(target, found));
  } catch (error) {
    const secrets = Object.values(options.headers).flatMap((value) => [value, ...value.split('; ')]);
    process.stderr.write(`scan.mjs: browser scan of ${target} failed: ${redact(String(error.message).split('\n')[0], secrets)}\n`);
    return null;
  }
}

async function runBrowserTier(files, urls, wantFiles, options) {
  const launched = await launchBrowser(Object.keys(options.headers).length > 0);
  if (!launched.browser) {
    process.stderr.write(`scan.mjs: browser rules skipped (${launched.error}).\n`);
    return null;
  }
  const byTarget = new Map();
  try {
    const targets = [...urls, ...(wantFiles ? files.filter((file) => HTML_FILE.test(file)) : [])];
    for (const target of targets) byTarget.set(target, await browserReports(launched.browser, target, options));
  } finally {
    await launched.browser.close();
  }
  return byTarget;
}

function mergeReports(files, staticReports, browserByTarget) {
  const reports = [];
  for (const [index, filePath] of files.entries()) {
    const browserFound = browserByTarget?.get(filePath);
    const kept = browserFound ? staticReports[index].filter((report) => !BROWSER_AUTHORITATIVE.has(report.rule)) : staticReports[index];
    reports.push(...kept, ...(browserFound || []));
  }
  for (const [target, found] of browserByTarget || []) if (!files.includes(target)) reports.push(...(found || []));
  return reports;
}

// A failed page scan is stored as null. Exit 2 only when every browser target failed.
function everyScanFailed(browserByTarget) {
  const results = [...(browserByTarget?.values() || [])];
  return results.length > 0 && results.every((found) => found === null);
}

export async function main(args) {
  const parsed = parseArguments(args);
  const { json, browser, urls, unknown, targets, invalid } = parsed;
  if (invalid.length) {
    process.stderr.write(`invalid value for ${invalid[0]}\n${USAGE}`);
    return 2;
  }
  if (unknown.length || urls.includes('') || (targets.length === 0 && urls.length === 0)) {
    process.stderr.write(`${unknown.length ? `unknown option: ${unknown[0]}\n` : ''}${USAGE}`);
    return 2;
  }
  const { files, missing } = collectFiles(targets);
  if (missing.length) {
    process.stderr.write(`not found: ${missing.join(', ')}\n`);
    return 2;
  }
  const modules = await loadStaticModules();
  if (!modules && files.length) process.stderr.write('scan.mjs: run npm install for full rules (HTML style analysis skipped).\n');
  const staticReports = files.map((filePath) => scanFile(filePath, modules));
  const needBrowser = urls.length > 0 || (browser && files.some((file) => HTML_FILE.test(file)));
  const browserByTarget = needBrowser ? await runBrowserTier(files, urls, browser, { headers: buildHeaders(parsed), settleMs: parsed.settleMs }) : null;
  const reports = mergeReports(files, staticReports, browserByTarget);
  printReports(reports, json);
  if (everyScanFailed(browserByTarget)) return 2;
  return reports.length ? 1 : 0;
}
