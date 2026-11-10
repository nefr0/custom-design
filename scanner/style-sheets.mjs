// Stylesheet collection for the static HTML engine: <style> blocks and local linked sheets
// are parsed with css-tree into flat rules (selector, declarations, order).
import fs from 'node:fs';
import path from 'node:path';

const SUPPORTED_PSEUDOS = new Set([
  'root', 'first-child', 'last-child', 'only-child', 'nth-child', 'nth-last-child', 'nth-of-type',
  'first-of-type', 'last-of-type', 'only-of-type', 'not', 'is', 'where', 'empty',
]);
const SHORTHANDS_WITH_SIDES = ['top', 'right', 'bottom', 'left'];

function selectorIsStatic(selector) {
  if (selector.includes('::') || /:(?:before|after|first-line|first-letter)\b/i.test(selector)) return false;
  return [...selector.matchAll(/:([a-z-]+)/gi)].every((match) => SUPPORTED_PSEUDOS.has(match[1].toLowerCase()));
}

export function specificityOf(selector) {
  const stripped = selector.replace(/:where\([^)]*\)/gi, '');
  const ids = (stripped.match(/#[\w-]+/g) || []).length;
  const classes = (stripped.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length;
  const types = (stripped.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:+[\w-]+(?:\([^)]*\))?/g, ' ').match(/(?:^|[\s>+~(,])[a-zA-Z][\w-]*/g) || []).length;
  return ids * 10000 + classes * 100 + types;
}

function isAcceptedAtRule(node, csstree) {
  const name = node.name.toLowerCase();
  if (name === 'layer' || name === 'supports') return Boolean(node.block);
  if (name !== 'media') return false;
  const prelude = node.prelude ? csstree.generate(node.prelude).trim().toLowerCase() : '';
  return prelude === '' || prelude === 'all' || prelude === 'screen';
}

function declarationsOf(block, csstree) {
  const decls = [];
  block.children.forEach((child) => {
    if (child.type !== 'Declaration') return;
    const value = typeof child.value?.value === 'string' ? child.value.value : csstree.generate(child.value);
    decls.push({ prop: child.property.toLowerCase(), value: value.trim(), important: Boolean(child.important) });
  });
  return decls;
}

function collectRules(nodes, csstree, rules) {
  nodes.forEach((node) => {
    if (node.type === 'Atrule' && isAcceptedAtRule(node, csstree)) {
      collectRules(node.block.children, csstree, rules);
    } else if (node.type === 'Rule' && node.prelude.type === 'SelectorList') {
      const decls = declarationsOf(node.block, csstree);
      node.prelude.children.forEach((selectorNode) => {
        const selector = csstree.generate(selectorNode).trim();
        if (selectorIsStatic(selector)) rules.push({ selector, decls, specificity: specificityOf(selector), order: rules.length });
      });
    }
  });
}

export function parseStylesheet(cssText, csstree, startOrder = 0) {
  const rules = [];
  try {
    const ast = csstree.parse(cssText, { parseValue: false, positions: false });
    collectRules(ast.children, csstree, rules);
  } catch {
    return [];
  }
  return rules.map((rule, idx) => ({ ...rule, order: startOrder + idx }));
}

function readLocalSheet(href, fileDir) {
  if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return '';
  const target = path.resolve(fileDir, href.split(/[?#]/)[0]);
  if (path.extname(target).toLowerCase() !== '.css') return '';
  try {
    return fs.readFileSync(target, 'utf8');
  } catch {
    return '';
  }
}

export function collectSheetTexts(root, fileDir, modules) {
  const { domutils, selectAll } = modules;
  const texts = [];
  for (const node of selectAll('style, link[rel~="stylesheet"]', root)) {
    if (node.name === 'style') texts.push(domutils.textContent(node));
    else texts.push(readLocalSheet(node.attribs.href, fileDir));
  }
  return texts.filter(Boolean);
}

export function collectRulesFromTexts(texts, csstree) {
  const rules = [];
  for (const text of texts) rules.push(...parseStylesheet(text, csstree, rules.length));
  return rules;
}

export function parseInlineStyle(styleAttr) {
  const decls = [];
  for (const part of String(styleAttr || '').split(';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const important = /!\s*important\s*$/i.test(part);
    const value = part.slice(colon + 1).replace(/!\s*important\s*$/i, '').trim();
    decls.push({ prop: part.slice(0, colon).trim().toLowerCase(), value, important });
  }
  return decls;
}

export { SHORTHANDS_WITH_SIDES };
