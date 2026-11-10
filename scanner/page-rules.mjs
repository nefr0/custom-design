// Page-level and card-shape rules evaluated on the resolved static document.
// Ported from Impeccable's detector (Apache-2.0).
import { parseAnyColor } from './color.mjs';
import { SAFE_TAGS, classNames, isHidden, parentElement, textOf } from './element-util.mjs';
import { lengthToPx } from './style-values.mjs';

const HEADING_LEVEL = /^h([1-6])$/;
const TYPE_ROLE_TAGS = 'h1, h2, h3, h4, h5, h6, p, li, td, th, dd, blockquote, figcaption';
const MIN_ROLES = 3;
const MIN_STEP_RATIO = 1.25;
const NON_CARD_TAGS = new Set(['input', 'select', 'textarea', 'img', 'video', 'canvas', 'picture']);
const CREAM_TAILWIND = {
  'bg-amber-50': '#fffbeb', 'bg-amber-100': '#fef3c7', 'bg-orange-50': '#fff7ed', 'bg-orange-100': '#ffedd5',
  'bg-yellow-50': '#fefce8', 'bg-stone-50': '#fafaf9', 'bg-stone-100': '#f5f5f4', 'bg-stone-200': '#e7e5e4',
};

// ---- skipped headings ----

export function skippedHeadings(headings, modules) {
  const findings = [];
  let previous = null;
  for (const heading of headings) {
    const level = Number(heading.name.match(HEADING_LEVEL)[1]);
    const text = textOf(heading, modules.domutils).slice(0, 60);
    if (previous && level > previous.level + 1) {
      findings.push({
        id: 'skipped-heading', elem: heading,
        snippet: `<h${previous.level}> "${previous.text}" followed by <h${level}> "${text}" (missing h${previous.level + 1})`,
      });
    }
    previous = { level, text };
  }
  return findings;
}

// ---- flat type hierarchy ----

function dominantSize(sizes) {
  const counts = new Map();
  for (const size of sizes) counts.set(size, (counts.get(size) || 0) + 1);
  const ranked = [...counts.entries()].sort((one, two) => two[1] - one[1] || one[0] - two[0]);
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0]?.[0] ?? null;
}

export function flatTypeHierarchy(document, resolver, modules) {
  const byRole = new Map();
  for (const elem of modules.selectAll(TYPE_ROLE_TAGS, document)) {
    const style = resolver.computed(elem);
    const size = Math.round(style.fontPx * 10) / 10;
    if (!style.fontKnown || size < 8 || size >= 200 || !textOf(elem, modules.domutils) || isHidden(elem, resolver)) continue;
    const role = HEADING_LEVEL.test(elem.name) ? elem.name : 'body';
    byRole.set(role, [...(byRole.get(role) || []), size]);
  }
  const roles = [...byRole.entries()].map(([role, sizes]) => ({ role, size: dominantSize(sizes) })).filter((item) => item.size !== null);
  if (roles.length < MIN_ROLES) return [];
  roles.sort((one, two) => one.size - two.size || one.role.localeCompare(two.role));
  let largest = 1;
  for (let idx = 1; idx < roles.length; idx++) largest = Math.max(largest, roles[idx].size / roles[idx - 1].size);
  if (largest >= MIN_STEP_RATIO) return [];
  const sizes = roles.map((item) => `${item.role} ${item.size}px`).join(', ');
  return [{ id: 'flat-type-hierarchy', snippet: `Role sizes: ${sizes} (largest adjacent step ${largest.toFixed(2)}:1; target ${MIN_STEP_RATIO}:1)` }];
}

// ---- nested cards ----

function isCardLike(elem, resolver) {
  if (SAFE_TAGS.has(elem.name) || NON_CARD_TAGS.has(elem.name)) return false;
  const style = resolver.computed(elem);
  const classes = classNames(elem);
  const raw = elem.attribs?.style || '';
  const shadow = style.get('box-shadow');
  const hasShadow = (shadow && shadow !== 'none') || /\bshadow(?:-sm|-md|-lg|-xl|-2xl)?\b/.test(classes) || /box-shadow/i.test(raw);
  const hasBorder = /\bborder\b/.test(classes);
  const radius = String(style.get('border-radius') || '').trim().split(/[\s/]+/)[0];
  const hasRadius = (lengthToPx(radius, style.fontPx) ?? (radius.endsWith('%') ? 1 : 0)) > 0
    || /\brounded(?:-sm|-md|-lg|-xl|-2xl|-full)?\b/.test(classes) || /border-radius/i.test(raw);
  const hasBg = /\bbg-(?:white|gray-\d+|slate-\d+)\b/.test(classes) || /background(?:-color)?\s*:\s*(?!transparent)/i.test(raw);
  return (hasShadow || hasBorder) && (hasRadius || hasBg);
}

function skipsNestedCheck(elem, modules) {
  const classes = classNames(elem);
  const raw = elem.attribs?.style || '';
  return ['pre', 'code'].includes(elem.name) || /\b(?:absolute|fixed)\b/.test(classes) || /position\s*:\s*(?:absolute|fixed)/i.test(raw)
    || textOf(elem, modules.domutils).length < 10 || /\b(?:dropdown|popover|tooltip|menu|modal|dialog)\b/i.test(classes);
}

function hasCardAncestor(elem, resolver) {
  for (let cur = parentElement(elem); cur; cur = parentElement(cur)) if (isCardLike(cur, resolver)) return true;
  return false;
}

function isInside(inner, outer) {
  for (let cur = parentElement(inner); cur; cur = parentElement(cur)) if (cur === outer) return true;
  return false;
}

export function nestedCards(document, resolver, modules) {
  const flagged = new Set();
  for (const elem of modules.selectAll('*', document)) {
    if (isCardLike(elem, resolver) && !skipsNestedCheck(elem, modules) && hasCardAncestor(elem, resolver)) flagged.add(elem);
  }
  const innermost = [...flagged].filter((elem) => ![...flagged].some((other) => other !== elem && isInside(other, elem)));
  return innermost.map((elem) => ({ id: 'nested-cards', elem, snippet: `Card inside card (${elem.name})` }));
}

// ---- cream palette ----

export function isCreamColor(color) {
  if (!color || Math.min(color.r, color.g, color.b) < 209 || !(color.r >= color.g && color.g >= color.b)) return false;
  const warmth = color.r - color.b;
  return warmth >= 6 && warmth <= 48;
}

function creamClassToken(classes) {
  const arbitrary = classes.match(/\bbg-\[([^\]]+)\]/);
  if (arbitrary && isCreamColor(parseAnyColor(arbitrary[1].replace(/_/g, ' ')))) return `bg-[${arbitrary[1]}]`;
  return Object.keys(CREAM_TAILWIND).find((token) => new RegExp(`(^|\\s)${token}($|\\s)`).test(classes) && isCreamColor(parseAnyColor(CREAM_TAILWIND[token]))) || null;
}

export function creamPalette(document, resolver, modules) {
  const body = modules.selectOne('body', document);
  const html = modules.selectOne('html', document);
  if (!body) return [];
  for (const elem of [body, html].filter(Boolean)) {
    const color = parseAnyColor(resolver.computed(elem).get('background-color'));
    if (color && (color.a ?? 1) > 0) {
      return isCreamColor(color) ? [{ id: 'cream-palette', elem: body, snippet: `cream/beige page background rgb(${color.r}, ${color.g}, ${color.b})` }] : [];
    }
  }
  for (const elem of [body, html].filter(Boolean)) {
    const token = creamClassToken(classNames(elem));
    if (token) return [{ id: 'cream-palette', elem: body, snippet: `cream/beige page background (Tailwind ${token})` }];
  }
  return [];
}

// ---- oversized h1 ----

export function oversizedH1(elem, resolver, modules) {
  const style = resolver.computed(elem);
  const text = textOf(elem, modules.domutils);
  if (!style.fontKnown || style.fontPx < 72 || text.length < 40) return [];
  return [{ id: 'oversized-h1', snippet: `${Math.round(style.fontPx)}px h1, ${text.length} chars "${text.slice(0, 60)}"` }];
}

// ---- hairline border + wide diffuse shadow ----

function shadowLayerAlpha(layer) {
  const token = layer.match(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-fA-F]{3,8}\b|\b(?:black|white|transparent|currentcolor)\b/i);
  if (!token) return 1;
  if (token[0].toLowerCase() === 'transparent') return 0;
  return parseAnyColor(token[0])?.a ?? 1;
}

function maxBlur(shadow, minAlpha) {
  let blur = 0;
  for (const layer of String(shadow || '').split(/,(?![^()]*\))/)) {
    if (shadowLayerAlpha(layer) < minAlpha) continue;
    const stripped = layer.replace(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-fA-F]{3,8}\b/gi, ' ').replace(/\b[a-z]+\b/gi, ' ');
    const nums = [...stripped.matchAll(/-?\d*\.?\d+/g)].map((match) => parseFloat(match[0]));
    if (nums.length >= 3) blur = Math.max(blur, nums[2]);
  }
  return blur;
}

export function thinBorderWideShadow(style) {
  const visible = ['top', 'right', 'bottom', 'left'].map((side) => ({
    width: /^(?:none|hidden)$/.test(style.get(`border-${side}-style`) || '') ? 0 : (lengthToPx(style.get(`border-${side}-width`), style.fontPx) ?? 0),
    alpha: parseAnyColor(style.get(`border-${side}-color`) || '')?.a ?? (style.get(`border-${side}-color`) ? 1 : 0),
  })).filter((side) => side.width > 0 && side.width <= 1.5 && side.alpha >= 0.28);
  const blur = maxBlur(style.get('box-shadow'), 0.12);
  if (visible.length < 2 || blur < 16) return [];
  return [{ id: 'gpt-thin-border-wide-shadow', snippet: `${Math.max(...visible.map((side) => side.width))}px border + ${Math.round(blur)}px shadow blur` }];
}
