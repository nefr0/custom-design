// Value helpers for the static style engine: tokenizing, shorthand expansion, lengths.
import { parseAnyColor } from './color.mjs';

const BORDER_STYLES = new Set(['none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']);
const WIDTH_KEYWORDS = { thin: 1, medium: 3, thick: 5 };
const FONT_KEYWORD_PX = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32 };
const SIDES = ['top', 'right', 'bottom', 'left'];

export function splitSpaces(value) {
  return String(value || '').match(/(?:[^\s()]|\((?:[^()]|\([^()]*\))*\))+/g) || [];
}

export function lengthToPx(value, fontPx = 16) {
  const text = String(value ?? '').trim().toLowerCase();
  if (WIDTH_KEYWORDS[text] !== undefined) return WIDTH_KEYWORDS[text];
  const clamped = text.match(/^clamp\(.*,\s*([^,()]+)\)$/);
  if (clamped) return lengthToPx(clamped[1], fontPx);
  const match = text.match(/^(-?\d*\.?\d+)(px|rem|em|%|pt)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = match[2];
  if (!unit) return num === 0 ? 0 : null;
  const factors = { px: 1, rem: 16, em: fontPx, pt: 96 / 72, '%': fontPx / 100 };
  return num * factors[unit];
}

export function fontSizeToPx(value, parentPx) {
  const text = String(value ?? '').trim().toLowerCase();
  if (FONT_KEYWORD_PX[text]) return FONT_KEYWORD_PX[text];
  if (text === 'smaller') return parentPx / 1.2;
  if (text === 'larger') return parentPx * 1.2;
  if (text.endsWith('%')) return (parseFloat(text) / 100) * parentPx;
  return lengthToPx(text, parentPx);
}

function expandFour(values) {
  if (values.length === 1) return [values[0], values[0], values[0], values[0]];
  if (values.length === 2) return [values[0], values[1], values[0], values[1]];
  if (values.length === 3) return [values[0], values[1], values[2], values[1]];
  return values.slice(0, 4);
}

function isWidthToken(token) {
  return WIDTH_KEYWORDS[token.toLowerCase()] !== undefined || /^-?\d*\.?\d+(?:px|rem|em|pt)?$/i.test(token);
}

function parseBorderShorthand(value) {
  const parts = { width: '', style: '', color: '' };
  for (const token of splitSpaces(value)) {
    if (BORDER_STYLES.has(token.toLowerCase())) parts.style = token.toLowerCase();
    else if (isWidthToken(token)) parts.width = token;
    else parts.color = token;
  }
  if (parts.style === 'none' || parts.style === 'hidden') parts.width = '0';
  if (!parts.style && !parts.width && !parts.color) parts.width = '0';
  return { width: parts.width || 'medium', style: parts.style || 'none', color: parts.color || 'currentcolor' };
}

function expandBorder(prop, value) {
  const sides = prop === 'border' ? SIDES : [prop.replace('border-', '')];
  const parsed = parseBorderShorthand(value);
  return sides.flatMap((side) => [
    [`border-${side}-width`, parsed.width], [`border-${side}-style`, parsed.style], [`border-${side}-color`, parsed.color],
  ]);
}

function expandBorderBox(prop, value) {
  const kind = prop.replace('border-', '');
  const values = expandFour(splitSpaces(value));
  return SIDES.map((side, idx) => [`border-${side}-${kind}`, values[idx]]);
}

function expandBackground(value) {
  const pairs = [];
  for (const token of splitSpaces(value)) {
    const isImage = /^url\(/i.test(token) || /gradient\(/i.test(token);
    const isColor = !isImage && (token.toLowerCase() === 'transparent' || /^var\(/i.test(token) || parseAnyColor(token));
    if (isImage) pairs.push(['background-image', token]);
    else if (isColor) pairs.push(['background-color', token]);
  }
  if (!pairs.some(([prop]) => prop === 'background-image')) pairs.push(['background-image', 'none']);
  if (!pairs.some(([prop]) => prop === 'background-color')) pairs.push(['background-color', 'transparent']);
  return pairs;
}

function expandFont(value) {
  const match = String(value).match(/(?:^|\s)(\d*\.?\d+(?:px|rem|em|%|pt))(?:\/(\d*\.?\d+(?:px|rem|em|%|pt)?))?(?=\s)/);
  if (!match) return [];
  const pairs = [['font-size', match[1]]];
  if (match[2]) pairs.push(['line-height', match[2]]);
  const weight = String(value).match(/(?:^|\s)(bold|bolder|lighter|[1-9]00)(?=\s)/);
  if (weight) pairs.push(['font-weight', weight[1]]);
  return pairs;
}

export function expandDeclaration(prop, value) {
  if (/^border(?:-(?:top|right|bottom|left))?$/.test(prop)) return expandBorder(prop, value);
  if (/^border-(?:width|style|color)$/.test(prop)) return expandBorderBox(prop, value);
  if (prop === 'background') return expandBackground(value);
  if (prop === 'font') return expandFont(value);
  return [[prop, value]];
}
