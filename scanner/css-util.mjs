// Shared CSS text helpers. Ported from Impeccable's detector (Apache-2.0).
import { CSS_NAMED_COLORS, balancedEnd, parseAnyColor, relativeLuminance } from './color.mjs';

export { balancedEnd };

export const RULE_BLOCK_SOURCE = String.raw`([^{};]+)\{([^{}]*)\}`;
export const COMMA_OUTSIDE_PARENS = /,(?![^(]*\))/;

export function blankComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
}

export function lineAt(text, offset) {
  let line = 1;
  for (let idx = 0; idx < offset && idx < text.length; idx++) if (text[idx] === '\n') line++;
  return line;
}

export function collectCustomProps(content) {
  const props = new Map();
  const regex = /(--[\w-]+)\s*:\s*([^;{}]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (!props.has(match[1])) props.set(match[1], match[2].trim());
  }
  return props;
}

export function resolveVarRefs(raw, props, depth = 0) {
  if (typeof raw !== 'string' || !raw.includes('var(') || depth > 8) return raw;
  return raw.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)/g, (whole, name, fallback) => {
    const value = props.get(name);
    if (value != null) return resolveVarRefs(value, props, depth + 1);
    return fallback ? resolveVarRefs(fallback.trim(), props, depth + 1) : whole;
  });
}

export function parseDeclBlock(block) {
  const decls = new Map();
  for (const part of String(block || '').split(';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).replace(/\s*!important\s*$/i, '').trim();
    if (prop && value) decls.set(prop, value);
  }
  return decls;
}

export function cssLengthToPx(value) {
  const match = String(value || '').trim().match(/^(-?[\d.]+)(px|rem|em)$/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  return match[2].toLowerCase() === 'px' ? num : num * 16;
}

export function isZeroOffset(value) {
  return value != null && /^-?0(?:px|%|rem|em)?$/.test(String(value).trim());
}

function firstColorToken(layer) {
  const func = layer.match(/(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab|color)\([^)]*\)/i);
  if (func) return { text: func[0], start: func.index };
  const hex = layer.match(/#[0-9a-fA-F]{3,8}\b/);
  if (hex) return { text: hex[0], start: hex.index };
  return null;
}

export function findShadowColor(layer) {
  const token = firstColorToken(layer);
  if (token) {
    return { color: parseAnyColor(token.text), start: token.start, end: token.start + token.text.length };
  }
  const wordRegex = /[a-zA-Z]+/g;
  let match;
  while ((match = wordRegex.exec(layer)) !== null) {
    const named = CSS_NAMED_COLORS[match[0].toLowerCase()];
    if (named) {
      return { color: { r: named[0], g: named[1], b: named[2], a: 1 }, start: match.index, end: match.index + match[0].length };
    }
  }
  return null;
}

export function extractShadowLengths(layer, colorStart, colorEnd) {
  const stripped = colorStart != null ? layer.slice(0, colorStart) + ' ' + layer.slice(colorEnd) : layer;
  const values = [];
  for (const match of stripped.matchAll(/(-?\d*\.?\d+)(px|rem|em)?/g)) {
    values.push(parseFloat(match[1]) * (match[2] === 'rem' || match[2] === 'em' ? 16 : 1));
  }
  return values;
}

function rootScopeBlocks(content) {
  const scopes = [];
  const blockRegex = /(?:^|[}\s,;>])(?:body|html|:root)\s*(?:,[^{]*)?\{([^}]*)\}/gi;
  let match;
  while ((match = blockRegex.exec(content)) !== null) scopes.push(match[1]);
  const inlineBody = content.match(/<body[^>]*\bstyle\s*=\s*"([^"]*)"/i);
  if (inlineBody) scopes.push(inlineBody[1]);
  return scopes;
}

function scopeHasDarkBackground(scope, props) {
  for (const decl of scope.matchAll(/background(?:-color)?\s*:\s*([^;{}]+)/gi)) {
    const color = parseAnyColor(resolveVarRefs(decl[1].trim(), props));
    if (color && (color.a ?? 1) > 0.5 && relativeLuminance(color) < 0.1) return true;
  }
  return false;
}

const DARK_BACKGROUND = /background(?:-color)?\s*:\s*(?:#(?:0[0-9a-f]|1[0-9a-f]|2[0-3])[0-9a-f]{4}\b|#(?:0|1)[0-9a-f]{2}\b|rgb\(\s*(\d{1,2})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\))/i;
const TAILWIND_DARK_BACKGROUND = /\bbg-(?:gray|slate|zinc|neutral|stone)-(?:9\d{2}|800)\b/;

export function textHasDarkRootBackground(content, props) {
  if (DARK_BACKGROUND.test(content) || TAILWIND_DARK_BACKGROUND.test(content)) return true;
  return rootScopeBlocks(content).some((scope) => scopeHasDarkBackground(scope, props));
}

export function matchingBraceEnd(text, startIdx) {
  let depth = 1;
  let idx = startIdx;
  while (idx < text.length && depth > 0) {
    if (text[idx] === '{') depth++;
    else if (text[idx] === '}') depth--;
    idx++;
  }
  return idx;
}

export function* iterateRuleBlocks(content) {
  const regex = new RegExp(RULE_BLOCK_SOURCE, 'g');
  let match;
  while ((match = regex.exec(content)) !== null) {
    const leading = match[1].length - match[1].trimStart().length;
    yield { selector: match[1].trim(), body: match[2], index: match.index + leading };
  }
}
