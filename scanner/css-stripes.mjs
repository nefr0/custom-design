// Accent stripes drawn without a border: pseudo-elements and inset box-shadows.
// Ported from Impeccable's detector (Apache-2.0).
import { chromaSpread, isNeutralAuthoredColor, parseAnyColor } from './color.mjs';
import {
  blankComments, collectCustomProps, cssLengthToPx, isZeroOffset, iterateRuleBlocks, parseDeclBlock, resolveVarRefs,
} from './css-util.mjs';

const PSEUDO_PROSE_TAGS = /\b(?:blockquote|pre|code|nav|hr)\b/i;
const UNDERLINE_TAGS = /(?:^|[\s>+~,(])(?:a|button|summary|tr|td|th|table|li)(?![\w-])/i;
const SELECTED_STATE = /\[aria-selected\s*[*^$|~]?=\s*["']?true/i;
const CURRENT_STATE = /\[aria-current(?!\s*[*^$|~]?=\s*["']?false)/i;
const STATE_CLASS = /(?:^|[\s._[-])(?:active|current|selected|btn[\w-]*|button[\w-]*|link[\w-]*)(?![\w])/i;
const INTERACTION_STATE = /:(?:hover|focus|focus-visible|focus-within|active|checked)\b/i;

function expandInset(inset) {
  const parts = inset.split(/\s+/);
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return parts;
}

function readOffsets(decls) {
  const offsets = { top: decls.get('top'), right: decls.get('right'), bottom: decls.get('bottom'), left: decls.get('left') };
  const inset = decls.get('inset');
  if (inset) {
    const [top, right, bottom, left] = expandInset(inset);
    offsets.top ??= top;
    offsets.right ??= right;
    offsets.bottom ??= bottom;
    offsets.left ??= left;
  }
  offsets.left ??= decls.get('inset-inline-start');
  offsets.right ??= decls.get('inset-inline-end');
  return offsets;
}

function isThickEnough(px) {
  return px != null && px >= 3 && px <= 12;
}

function horizontalAllowed(selector) {
  return !UNDERLINE_TAGS.test(selector) && !SELECTED_STATE.test(selector) && !CURRENT_STATE.test(selector)
    && !STATE_CLASS.test(selector) && !INTERACTION_STATE.test(selector);
}

function verticalEdge(offsets, heightValue, props) {
  const topPx = cssLengthToPx(resolveVarRefs(String(offsets.top ?? ''), props));
  const bottomPx = cssLengthToPx(resolveVarRefs(String(offsets.bottom ?? ''), props));
  const nearCorners = topPx != null && bottomPx != null && topPx >= 0 && topPx <= 20 && bottomPx >= 0 && bottomPx <= 20;
  const fullHeight = (isZeroOffset(offsets.top) && isZeroOffset(offsets.bottom)) || /^100(?:\.0*)?%$/.test(heightValue) || nearCorners;
  if (!fullHeight) return null;
  if (isZeroOffset(offsets.left)) return 'left';
  return isZeroOffset(offsets.right) ? 'right' : null;
}

function horizontalEdge(offsets, widthValue) {
  const fullWidth = (isZeroOffset(offsets.left) && isZeroOffset(offsets.right)) || /^100(?:\.0*)?%$/.test(widthValue);
  if (!fullWidth) return null;
  if (isZeroOffset(offsets.top)) return 'top';
  return isZeroOffset(offsets.bottom) ? 'bottom' : null;
}

function stripeFillIsChromatic(background) {
  if (!background || /^(?:none|transparent|inherit|initial|unset|currentcolor)$/i.test(background)) return false;
  const token = background.match(/(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\([^)]*\)|#[0-9a-f]{3,8}\b/i);
  const parsed = parseAnyColor(token ? token[0] : background);
  if (parsed) return (parsed.a ?? 1) >= 0.1 && chromaSpread(parsed) >= 30;
  return !/^(?:white|black|gray|grey|silver)$/i.test(background);
}

function pseudoStripeEdge(selector, decls, props) {
  const lengthOf = (key, alias) => resolveVarRefs(decls.get(key) || decls.get(alias) || '', props);
  const widthPx = cssLengthToPx(lengthOf('width', 'inline-size'));
  const heightPx = cssLengthToPx(lengthOf('height', 'block-size'));
  const offsets = readOffsets(decls);
  if (isThickEnough(widthPx)) {
    const edge = verticalEdge(offsets, String(lengthOf('height', 'block-size')).trim(), props);
    if (edge) return { edge, thickness: widthPx };
  }
  if (isThickEnough(heightPx) && horizontalAllowed(selector)) {
    const edge = horizontalEdge(offsets, String(lengthOf('width', 'inline-size')).trim());
    if (edge) return { edge, thickness: heightPx };
  }
  return null;
}

export function scanPseudoStripe(rawContent) {
  const content = blankComments(String(rawContent || ''));
  const props = collectCustomProps(content);
  const findings = [];
  const seen = new Set();
  for (const rule of iterateRuleBlocks(content)) {
    if (!/::?(?:before|after)\b/i.test(rule.selector) || PSEUDO_PROSE_TAGS.test(rule.selector)) continue;
    const decls = parseDeclBlock(rule.body);
    if (!['absolute', 'fixed'].includes(decls.get('position'))) continue;
    const stripe = pseudoStripeEdge(rule.selector, decls, props);
    const background = String(resolveVarRefs(decls.get('background-color') || decls.get('background') || '', props)).trim();
    if (!stripe || !stripeFillIsChromatic(background) || seen.has(rule.selector)) continue;
    seen.add(rule.selector);
    findings.push({
      id: 'side-tab', index: rule.index,
      snippet: `${rule.selector} - absolute ${stripe.thickness}px pseudo-element stripe (${stripe.edge}: 0)`,
    });
  }
  return findings;
}

// ---- inset box-shadow stripes ----

const CHROMATIC_TOKEN = /(?:^|-)(?:accent|gold|red|orange|amber|yellow|lime|green|emerald|teal|cyan|blue|indigo|violet|purple|magenta|pink|rose|coral|aqua|mint|burgundy|crimson|scarlet)(?:-|$)/i;
const SELECTION_SELECTOR_TESTS = [
  /:(?:hover|focus|focus-visible|focus-within|active|checked|target)\b/i,
  /\[aria-selected\s*[*^$|~]?=\s*["']?true/i,
  /\[aria-current(?!\s*[*^$|~]?=\s*["']?false)/i,
  /(?:^|[\s._[-])(?:active|current|selected)(?![\w])/i,
  /(?:^|[\s>+~,(])(?:button|hr|tr|td|th|table|blockquote|pre|code)(?![\w-])/i,
];

function insetColorIsChromatic(rawColor) {
  const color = String(rawColor || '').trim().replace(/\s*!important\s*$/i, '');
  if (/^(?:currentcolor|transparent|inherit|unset)$/i.test(color)) return false;
  const variable = color.match(/^var\(\s*(--[\w-]+)/i);
  if (variable) return CHROMATIC_TOKEN.test(variable[1]);
  if (!/^(?:#|rgba?\(|hsla?\(|hwb\(|oklch\(|oklab\(|lch\(|lab\(|color\(|[a-z]+$)/i.test(color)) return false;
  return !isNeutralAuthoredColor(color);
}

function tokenizeLayer(layer) {
  return layer.match(/(?:[^\s()]|\((?:[^()]|\([^()]*\))*\))+/g) || [];
}

function isShadowLength(token) {
  return /^-?\d*\.?\d+(?:px)?$/i.test(token);
}

function insetLayerEdge(layer) {
  const tokens = tokenizeLayer(layer.trim());
  if (!tokens.some((token) => /^inset$/i.test(token))) return null;
  const rest = tokens.filter((token) => !/^inset$/i.test(token));
  const lengths = rest.filter(isShadowLength);
  const colors = rest.filter((token) => !isShadowLength(token));
  if (lengths.length < 2 || lengths.length > 4 || colors.length !== 1) return null;
  const values = lengths.map((token) => ({ num: Number(token.replace(/px$/i, '')), hasPx: /px$/i.test(token) }));
  const [offX, offY] = values;
  const extra = (values[2]?.num ?? 0) !== 0 || (values[3]?.num ?? 0) !== 0;
  if ((offX.num !== 0 && !offX.hasPx) || (offY.num !== 0 && !offY.hasPx) || extra) return null;
  const absX = Math.abs(offX.num);
  const absY = Math.abs(offY.num);
  const vertical = absX >= 3 && absX <= 12 && absY === 0;
  const horizontal = absY >= 3 && absY <= 12 && absX === 0;
  if (!(vertical || horizontal) || !insetColorIsChromatic(colors[0])) return null;
  if (vertical) return { size: absX, edge: offX.num > 0 ? 'left' : 'right' };
  return { size: absY, edge: offY.num > 0 ? 'top' : 'bottom' };
}

function lastDeclaration(body, prop) {
  const matches = [...body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'gi'))];
  return matches.length ? matches[matches.length - 1] : null;
}

function insetStripeForRule(rule) {
  if (SELECTION_SELECTOR_TESTS.some((test) => test.test(rule.selector))) return null;
  const width = lastDeclaration(rule.body, '(?:width|inline-size)');
  const widthMatch = width && width[1].match(/^(\d+(?:\.\d+)?)px/i);
  if (widthMatch && Number(widthMatch[1]) <= 40) return null;
  const shadow = lastDeclaration(rule.body, 'box-shadow');
  if (!shadow || !/\binset\b/i.test(shadow[1])) return null;
  const value = shadow[1].replace(/\s*!\s*important\s*$/i, '').trim();
  for (const layer of value.split(/,(?![^(]*\))/)) {
    const stripe = insetLayerEdge(layer);
    if (stripe) return stripe;
  }
  return null;
}

export function scanInsetStripe(rawContent) {
  const content = blankComments(rawContent);
  const findings = [];
  for (const rule of iterateRuleBlocks(content)) {
    const stripe = insetStripeForRule(rule);
    if (!stripe) continue;
    const selector = rule.selector.replace(/\s+/g, ' ');
    findings.push({ id: 'side-tab', index: rule.index, snippet: `${selector} - inset box-shadow ${stripe.size}px stripe (${stripe.edge})` });
  }
  return findings;
}
