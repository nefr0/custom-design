// Minimal cascade for static HTML: matches stylesheet rules and inline styles, expands
// shorthands, resolves var() and inherits the properties that inherit.
import { resolveVarRefs } from './css-util.mjs';
import { parseInlineStyle } from './style-sheets.mjs';
import { expandDeclaration, fontSizeToPx } from './style-values.mjs';

const INHERITED = new Set([
  'color', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'text-align',
  'visibility', 'hyphens', '-webkit-hyphens',
]);
const HEADING_SIZES = { h1: '2em', h2: '1.5em', h3: '1.17em', h4: '1em', h5: '0.83em', h6: '0.67em' };
const HIDDEN_TAGS = new Set(['head', 'script', 'style', 'template', 'title', 'meta', 'link', 'noscript']);
const INLINE_SPECIFICITY = 1000000;

function userAgentDeclarations(tag) {
  const decls = [];
  if (HEADING_SIZES[tag]) decls.push(['font-size', HEADING_SIZES[tag]], ['font-weight', 'bold']);
  if (['b', 'strong', 'th'].includes(tag)) decls.push(['font-weight', 'bold']);
  if (tag === 'small') decls.push(['font-size', 'smaller']);
  if (HIDDEN_TAGS.has(tag)) decls.push(['display', 'none']);
  return decls.map(([prop, value]) => ({ prop, value, important: false, specificity: -1, order: -1 }));
}

function sortKey(entry) {
  return [entry.important ? 1 : 0, entry.specificity, entry.order];
}

function compareEntries(one, two) {
  const keyOne = sortKey(one);
  const keyTwo = sortKey(two);
  for (let idx = 0; idx < keyOne.length; idx++) {
    if (keyOne[idx] !== keyTwo[idx]) return keyOne[idx] - keyTwo[idx];
  }
  return 0;
}

// Index key of a selector's rightmost compound, so only plausible rules are tested per element.
function rightmostKey(selector) {
  const compound = selector.replace(/\[[^\]]*\]|:[a-z-]+\([^)]*\)/gi, '').split(/[\s>+~]+/).filter(Boolean).pop() || '';
  const idMatch = compound.match(/#([\w-]+)/);
  if (idMatch) return `#${idMatch[1]}`;
  const className = compound.match(/\.([\w-]+)/);
  if (className) return `.${className[1]}`;
  const tag = compound.match(/^[a-zA-Z][\w-]*/);
  return tag ? tag[0].toLowerCase() : '*';
}

function addToIndex(index, key, entry) {
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(entry);
}

export class StyleResolver {
  constructor(rules, modules) {
    this.cache = new Map();
    this.index = new Map();
    for (const rule of rules) {
      try {
        addToIndex(this.index, rightmostKey(rule.selector), { rule, test: modules.compile(rule.selector) });
      } catch {
        // selector the engine cannot compile: ignore the rule
      }
    }
  }

  candidateRules(elem) {
    const keys = ['*', elem.name];
    if (elem.attribs?.id) keys.push(`#${elem.attribs.id}`);
    for (const className of String(elem.attribs?.class || '').split(/\s+/).filter(Boolean)) keys.push(`.${className}`);
    return keys.flatMap((key) => this.index.get(key) || []);
  }

  matchedEntries(elem) {
    const entries = userAgentDeclarations(elem.name);
    for (const { rule, test } of this.candidateRules(elem)) {
      if (!test(elem)) continue;
      for (const decl of rule.decls) entries.push({ ...decl, specificity: rule.specificity, order: rule.order });
    }
    const inline = parseInlineStyle(elem.attribs?.style);
    inline.forEach((decl, idx) => entries.push({ ...decl, specificity: INLINE_SPECIFICITY, order: idx }));
    return entries.sort(compareEntries);
  }

  declaredValues(elem) {
    const declared = new Map();
    for (const entry of this.matchedEntries(elem)) {
      for (const [prop, value] of expandDeclaration(entry.prop, entry.value)) declared.set(prop, value);
    }
    return declared;
  }

  computed(elem) {
    if (this.cache.has(elem)) return this.cache.get(elem);
    const parent = elem.parent && elem.parent.type === 'tag' ? this.computed(elem.parent) : null;
    const style = this.buildStyle(elem, parent);
    this.cache.set(elem, style);
    return style;
  }

  buildStyle(elem, parent) {
    const declared = this.declaredValues(elem);
    const customProps = new Map(parent ? parent.customProps : []);
    for (const [prop, value] of declared) if (prop.startsWith('--')) customProps.set(prop, value);
    const values = new Map();
    for (const prop of INHERITED) if (parent?.values.has(prop)) values.set(prop, parent.values.get(prop));
    for (const [prop, raw] of declared) {
      if (prop.startsWith('--')) continue;
      const resolved = resolveVarRefs(raw, customProps);
      values.set(prop, /^inherit$/i.test(resolved) && parent ? (parent.values.get(prop) ?? '') : resolved);
    }
    const parentFont = parent ? parent.fontPx : 16;
    const ownSize = declared.has('font-size') ? fontSizeToPx(values.get('font-size'), parentFont) : parentFont;
    const fontPx = ownSize ?? parentFont;
    return { values, customProps, fontPx, fontKnown: declared.has('font-size') ? ownSize !== null : (parent?.fontKnown ?? true), get: (prop) => values.get(prop) };
  }
}
