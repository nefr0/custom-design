// Line-oriented regex rules for class names, inline styles and CSS declarations.
// Ported from Impeccable's detector (Apache-2.0).
import { isNeutralAuthoredColor } from './color.mjs';

const hasRounded = (line) => /\brounded(?:-\w+)?\b/.test(line.replace(/\brounded-none\b/g, ''));
const hasBorderRadius = (line) => /border-radius/i.test(line);
const isSafeElement = (line) => /<(?:blockquote|nav[\s>]|pre[\s>]|code[\s>]|a\s|input[\s>]|span[\s>])/i.test(line);

const TAILWIND_COLORS = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLORED_BACKGROUND = new RegExp(`\\bbg-(?:${TAILWIND_COLORS})-\\d+\\b`);
const BOUNCE_WORDS = /bounce|elastic|wobble|jiggle|spring/i;
const LAYOUT_PROPS = /\b(?:(?:max|min)-)?(?:width|height)\b|\bpadding\b|\bmargin\b/;
const LAYOUT_PROPS_ALL = /\b(?:(?:max|min)-)?(?:width|height)\b|\bpadding(?:-(?:top|right|bottom|left))?\b|\bmargin(?:-(?:top|right|bottom|left))?\b/gi;

function isNeutralBorderColor(text) {
  const match = text.match(/solid\s+((?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\([^)]*\)|#[0-9a-f]{3,8}\b|[a-z]+)/i);
  return match ? isNeutralAuthoredColor(match[1]) : false;
}

function sideTabBorderShorthand(match, line) {
  if (isSafeElement(line) || isNeutralBorderColor(match[0])) return false;
  const width = +match[1];
  return hasBorderRadius(line) ? width >= 2 : width >= 3;
}

function transitionValue(match) {
  return (match[2] ?? match[3] ?? '').toLowerCase();
}

function isLayoutTransition(match) {
  const value = transitionValue(match);
  return !/\ball\b/.test(value) && LAYOUT_PROPS.test(value);
}

function layoutTransitionLabel(prefix) {
  return (match) => {
    const raw = match[2] ?? match[3] ?? '';
    const found = raw.match(LAYOUT_PROPS_ALL);
    return `${prefix}: ${found ? found.join(', ') : raw.trim()}`;
  };
}

function bounceToken(match) {
  const token = match[1].split(/[,\s]+/).find((part) => BOUNCE_WORDS.test(part));
  return `animation: ${token || match[1].trim()}`;
}

function overshootsBezier(match) {
  const [first, second] = [parseFloat(match[2]), parseFloat(match[4])];
  return first < -0.1 || first > 1.1 || second < -0.1 || second > 1.1;
}

function tailwindBackground(line) {
  return line.match(COLORED_BACKGROUND);
}

const always = () => true;

function widthRule(id, regex, minimum) {
  return { id, regex, test: (match, line) => !isSafeElement(line) && +match[1] >= minimum, fmt: (match) => match[0] };
}

export const LINE_RULES = [
  { id: 'side-tab', regex: /\bborder-[lrse]-(\d+)\b/g, test: (match, line) => (hasRounded(line) ? +match[1] >= 2 : +match[1] >= 4), fmt: (match) => match[0] },
  { id: 'side-tab', regex: /border-(?:left|right)\s*:\s*(\d+)px\s+solid[^;]*/gi, test: sideTabBorderShorthand, fmt: (match) => match[0].replace(/\s*;?\s*$/, '') },
  widthRule('side-tab', /border-(?:left|right)-width\s*:\s*(\d+)px/gi, 3),
  widthRule('side-tab', /border-inline-(?:start|end)\s*:\s*(\d+)px\s+solid/gi, 3),
  widthRule('side-tab', /border-inline-(?:start|end)-width\s*:\s*(\d+)px/gi, 3),
  { id: 'side-tab', regex: /border(?:Left|Right)\s*[:=]\s*["'`](\d+)px\s+solid/g, test: (match) => +match[1] >= 3, fmt: (match) => match[0] },
  { id: 'border-accent-on-rounded', regex: /\bborder-[tb]-(\d+)\b/g, test: (match, line) => hasRounded(line) && +match[1] >= 1, fmt: (match) => match[0] },
  { id: 'border-accent-on-rounded', regex: /border-(?:top|bottom)\s*:\s*(\d+)px\s+solid/gi, test: (match, line) => +match[1] >= 3 && hasBorderRadius(line), fmt: (match) => match[0] },
  { id: 'gradient-text', regex: /background-clip\s*:\s*text|-webkit-background-clip\s*:\s*text/gi, test: (match, line) => /gradient/i.test(line), fmt: () => 'background-clip: text + gradient' },
  { id: 'gradient-text', regex: /\bbg-clip-text\b/g, test: (match, line) => /\bbg-gradient-to-/i.test(line), fmt: () => 'bg-clip-text + bg-gradient' },
  { id: 'gray-on-color', regex: /\btext-(?:gray|slate|zinc|neutral|stone)-(\d+)\b/g, test: (match, line) => COLORED_BACKGROUND.test(line), fmt: (match, line) => `${match[0]} on ${tailwindBackground(line)?.[0] || '?'}` },
  { id: 'ai-color-palette', regex: /\btext-(?:purple|violet|indigo)-(\d+)\b/g, test: (match, line) => /\btext-(?:[2-9]xl)\b|<h[1-3]/i.test(line), fmt: (match) => `${match[0]} on heading` },
  { id: 'ai-color-palette', regex: /\bfrom-(?:purple|violet|indigo)-(\d+)\b/g, test: (match, line) => /\bto-(?:purple|violet|indigo|blue|cyan|pink|fuchsia)-\d+\b/.test(line), fmt: (match) => `${match[0]} gradient` },
  { id: 'bounce-easing', regex: /\banimate-bounce\b/g, test: always, fmt: () => 'animate-bounce (Tailwind)' },
  { id: 'bounce-easing', regex: /animation(?:-name)?\s*:\s*([^;{}]*(?:bounce|elastic|wobble|jiggle|spring)[^;{}]*)/gi, test: always, fmt: bounceToken },
  { id: 'bounce-easing', regex: /cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/g, test: overshootsBezier, fmt: (match) => `cubic-bezier(${match[1]}, ${match[2]}, ${match[3]}, ${match[4]})` },
  { id: 'layout-transition', regex: /transition\s*:\s*(?:(['"])((?:(?!\1)[^\\]|\\.)*)\1|([^;{}]+))/gi, test: isLayoutTransition, fmt: layoutTransitionLabel('transition') },
  { id: 'layout-transition', regex: /transition-property\s*:\s*(?:(['"])((?:(?!\1)[^\\]|\\.)*)\1|([^;{}]+))/gi, test: isLayoutTransition, fmt: layoutTransitionLabel('transition-property') },
  { id: 'broken-image', regex: /<img\b[^>]*?\bsrc\s*=\s*(?:""|''|"\s+"|'\s+'|"#"|'#')/gi, test: always, fmt: (match) => match[0].slice(0, 100) },
  { id: 'broken-image', regex: /<img\b(?:(?!\bsrc\s*=)[^>])*>/gi, test: (match) => !/\bsrc\s*=/i.test(match[0]), fmt: (match) => match[0].slice(0, 100) },
];

function lineContext(lines, idx, useBlock) {
  return useBlock ? lines.slice(Math.max(0, idx - 3), Math.min(lines.length, idx + 4)).join(' ') : lines[idx];
}

function runRule(rule, lines, options) {
  const findings = [];
  lines.forEach((line, idx) => {
    rule.regex.lastIndex = 0;
    let match;
    while ((match = rule.regex.exec(line)) !== null) {
      const context = lineContext(lines, idx, options.blockContext);
      if (rule.test(match, context)) findings.push({ id: rule.id, line: idx + 1 + options.lineOffset, snippet: rule.fmt(match, context) });
    }
  });
  return findings;
}

export function runLineRules(lines, options = {}) {
  const settings = { lineOffset: 0, blockContext: false, skipIds: new Set(), ...options };
  const findings = [];
  for (const rule of LINE_RULES) {
    if (!settings.skipIds.has(rule.id)) findings.push(...runRule(rule, lines, settings));
  }
  return findings;
}
