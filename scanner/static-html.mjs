// Static HTML engine: parses markup with htmlparser2, resolves a minimal cascade with css-tree
// and css-select, then runs element and page rules. Needs the optional npm dependencies.
import path from 'node:path';

import { bordersFor, colorsFor, makeContextTests } from './element-colors.mjs';
import { compileTextSelectors, textRulesFor } from './element-text.mjs';
import { ancestorsAndSelf } from './element-util.mjs';
import {
  creamPalette, flatTypeHierarchy, nestedCards, oversizedH1, skippedHeadings, thinBorderWideShadow,
} from './page-rules.mjs';
import { StyleResolver } from './style-compute.mjs';
import { collectRulesFromTexts, collectSheetTexts } from './style-sheets.mjs';
import { isFullPage } from './text-rules.mjs';

export async function loadStaticModules() {
  try {
    const [htmlparser, cssSelect, csstree, domutils] = await Promise.all([
      import('htmlparser2'), import('css-select'), import('css-tree'), import('domutils'),
    ]);
    return {
      parseDocument: htmlparser.parseDocument,
      selectAll: cssSelect.selectAll,
      selectOne: cssSelect.selectOne,
      compile: cssSelect.compile,
      csstree,
      domutils,
    };
  } catch {
    return null;
  }
}

function makeLineLookup(text) {
  const starts = [0];
  for (let idx = 0; idx < text.length; idx++) if (text[idx] === '\n') starts.push(idx + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

function isIgnored(elem, ruleId) {
  return ancestorsAndSelf(elem).some((cur) => {
    const attr = cur.attribs?.['data-impeccable-ignore'];
    if (attr === undefined) return false;
    const rules = attr.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    return rules.length === 0 || rules.includes('*') || rules.includes(ruleId);
  });
}

function elementFindings(elem, context) {
  const { resolver, modules, tests, selectors } = context;
  const style = resolver.computed(elem);
  const found = [
    ...bordersFor(elem, style, tests.tabTest, tests.statusTest),
    ...colorsFor(elem, resolver),
    ...textRulesFor(elem, resolver, modules, selectors),
    ...thinBorderWideShadow(style),
  ];
  if (elem.name === 'h1') found.push(...oversizedH1(elem, resolver, modules));
  if (elem.name === 'img') found.push(...brokenImage(elem));
  return found;
}

function brokenImage(elem) {
  const src = elem.attribs?.src;
  if (src === undefined) return [{ id: 'broken-image', snippet: '<img> with no src attribute' }];
  return ['', '#'].includes(src.trim()) ? [{ id: 'broken-image', snippet: `<img src="${src}">` }] : [];
}

export function scanStaticHtml(html, filePath, modules) {
  const document = modules.parseDocument(html, { withStartIndices: true, lowerCaseTags: true, lowerCaseAttributeNames: false });
  const rules = collectRulesFromTexts(collectSheetTexts(document, path.dirname(path.resolve(filePath)), modules), modules.csstree);
  const resolver = new StyleResolver(rules, modules);
  const context = { resolver, modules, tests: makeContextTests(modules), selectors: compileTextSelectors(modules) };
  const lineOf = makeLineLookup(html);
  const findings = [];
  const push = (found, elem) => {
    if (elem && isIgnored(elem, found.id)) return;
    findings.push({ id: found.id, snippet: found.snippet, line: elem ? lineOf(elem.startIndex ?? 0) : 1 });
  };
  for (const elem of modules.selectAll('*', document)) {
    for (const found of elementFindings(elem, context)) push(found, elem);
  }
  if (isFullPage(html)) {
    const headings = modules.selectAll('h1, h2, h3, h4, h5, h6', document);
    const pageFindings = [
      ...skippedHeadings(headings, modules), ...nestedCards(document, resolver, modules), ...creamPalette(document, resolver, modules),
    ];
    for (const found of pageFindings) push(found, found.elem);
    for (const found of flatTypeHierarchy(document, resolver, modules)) push(found, null);
  }
  return findings;
}
