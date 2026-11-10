// Element helpers shared by the static HTML rules.
import { compositeColorOver, parseAnyColor, parseGradientColors } from './color.mjs';

export const SAFE_TAGS = new Set([
  'blockquote', 'nav', 'a', 'input', 'textarea', 'select', 'pre', 'code', 'span', 'th', 'td', 'tr', 'li',
  'label', 'button', 'hr', 'html', 'head', 'body', 'script', 'style', 'link', 'meta', 'title', 'br', 'img',
  'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'defs', 'use',
]);
export const WCAG_LARGE_TEXT_PX = 18 * (96 / 72);
export const WCAG_LARGE_BOLD_TEXT_PX = 14 * (96 / 72);

const NO_PAINT = new Set(['', 'transparent', 'none', 'initial', 'inherit', 'unset', 'revert', 'revert-layer']);

export function directText(elem) {
  return elem.children.filter((child) => child.type === 'text').map((child) => child.data).join('');
}

export function textOf(elem, domutils) {
  return domutils.textContent(elem).replace(/\s+/g, ' ').trim();
}

export function parentElement(elem) {
  return elem.parent && elem.parent.type === 'tag' ? elem.parent : null;
}

export function ancestorsAndSelf(elem) {
  const chain = [];
  for (let cur = elem; cur; cur = parentElement(cur)) chain.push(cur);
  return chain;
}

export function closestMatching(elem, test) {
  return ancestorsAndSelf(elem).find((cur) => test(cur)) || null;
}

export function isHidden(elem, resolver) {
  return ancestorsAndSelf(elem).some((cur) => {
    if (cur.attribs?.hidden !== undefined) return true;
    const style = resolver.computed(cur);
    const opacity = parseFloat(style.get('opacity'));
    return style.get('display') === 'none' || ['hidden', 'collapse'].includes(style.get('visibility'))
      || (Number.isFinite(opacity) && opacity <= 0.01);
  });
}

function ownPaint(style) {
  const image = style.get('background-image') || '';
  if (/gradient/i.test(image)) {
    const stops = parseGradientColors(image);
    if (stops.length) return { stops };
  }
  const text = String(style.get('background-color') || '').trim().toLowerCase();
  if (NO_PAINT.has(text)) return null;
  const color = parseAnyColor(text);
  return color ? { color } : { unreadable: true };
}

export function backgroundOf(elem, resolver) {
  for (let cur = elem; cur; cur = parentElement(cur)) {
    const paint = ownPaint(resolver.computed(cur));
    if (!paint) continue;
    if (paint.stops || paint.unreadable) return paint.unreadable ? null : paint;
    if ((paint.color.a ?? 1) >= 0.99) return paint;
    const parent = parentElement(cur);
    const base = parent ? backgroundOf(parent, resolver) : null;
    return base?.color ? { color: compositeColorOver(paint.color, base.color) } : null;
  }
  return null;
}

export function classNames(elem) {
  return String(elem.attribs?.class || '');
}

export function lengthOrZero(value, fontPx) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return 0;
  if (/rem$/.test(value)) return num * 16;
  if (/em$/.test(value)) return num * fontPx;
  return num;
}
