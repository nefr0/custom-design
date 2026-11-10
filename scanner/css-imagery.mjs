// Imagery tells: organic clip-paths, buried rasters, shape-assembled SVG scenes.
// Ported from Impeccable's detector (Apache-2.0).

const ORGANIC_POLYGON_MIN_VERTICES = 10;

function offGridCount(points) {
  let count = 0;
  for (const point of points) {
    for (const num of point.match(/-?[\d.]+/g) || []) {
      if (Math.abs(parseFloat(num) - Math.round(parseFloat(num) / 25) * 25) > 0.5) count++;
    }
  }
  return count;
}

function organicClipSnippet(kind, body) {
  if (kind === 'path') {
    const curves = (body.match(/[CSQTA]/gi) || []).length;
    return curves >= 3 ? `clip-path: path() with ${curves} curve segments` : null;
  }
  const points = body.split(',').map((point) => point.trim()).filter(Boolean);
  if (points.length < ORGANIC_POLYGON_MIN_VERTICES || offGridCount(points) < points.length) return null;
  return `clip-path: polygon() with ${points.length} vertices approximating an organic contour`;
}

export function scanOrganicClipPath(styleText) {
  const findings = [];
  for (const match of styleText.matchAll(/clip-path\s*:\s*(polygon|path)\s*\(([^)]*(?:\)[^;}]*)?)/gi)) {
    const snippet = organicClipSnippet(match[1].toLowerCase(), match[2]);
    if (snippet) findings.push({ id: 'organic-clip-path', index: match.index, snippet });
  }
  return findings;
}

function alphaOf(token) {
  if (token == null) return 1;
  const value = parseFloat(token);
  return String(token).trim().endsWith('%') ? value / 100 : value;
}

function hexAlphas(text) {
  const alphas = [];
  for (const hex of text.matchAll(/#([0-9a-f]{3,8})\b/gi)) {
    const digits = hex[1];
    if (digits.length === 4) alphas.push(parseInt(digits[3] + digits[3], 16) / 255);
    else if (digits.length === 8) alphas.push(parseInt(digits.slice(6), 16) / 255);
    else alphas.push(1);
  }
  return alphas;
}

function gradientIsOpaqueWash(gradient) {
  const functionPattern = /rgba?\(\s*[\d.]+%?\s*,?\s*[\d.]+%?\s*,?\s*[\d.]+%?\s*(?:[,/]\s*([\d.]+%?))?\s*\)|hsla?\([^)]*?(?:[,/]\s*([\d.]+%?))?\s*\)/gi;
  const alphas = [...gradient.matchAll(functionPattern)].map((match) => alphaOf(match[1] ?? match[2]));
  const stripped = gradient.replace(/rgba?\([^)]*\)|hsla?\([^)]*\)/gi, '');
  alphas.push(...hexAlphas(stripped));
  if (/\b(?:white|black|ivory|beige|linen|snow|cream)\b/i.test(stripped)) alphas.push(1);
  return alphas.length > 0 && alphas.every((alpha) => !Number.isFinite(alpha) || alpha >= 0.9);
}

function ruleTextAround(styleText, index) {
  const open = styleText.lastIndexOf('{', index);
  const close = styleText.indexOf('}', index);
  return styleText.slice(open < 0 ? 0 : open, close < 0 ? styleText.length : close);
}

function buriedRasterSnippet(styleText, decl) {
  const value = decl[1];
  if (!/url\(/i.test(value) || !/gradient\(/i.test(value)) return null;
  const rule = ruleTextAround(styleText, decl.index);
  if (/background-blend-mode\s*:\s*(?!normal)/i.test(rule) || /mix-blend-mode\s*:\s*(?!normal)/i.test(rule)) return null;
  const firstUrl = value.search(/url\(/i);
  const washes = [...value.matchAll(/(?:linear|radial|conic)-gradient\([^()]*(?:\([^()]*\)[^()]*)*\)/gi)]
    .filter((gradient) => gradient.index < firstUrl);
  if (!washes.some((wash) => gradientIsOpaqueWash(wash[0]))) return null;
  return `raster under a near-opaque gradient wash: ${value.trim().slice(0, 90)}`;
}

export function scanBuriedRaster(styleText) {
  const findings = [];
  for (const decl of styleText.matchAll(/background(?:-image)?\s*:\s*([^;}]+)/gi)) {
    const snippet = buriedRasterSnippet(styleText, decl);
    if (snippet) findings.push({ id: 'buried-raster', index: decl.index, snippet });
  }
  return findings;
}

function attributeNumber(openTag, name) {
  const match = openTag.match(new RegExp(`(?<![-\\w])${name}\\s*=\\s*["']\\s*([\\d.]+)(?:px)?\\s*["']`, 'i'));
  return match ? parseFloat(match[1]) : null;
}

function svgDimensions(openTag) {
  const box = openTag.match(/\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i);
  return {
    width: attributeNumber(openTag, 'width') ?? (box ? parseFloat(box[1]) : null),
    height: attributeNumber(openTag, 'height') ?? (box ? parseFloat(box[2]) : null),
  };
}

function distinctFills(block) {
  const fills = new Set();
  for (const fill of block.matchAll(/\bfill\s*[:=]\s*["']?\s*([^"';>}\s]+)/gi)) {
    const paint = fill[1].trim().toLowerCase();
    if (paint && !['none', 'transparent', 'currentcolor', 'inherit'].includes(paint)) fills.add(paint);
  }
  return fills;
}

function svgSceneSnippet(block) {
  if ((block.match(/<(?:text|tspan)\b/gi) || []).length > 2 || /<pattern\b/i.test(block)) return null;
  const primitives = (block.match(/<(?:rect|circle|ellipse|polygon)\b/gi) || []).length;
  if (primitives < 8) return null;
  const { width, height } = svgDimensions((block.match(/^<svg\b[^>]*>/i) || [''])[0]);
  if (width == null || height == null || width < 200 || height < 200) return null;
  const fills = distinctFills(block);
  if (fills.size < 3) return null;
  return `inline <svg> scene: ${primitives} primitive shapes, ~${Math.round(width)}x${Math.round(height)}px, ${fills.size} fill colors`;
}

export function scanShapeIllustration(html) {
  const findings = [];
  for (const svg of html.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)) {
    const snippet = svgSceneSnippet(svg[0]);
    if (snippet) findings.push({ id: 'shape-assembled-illustration', index: svg.index, snippet });
  }
  return findings;
}
