// Tests for scan.mjs. Only node:test and node:assert are used for assertions; node:child_process
// is used here (and nowhere in the scanner) to run the CLI as a user would.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

function runScan(args) {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scan.mjs'), ...args], { encoding: 'utf8' });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

function rulesIn(output) {
  return new Set(output.split('\n').filter(Boolean).map((line) => line.split(' ')[1]));
}

async function canImport(name) {
  try {
    await import(name);
    return true;
  } catch {
    return false;
  }
}

test('bad.css reports stylesheet tells and exits 1', () => {
  const { status, out } = runScan([path.join(FIXTURES, 'bad.css')]);
  assert.equal(status, 1);
  const rules = rulesIn(out);
  for (const rule of ['side-tab', 'dark-glow', 'gradient-text', 'ai-color-palette', 'marquee', 'bounce-easing', 'layout-transition', 'codex-grid-background']) {
    assert.ok(rules.has(rule), `expected ${rule} in ${[...rules].join(', ')}`);
  }
});

test('bad.jsx reports tailwind class tells', () => {
  const { status, out } = runScan([path.join(FIXTURES, 'bad.jsx')]);
  assert.equal(status, 1);
  const rules = rulesIn(out);
  for (const rule of ['side-tab', 'gradient-text', 'ai-color-palette', 'bounce-easing']) assert.ok(rules.has(rule), `missing ${rule}`);
});

test('bad.html reports page tells (regex tier, plus static tier when dependencies are installed)', async () => {
  const { status, out } = runScan([path.join(FIXTURES, 'bad.html')]);
  assert.equal(status, 1);
  const rules = rulesIn(out);
  for (const rule of ['dark-glow', 'pulsing-dot', 'gradient-text', 'bounce-easing']) assert.ok(rules.has(rule), `missing ${rule}`);
  if (await canImport('htmlparser2') && await canImport('css-select') && await canImport('css-tree') && await canImport('domutils')) {
    for (const rule of ['cream-palette', 'skipped-heading', 'nested-cards', 'side-tab', 'low-contrast', 'gray-on-color', 'broken-image']) {
      assert.ok(rules.has(rule), `missing static rule ${rule} in ${[...rules].join(', ')}`);
    }
  }
});

test('clean fixtures produce no findings and exit 0', () => {
  for (const name of ['clean.html', 'clean.css']) {
    const { status, out } = runScan([path.join(FIXTURES, name)]);
    assert.equal(out.trim(), '', `${name} should be clean`);
    assert.equal(status, 0);
  }
});

test('output lines follow path:line rule severity message', () => {
  const { out } = runScan([path.join(FIXTURES, 'bad.css')]);
  for (const line of out.split('\n').filter(Boolean)) {
    assert.match(line, /^.+:\d+ [a-z-]+ (?:warning|advisory|error) .+/);
  }
});

test('--json prints an array of findings', () => {
  const { status, out } = runScan([path.join(FIXTURES, 'bad.css'), '--json']);
  assert.equal(status, 1);
  const reports = JSON.parse(out);
  assert.ok(Array.isArray(reports) && reports.length > 0);
  for (const key of ['file', 'line', 'rule', 'severity', 'message']) assert.ok(key in reports[0], `missing key ${key}`);
});

test('a directory is walked and node_modules is skipped', () => {
  const { out } = runScan([FIXTURES]);
  assert.ok(out.includes('bad.css:') && out.includes('bad.jsx:'));
  assert.ok(!out.includes('node_modules'));
});

test('usage errors exit 2', () => {
  assert.equal(runScan([]).status, 2);
  assert.equal(runScan(['--bogus']).status, 2);
  assert.equal(runScan([path.join(FIXTURES, 'does-not-exist.css')]).status, 2);
});

test('scanner sources use only allowed imports and no network, process spawning or eval', () => {
  const files = [path.join(ROOT, 'scan.mjs'), ...fs.readdirSync(path.join(ROOT, 'scanner')).map((name) => path.join(ROOT, 'scanner', name))];
  const allowedBare = new Set(['htmlparser2', 'css-select', 'css-tree', 'domutils', 'playwright', 'playwright-core']);
  const forbidden = /child_process|node:(?:net|http|https|tls|dgram|worker_threads)|\bfetch\(|\beval\(|new Function\(|require\(/;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!forbidden.test(text), `${path.basename(file)} uses a forbidden API`);
    for (const match of text.matchAll(/(?:from\s+|import\(\s*)'([^'.][^']*)'/g)) {
      const specifier = match[1];
      assert.ok(specifier.startsWith('node:') || allowedBare.has(specifier), `${path.basename(file)} imports ${specifier}`);
    }
  }
});

test('browser tier runs when playwright and chromium are available, otherwise skips', async (context) => {
  const available = await canImport('playwright') || await canImport('playwright-core');
  if (!available) {
    context.skip('playwright is not importable');
    return;
  }
  const { out, err } = runScan([path.join(FIXTURES, 'bad.html'), '--browser']);
  if (err.includes('browser rules skipped')) {
    context.skip('chromium could not launch');
    return;
  }
  const rules = rulesIn(out);
  assert.ok(rules.has('low-contrast') && rules.has('broken-image'), `browser rules missing: ${[...rules].join(', ')}`);
});

test('browser tier measures pixel contrast of text over a gradient', async (context) => {
  const available = await canImport('playwright') || await canImport('playwright-core');
  if (!available) {
    context.skip('playwright is not importable');
    return;
  }
  const { out, err } = runScan([path.join(FIXTURES, 'image-contrast.html'), '--browser']);
  if (err.includes('browser rules skipped')) {
    context.skip('chromium could not launch');
    return;
  }
  const lines = out.split('\n').filter((line) => line.includes(' low-contrast '));
  assert.equal(lines.length, 1, `expected one low-contrast finding, got: ${out}`);
  assert.match(lines[0], /pixel contrast \d+\.\d:1 .*gradient background "Faint text/);
});

async function browserReady(context) {
  if (!await canImport('playwright') && !await canImport('playwright-core')) {
    context.skip('playwright is not importable');
    return false;
  }
  const { err } = runScan([path.join(FIXTURES, 'clean.html'), '--browser']);
  if (err.includes('browser rules skipped')) {
    context.skip('chromium could not launch');
    return false;
  }
  return true;
}

test('browser tier does not flag readable bold text in a blurred sticky header', async (context) => {
  if (!await browserReady(context)) return;
  const { out, err } = runScan([path.join(FIXTURES, 'backdrop-header.html'), '--browser']);
  assert.ok(!out.includes(' low-contrast '), `readable header flagged: ${out}${err}`);
});

test('browser tier scans a page whose CSP forbids inline scripts', async (context) => {
  if (!await browserReady(context)) return;
  const { err } = runScan([path.join(FIXTURES, 'csp-strict.html'), '--browser']);
  assert.ok(!err.includes('failed'), `scan crashed: ${err}`);
});

test('malformed --header, --cookie and --settle-ms values exit 2 without echoing the value', () => {
  for (const args of [['--header', 'no-colon-SECRET'], ['--cookie', 'novalue'], ['--settle-ms', 'soon']]) {
    const { status, err } = runScan(['--url', 'http://127.0.0.1:9/', ...args]);
    assert.equal(status, 2);
    assert.ok(!err.includes('SECRET') && !err.includes('novalue') && !err.includes('soon'), err);
  }
});

function runScanAsync(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scan.mjs'), ...args]);
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (status) => resolve({ status, out, err }));
  });
}

test('--cookie and --header reach the page as request headers and are never printed', async (context) => {
  if (!await browserReady(context)) return;
  const faint = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body style="background:#fff"><p style="color:#eeeeee;font-size:18px">Logged in only</p></body></html>';
  const server = http.createServer((req, res) => {
    const authed = req.headers.cookie === 'sid=SECRETCOOKIE; theme=dark' && req.headers['x-test'] === 'SECRETHEADER';
    res.setHeader('content-type', 'text/html');
    res.end(authed ? faint : '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><p>Please sign in</p></body></html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const { out, err } = await runScanAsync(['--url', url, '--cookie', 'sid=SECRETCOOKIE', '--cookie', 'theme=dark', '--header', 'X-Test: SECRETHEADER', '--settle-ms', '0']);
    assert.ok(out.includes(' low-contrast '), `authed page was not scanned: ${out}${err}`);
    assert.ok(!(out + err).includes('SECRET'), 'header values leaked into output');
  } finally {
    server.close();
  }
});
