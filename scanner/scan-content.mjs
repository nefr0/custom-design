// Runs every applicable rule family over one file's text and returns findings with line numbers.
import path from 'node:path';

import { scanGridBackground } from './css-glow.mjs';
import { scanShapeIllustration } from './css-imagery.mjs';
import { lineAt } from './css-util.mjs';
import { runLineRules } from './line-rules.mjs';
import { scanStylePatterns } from './page-patterns.mjs';
import { scanStaticHtml } from './static-html.mjs';
import {
  COMPONENT_EXTS, HTML_EXTS, JS_EXTS, STYLESHEET_EXTS, buildCorpora, extractCssInJs, extractStyleBlocks, prepareSource,
} from './source.mjs';
import { analyzePage, isFullPage } from './text-rules.mjs';

// Rules the static HTML engine evaluates on resolved styles; the line rules skip them there.
const STATIC_OWNED = new Set(['side-tab', 'border-accent-on-rounded', 'gray-on-color', 'ai-color-palette', 'gradient-text', 'broken-image']);

export const SCANNABLE_EXTS = new Set([...JS_EXTS, ...STYLESHEET_EXTS, ...HTML_EXTS, ...COMPONENT_EXTS].filter((ext) => ext !== '.mjs' && ext !== '.cjs'));

function withLines(hits, text, lineOffset = 0) {
  return hits.map((hit) => ({ id: hit.id, snippet: hit.snippet, line: hit.line ?? lineOffset + lineAt(text, hit.index ?? 0) }));
}

function stylePatternFindings(source, ext) {
  const { styleText, classText } = buildCorpora(source, ext);
  return withLines(scanStylePatterns(styleText, classText, STYLESHEET_EXTS.has(ext) ? styleText : source), source);
}

function scriptFindings(source, ext) {
  const findings = withLines([...scanGridBackground(source), ...scanShapeIllustration(source)], source);
  for (const block of extractCssInJs(source, ext)) {
    const hits = scanStylePatterns(block.text, block.text, '');
    findings.push(...withLines(hits, block.text, block.line - 1));
  }
  return findings;
}

function blockLineFindings(source, ext) {
  const blocks = COMPONENT_EXTS.has(ext) ? extractStyleBlocks(source) : extractCssInJs(source, ext);
  return blocks.flatMap((block) => runLineRules(block.text.split('\n'), { lineOffset: block.line - 1, blockContext: true }));
}

function dedupe(findings) {
  const kept = [];
  for (const found of findings) {
    const duplicate = kept.some((other) => other.id === found.id && other.snippet === found.snippet && Math.abs(other.line - found.line) <= 2);
    if (!duplicate) kept.push(found);
  }
  return kept;
}

// A resolved-style finding that repeats a text-level one (same rule and message) is dropped.
function withoutRepeats(staticFound, earlier) {
  return staticFound.filter((found) => !earlier.some((other) => other.id === found.id && other.snippet === found.snippet));
}

export function scanContent(content, filePath, modules) {
  const ext = path.extname(filePath).toLowerCase();
  const source = prepareSource(content, ext);
  const useStatic = Boolean(modules) && HTML_EXTS.has(ext);
  const findings = runLineRules(source.split('\n'), { blockContext: STYLESHEET_EXTS.has(ext), skipIds: useStatic ? STATIC_OWNED : new Set() });
  if (JS_EXTS.has(ext)) findings.push(...scriptFindings(source, ext));
  else findings.push(...stylePatternFindings(source, ext));
  if (!STYLESHEET_EXTS.has(ext) && !HTML_EXTS.has(ext)) findings.push(...blockLineFindings(source, ext));
  if (useStatic) findings.push(...withoutRepeats(scanStaticHtml(content, filePath, modules), findings));
  const pageExts = new Set([...HTML_EXTS, ...COMPONENT_EXTS]);
  if (pageExts.has(ext) && isFullPage(content)) findings.push(...analyzePage(content).map((found) => ({ ...found, line: 1 })));
  return dedupe(findings);
}
