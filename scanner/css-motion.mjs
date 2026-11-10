// Marquee and pulsing-dot scanners. Ported from Impeccable's detector (Apache-2.0).
import {
  COMMA_OUTSIDE_PARENS, blankComments, collectCustomProps, cssLengthToPx, iterateRuleBlocks, matchingBraceEnd,
  parseDeclBlock, resolveVarRefs,
} from './css-util.mjs';

const ANIMATION_KEYWORDS = new Set([
  'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'infinite', 'alternate', 'alternate-reverse',
  'normal', 'reverse', 'none', 'forwards', 'backwards', 'both', 'running', 'paused', 'step-start',
  'step-end', 'inherit', 'initial', 'unset',
]);

function* keyframeBlocks(content) {
  const regex = /@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const end = matchingBraceEnd(content, regex.lastIndex);
    yield { name: match[1], body: content.slice(regex.lastIndex, Math.max(regex.lastIndex, end - 1)) };
    regex.lastIndex = end;
  }
}

function horizontalTravel(body) {
  const travel = [...body.matchAll(/\btranslate(?:X|3d)?\(\s*(-?[\d.]+)%/gi)].map((match) => parseFloat(match[1]));
  if (travel.length === 0) return 0;
  if (travel.length === 1 && /\bscale\(|\bopacity\s*:/i.test(body)) return 0;
  return travel.length > 1 ? Math.max(...travel) - Math.min(...travel) : Math.abs(travel[0]);
}

function collectMarqueeKeyframes(content) {
  const names = new Set();
  for (const frames of keyframeBlocks(content)) {
    if (horizontalTravel(frames.body) >= 20) names.add(frames.name);
  }
  return names;
}

function infiniteAnimationNames(decls) {
  const names = [];
  const shorthand = decls.get('animation');
  for (const layer of shorthand ? shorthand.split(COMMA_OUTSIDE_PARENS) : []) {
    if (!/\binfinite\b/i.test(layer)) continue;
    const name = layer.split(/\s+/).find((token) => /^[a-zA-Z_-][\w-]*$/.test(token) && !ANIMATION_KEYWORDS.has(token.toLowerCase()));
    if (name) names.push(name);
  }
  const nameDecl = decls.get('animation-name');
  if (nameDecl && /\binfinite\b/i.test(decls.get('animation-iteration-count') || '')) {
    names.push(...nameDecl.split(',').map((raw) => raw.trim()).filter((name) => name && name.toLowerCase() !== 'none'));
  }
  return names;
}

export function scanMarquee(content, markup = content) {
  const findings = [];
  if (/<marquee\b/i.test(markup)) findings.push({ id: 'marquee', index: markup.search(/<marquee\b/i), snippet: '<marquee> element' });
  const keyframes = collectMarqueeKeyframes(content);
  if (keyframes.size === 0) return findings;
  const seen = new Set();
  for (const rule of iterateRuleBlocks(content)) {
    for (const name of infiniteAnimationNames(parseDeclBlock(rule.body))) {
      const key = `${rule.selector} ${name}`;
      if (!keyframes.has(name) || seen.has(key)) continue;
      seen.add(key);
      findings.push({ id: 'marquee', index: rule.index, snippet: `${rule.selector} - infinite horizontal loop animation "${name}"` });
    }
  }
  return findings;
}

// ---- pulsing dot ----

function collectPulseKeyframes(content) {
  const map = new Map();
  for (const frames of keyframeBlocks(content)) {
    const pulses = /\bopacity\s*:/i.test(frames.body) || /\bbox-shadow\s*:/i.test(frames.body)
      || /\btransform\s*:[^;{}]*\bscale/i.test(frames.body);
    if (!map.has(frames.name) || pulses) map.set(frames.name, pulses);
  }
  return map;
}

function stripReducedMotionBlocks(content) {
  const regex = /@media[^{]*prefers-reduced-motion\s*:\s*reduce[^{]*\{/gi;
  let output = '';
  let last = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const end = matchingBraceEnd(content, regex.lastIndex);
    output += content.slice(last, match.index);
    last = end;
    regex.lastIndex = end;
  }
  return output + content.slice(last);
}

function landmarkRanges(markup) {
  const ranges = [];
  for (const tag of ['header', 'nav']) {
    const stack = [];
    for (const match of markup.matchAll(new RegExp(`<${tag}\\b|</${tag}\\s*>`, 'gi'))) {
      if (match[0].charAt(1) !== '/') stack.push(match.index);
      else if (stack.length) ranges.push([stack.pop(), match.index]);
    }
  }
  return ranges;
}

function inRanges(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectorHitsLandmark(markup, selector, ranges) {
  if (ranges.length === 0) return false;
  const last = selector.split(/[\s>+~]+/).filter(Boolean).pop() || '';
  const idName = last.match(/#([A-Za-z_][\w-]*)/);
  const className = last.match(/\.([A-Za-z_][\w-]*)/);
  let pattern = null;
  if (idName) pattern = new RegExp(`<[a-zA-Z][^>]*\\bid\\s*=\\s*["']${escapeRegex(idName[1])}["']`, 'gi');
  else if (className) pattern = new RegExp(`<[a-zA-Z][^>]*\\bclass\\s*=\\s*["'][^"']*(?<![\\w-])${escapeRegex(className[1])}(?![\\w-])[^"']*["']`, 'gi');
  if (!pattern) return false;
  return [...markup.matchAll(pattern)].some((match) => inRanges(match.index, ranges));
}

function isRoundDot(radiusValue, width, height) {
  if (!radiusValue) return false;
  const first = String(radiusValue).trim().split(/\s+/)[0];
  const percent = first.match(/^([\d.]+)%$/);
  if (percent) return parseFloat(percent[1]) >= 40;
  const pixels = cssLengthToPx(first);
  return pixels != null && (pixels >= 999 || pixels >= 0.4 * Math.min(width, height));
}

function mergeRuleDeclarations(content) {
  const merged = new Map();
  for (const rule of iterateRuleBlocks(content)) {
    const decls = parseDeclBlock(rule.body);
    if (decls.size === 0) continue;
    for (const raw of rule.selector.split(',')) {
      const selector = raw.trim();
      if (!selector || selector.startsWith('@')) continue;
      const acc = merged.get(selector) || new Map();
      for (const [prop, value] of decls) acc.set(prop, value);
      merged.set(selector, acc);
    }
  }
  return merged;
}

function pulsingDotFor(selector, decls, context) {
  const names = infiniteAnimationNames(decls);
  const pulseName = names.find((name) => (context.keyframes.has(name) ? context.keyframes.get(name) : /pulse|blink|ping/i.test(name)));
  if (!pulseName) return null;
  const width = cssLengthToPx(resolveVarRefs(decls.get('width') || decls.get('inline-size') || '', context.props));
  const height = cssLengthToPx(resolveVarRefs(decls.get('height') || decls.get('block-size') || '', context.props));
  if (width == null || height == null || width < 2 || height < 2 || width > 16 || height > 16) return null;
  if (!isRoundDot(resolveVarRefs(decls.get('border-radius') || '', context.props), width, height)) return null;
  const inLandmark = selectorHitsLandmark(context.markup, selector, context.ranges);
  return `${selector} - ${width}x${height}px dot with infinite "${pulseName}" animation${inLandmark ? ' in header/nav' : ''}`;
}

function tailwindPulsingDots(markup, ranges) {
  const findings = [];
  const seen = new Set();
  for (const attr of markup.matchAll(/class\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const classes = attr[1] || attr[2] || '';
    const anim = classes.match(/\banimate-(ping|pulse)\b/);
    const tiny = /\b(?:w|h|size)-(?:1|1\.5|2|2\.5|3|3\.5|4)\b/.test(classes);
    if (!anim || !/\brounded-full\b/.test(classes) || !tiny || seen.has(classes)) continue;
    seen.add(classes);
    const where = inRanges(attr.index, ranges) ? ' in header/nav' : '';
    findings.push({ id: 'pulsing-dot', index: attr.index, snippet: `animate-${anim[1]} on tiny rounded-full element${where}` });
  }
  return findings;
}

export function scanPulsingDot(cssText, markup = cssText) {
  const context = {
    props: collectCustomProps(cssText), keyframes: collectPulseKeyframes(cssText), markup, ranges: landmarkRanges(markup),
  };
  const scanText = blankComments(stripReducedMotionBlocks(cssText));
  const findings = [];
  for (const [selector, decls] of mergeRuleDeclarations(scanText)) {
    const snippet = pulsingDotFor(selector, decls, context);
    if (snippet) findings.push({ id: 'pulsing-dot', index: Math.max(0, cssText.indexOf(selector)), snippet });
  }
  return findings.concat(tailwindPulsingDots(markup, context.ranges));
}
