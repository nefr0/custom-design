// Command line entry: argument parsing, scanning, output and exit codes.
import fs from 'node:fs';
import process from 'node:process';

import { describeRule } from './registry.mjs';
import { launchBrowser, scanPage } from './browser.mjs';
import { scanContent } from './scan-content.mjs';
import { loadStaticModules } from './static-html.mjs';
import { collectFiles } from './walk.mjs';

const BROWSER_AUTHORITATIVE = new Set(['low-contrast', 'broken-image']);
const HTML_FILE = /\.html?$/i;

export const USAGE = 'usage: node scan.mjs <files-or-dirs...> [--json] [--browser] [--url <http(s)://...|file>]\n';

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

function parseArguments(args) {
  const parsed = { json: false, browser: false, urls: [], unknown: [], targets: [] };
  for (let idx = 0; idx < args.length; idx++) {
    const arg = args[idx];
    if (FLAGS[arg]) parsed[FLAGS[arg]] = true;
    else if (arg === '--url') parsed.urls.push(args[++idx] ?? '');
    else (arg.startsWith('-') ? parsed.unknown : parsed.targets).push(arg);
  }
  return parsed;
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

async function browserReports(browser, target) {
  try {
    return (await scanPage(browser, target)).map((found) => buildReport(target, found));
  } catch (error) {
    process.stderr.write(`scan.mjs: browser scan of ${target} failed: ${String(error.message).split('\n')[0]}\n`);
    return [];
  }
}

async function runBrowserTier(files, urls, wantFiles) {
  const launched = await launchBrowser();
  if (!launched.browser) {
    process.stderr.write(`scan.mjs: browser rules skipped (${launched.error}).\n`);
    return null;
  }
  const byTarget = new Map();
  try {
    const targets = [...urls, ...(wantFiles ? files.filter((file) => HTML_FILE.test(file)) : [])];
    for (const target of targets) byTarget.set(target, await browserReports(launched.browser, target));
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
  for (const [target, found] of browserByTarget || []) if (!files.includes(target)) reports.push(...found);
  return reports;
}

export async function main(args) {
  const { json, browser, urls, unknown, targets } = parseArguments(args);
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
  const browserByTarget = needBrowser ? await runBrowserTier(files, urls, browser) : null;
  const reports = mergeReports(files, staticReports, browserByTarget);
  printReports(reports, json);
  return reports.length ? 1 : 0;
}
