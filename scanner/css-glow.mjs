// Glow, halo and grid-background scanners over raw CSS text.
// Ported from Impeccable's detector (Apache-2.0).
import { colorToHex, hasChroma, parseAnyColor, splitTopLevelCommas } from './color.mjs';
import {
  COMMA_OUTSIDE_PARENS, balancedEnd, collectCustomProps, extractShadowLengths, findShadowColor,
  resolveVarRefs, textHasDarkRootBackground,
} from './css-util.mjs';

function glowForLayer(layer, prop, darkPage) {
  const info = findShadowColor(layer);
  if (!info || !info.color || !hasChroma(info.color, 30)) return null;
  const lengths = extractShadowLengths(layer, info.start, info.end);
  if (lengths.length < 3 || lengths[2] <= 4) return null;
  const zeroOffset = lengths[0] === 0 && lengths[1] === 0;
  if (!zeroOffset && !darkPage) return null;
  const hex = colorToHex(info.color);
  return zeroOffset ? `Zero-offset ${prop} glow (${hex})` : `Colored ${prop} glow (${hex}) on dark page`;
}

export function scanGlow(content) {
  const props = collectCustomProps(content);
  const darkPage = textHasDarkRootBackground(content, props);
  const hits = [];
  for (const decl of content.matchAll(/\b(box-shadow|text-shadow)\s*:\s*([^;{}]+)/gi)) {
    const value = resolveVarRefs(decl[2].trim(), props);
    const snippets = value.split(COMMA_OUTSIDE_PARENS).map((layer) => glowForLayer(layer, decl[1].toLowerCase(), darkPage));
    const snippet = snippets.find(Boolean);
    if (snippet) hits.push({ id: 'dark-glow', index: decl.index, snippet });
  }
  return hits;
}

function countHairlines(block) {
  const hairline = /\b\d{1,3}px\s*,\s*transparent\s+\d{1,3}px/gi;
  const inverted = /transparent\s+calc\(100%\s*-\s*\d{1,3}px\)/gi;
  let count = 0;
  let joined = '';
  for (const decl of block.matchAll(/\bbackground(?:-image)?\s*:\s*([^;{}"']*)/gi)) {
    count += (decl[1].match(hairline) || []).length + (decl[1].match(inverted) || []).length;
    joined += `${decl[1]};`;
  }
  return { count, joined };
}

export function scanGridBackground(content) {
  const sizeDecl = /background-size\s*:[^;{}"']*\b\d{1,3}px\b/i;
  const shorthandCell = /\/\s*\d{1,3}px\b/;
  for (const blockMatch of content.matchAll(/\{([^{}]*)\}|style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/gi)) {
    const block = blockMatch[1] || blockMatch[2] || blockMatch[3] || '';
    const { count, joined } = countHairlines(block);
    if (count >= 2 && (sizeDecl.test(block) || shorthandCell.test(joined))) {
      return [{ id: 'codex-grid-background', index: blockMatch.index, snippet: 'two-axis grid-line gradient background' }];
    }
  }
  return [];
}

const COLOR_STOP = /(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix)\([^)]*(?:\([^)]*\))?[^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/i;

function hasSmallPixelStop(stops) {
  return stops.some((stop) => {
    const pixels = stop.match(/(-?[\d.]+)px\b/);
    return pixels && Math.abs(parseFloat(pixels[1])) <= 24;
  });
}

function haloForArgs(args) {
  const stops = args.filter((arg) => COLOR_STOP.test(arg));
  if (stops.length < 2 || hasSmallPixelStop(stops)) return null;
  const first = stops[0].match(COLOR_STOP);
  const last = stops[stops.length - 1].match(COLOR_STOP);
  const lastColor = /^transparent$/i.test(last[0]) ? { a: 0 } : parseAnyColor(last[0]);
  if (!lastColor || (lastColor.a ?? 1) > 0.05) return null;
  const firstColor = /^transparent$/i.test(first[0]) ? null : parseAnyColor(first[0]);
  const visible = firstColor && (firstColor.a ?? 1) >= 0.7;
  if (!visible || !hasChroma(firstColor, 24)) return null;
  return `radial-gradient halo (${colorToHex(firstColor)} -> transparent) on dark page`;
}

function haloSnippets(value) {
  const snippets = [];
  for (const gradient of value.matchAll(/(repeating-)?radial-gradient\(/gi)) {
    if (gradient[1]) continue;
    const open = value.indexOf('(', gradient.index);
    const end = balancedEnd(value, open);
    if (end < 0) break;
    const args = splitTopLevelCommas(value.slice(open + 1, end));
    const snippet = args.length >= 2 ? haloForArgs(args) : null;
    if (snippet) snippets.push(snippet);
  }
  return snippets;
}

export function scanRadialHalo(content) {
  const props = collectCustomProps(content);
  if (!textHasDarkRootBackground(content, props)) return [];
  const hits = [];
  const seen = new Set();
  for (const decl of content.matchAll(/background(?:-image)?\s*:\s*([^;{}]+)/gi)) {
    const value = resolveVarRefs(decl[1].trim(), props);
    if (/url\s*\(/i.test(value)) continue;
    for (const snippet of haloSnippets(value)) {
      if (seen.has(snippet)) continue;
      seen.add(snippet);
      hits.push({ id: 'radial-halo', index: decl.index, snippet });
    }
  }
  return hits;
}
