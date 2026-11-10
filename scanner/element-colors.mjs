// Border and color rules evaluated on resolved element styles.
// Ported from Impeccable's detector (Apache-2.0).
import {
  colorToHex, contrastRatio, getHue, hasChroma, isNeutralAuthoredColor, parseAnyColor, relativeLuminance,
} from './color.mjs';
import {
  SAFE_TAGS, WCAG_LARGE_BOLD_TEXT_PX, WCAG_LARGE_TEXT_PX, backgroundOf, classNames, closestMatching, directText, isHidden,
} from './element-util.mjs';
import { lengthToPx } from './style-values.mjs';

const BORDER_SAFE_TAGS = new Set([...SAFE_TAGS].filter((tag) => tag !== 'label'));
const SIDES = ['top', 'right', 'bottom', 'left'];
const COLORED_BG_CLASS = /\bbg-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+\b/;

// ---- borders ----

function sideWidth(style, side) {
  if (/^(?:none|hidden)$/i.test(style.get(`border-${side}-style`) || '')) return 0;
  return lengthToPx(style.get(`border-${side}-width`), style.fontPx) ?? 0;
}

function sideColor(style, side) {
  const raw = style.get(`border-${side}-color`) || 'currentcolor';
  return /^currentcolor$/i.test(raw) ? (style.get('color') || 'currentcolor') : raw;
}

function borderRadiusPx(style) {
  const first = String(style.get('border-radius') || '').trim().split(/[\s/]+/)[0];
  if (first.endsWith('%')) return parseFloat(first) > 0 ? 1 : 0;
  return lengthToPx(first, style.fontPx) ?? 0;
}

function sideFinding(side, width, others, radius, flags) {
  const maxOther = Math.max(...others);
  if (!(width >= 2 && (maxOther <= 1 || width >= maxOther * 2))) return null;
  const label = `border-${side}: ${width}px`;
  const withRadius = `${label} + border-radius: ${radius}px`;
  if (side === 'left' || side === 'right') {
    if (flags.spanBadge) return null;
    if (radius > 0) return { id: 'side-tab', snippet: withRadius };
    return width >= 3 ? { id: 'side-tab', snippet: label } : null;
  }
  if (radius > 0) return { id: 'border-accent-on-rounded', snippet: withRadius };
  return !flags.tabContext && width >= 3 && width <= 12 ? { id: 'side-tab', snippet: label } : null;
}

export function bordersFor(elem, style, tabTest, statusTest) {
  const spanBadge = elem.name === 'span' && ((parseAnyColor(style.get('background-color'))?.a ?? 0) > 0.1);
  if ((BORDER_SAFE_TAGS.has(elem.name) && !spanBadge) || statusTest(elem)) return [];
  const widths = Object.fromEntries(SIDES.map((side) => [side, sideWidth(style, side)]));
  const radius = borderRadiusPx(style);
  const flags = { spanBadge, tabContext: tabTest(elem) };
  const findings = [];
  for (const side of SIDES) {
    if (widths[side] < 1 || isNeutralAuthoredColor(sideColor(style, side))) continue;
    const others = SIDES.filter((other) => other !== side).map((other) => widths[other]);
    const found = sideFinding(side, widths[side], others, radius, flags);
    if (found) findings.push(found);
  }
  return findings;
}

// ---- text colors ----

function ownSurfaceIsControl(style, fontPx) {
  const own = parseAnyColor(style.get('background-color'));
  const gradient = /gradient/i.test(style.get('background-image') || '');
  return ((own && own.a > 0.5) || gradient) && fontPx >= 9;
}

function contrastFinding(textColor, bgs, large) {
  const ratios = bgs.map((bgColor) => contrastRatio(textColor, bgColor));
  const worst = ratios.indexOf(Math.min(...ratios));
  const threshold = large ? 3 : 4.5;
  if (ratios[worst] >= threshold) return null;
  const ratioLabel = ratios[worst].toFixed(1) === threshold.toFixed(1) ? ratios[worst].toFixed(2) : ratios[worst].toFixed(1);
  return { id: 'low-contrast', snippet: `${ratioLabel}:1 (need ${threshold}:1) - text ${colorToHex(textColor)} on ${colorToHex(bgs[worst])}` };
}

function textColorFindings(textColor, background, style, large) {
  const bgs = background.color ? [background.color] : background.stops;
  const findings = [];
  const luminance = relativeLuminance(textColor);
  const isGray = !hasChroma(textColor, 20) && luminance > 0.05 && luminance < 0.85;
  if (isGray && bgs.every((bgColor) => hasChroma(bgColor, 40))) {
    const label = background.color ? colorToHex(background.color) : `gradient(${bgs.map(colorToHex).join(', ')})`;
    findings.push({ id: 'gray-on-color', snippet: `text ${colorToHex(textColor)} on bg ${label}` });
  }
  const alphaFallback = !background.color && (textColor.a ?? 1) < 1;
  const contrast = alphaFallback ? null : contrastFinding(textColor, bgs, large);
  if (contrast) findings.push(contrast);
  return findings;
}

function purpleHeadingFinding(textColor, elem, fontPx) {
  if (!hasChroma(textColor, 50)) return null;
  const hue = getHue(textColor);
  const heading = ['h1', 'h2', 'h3'].includes(elem.name) || fontPx >= 20;
  return hue >= 260 && hue <= 310 && heading
    ? { id: 'ai-color-palette', snippet: `Purple/violet text (${colorToHex(textColor)}) on heading` } : null;
}

function classListFindings(elem) {
  const classes = classNames(elem);
  const findings = [];
  const gray = classes.match(/\btext-(?:gray|slate|zinc|neutral|stone)-\d+\b/);
  const colored = classes.match(COLORED_BG_CLASS);
  if (gray && colored) findings.push({ id: 'gray-on-color', snippet: `${gray[0]} on ${colored[0]}` });
  if (/\bbg-clip-text\b/.test(classes) && /\bbg-gradient-to-/.test(classes)) {
    findings.push({ id: 'gradient-text', snippet: 'bg-clip-text + bg-gradient (Tailwind)' });
  }
  const purple = classes.match(/\btext-(?:purple|violet|indigo)-\d+\b/);
  if (purple && (['h1', 'h2', 'h3'].includes(elem.name) || /\btext-[2-9]xl\b/.test(classes))) {
    findings.push({ id: 'ai-color-palette', snippet: `${purple[0]} on heading` });
  }
  const gradient = /\bfrom-(?:purple|violet|indigo)-\d+\b/.test(classes) && /\bto-(?:purple|violet|indigo|blue|cyan|pink|fuchsia)-\d+\b/.test(classes);
  if (gradient) findings.push({ id: 'ai-color-palette', snippet: 'Purple/violet gradient (Tailwind)' });
  return findings;
}

function isLargeText(style) {
  const weight = parseInt(style.get('font-weight'), 10) || (/bold/.test(style.get('font-weight') || '') ? 700 : 400);
  return style.fontPx >= WCAG_LARGE_TEXT_PX || (style.fontPx >= WCAG_LARGE_BOLD_TEXT_PX && weight >= 700);
}

function textContrastFor(elem, style, resolver) {
  const textColor = parseAnyColor(style.get('color'));
  const clipped = (style.get('background-clip') || style.get('-webkit-background-clip')) === 'text';
  const background = clipped ? null : backgroundOf(elem, resolver);
  if (!textColor || !style.fontKnown) return [];
  const findings = background ? textColorFindings(textColor, background, style, isLargeText(style)) : [];
  const purple = purpleHeadingFinding(textColor, elem, style.fontPx);
  return purple ? findings.concat(purple) : findings;
}

export function colorsFor(elem, resolver) {
  if (isHidden(elem, resolver)) return [];
  const style = resolver.computed(elem);
  const hasText = directText(elem).trim().length > 0;
  const findings = [];
  const gradientClip = (style.get('background-clip') || style.get('-webkit-background-clip')) === 'text';
  if (gradientClip && /gradient/i.test(style.get('background-image') || '')) {
    findings.push({ id: 'gradient-text', snippet: 'background-clip: text + gradient' });
  }
  const skipText = SAFE_TAGS.has(elem.name) && !(hasText && ownSurfaceIsControl(style, style.fontPx));
  if (hasText && !skipText) findings.push(...textContrastFor(elem, style, resolver));
  return findings.concat(classListFindings(elem));
}

// ---- contexts used to exempt borders ----

export function makeContextTests(modules) {
  const tabSelector = modules.compile('[aria-selected="true"], [aria-current]:not([aria-current="false"])');
  const statusSelector = modules.compile('[role="status"], [role="alert"], [role="alertdialog"], [role="log"], [aria-live="polite"], [aria-live="assertive"]');
  const stateClass = /(?:^|[\s_-])(?:active|current|selected)(?:$|[\s_-])/i;
  const tabTest = (elem) => {
    if (closestMatching(elem, tabSelector)) return true;
    let cur = elem;
    for (let depth = 0; cur && depth < 6; depth++, cur = cur.parent?.type === 'tag' ? cur.parent : null) {
      if (stateClass.test(classNames(cur))) return true;
    }
    return false;
  };
  return { tabTest, statusTest: (elem) => Boolean(closestMatching(elem, statusSelector)) };
}
