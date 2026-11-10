// Color parsing and measurement. Ported from Impeccable's detector (Apache-2.0).

export const CSS_NAMED_COLORS = {
  black: [0, 0, 0], white: [255, 255, 255], gray: [128, 128, 128], grey: [128, 128, 128],
  silver: [192, 192, 192], dimgray: [105, 105, 105], darkgray: [169, 169, 169],
  lightgray: [211, 211, 211], gainsboro: [220, 220, 220], whitesmoke: [245, 245, 245],
  red: [255, 0, 0], crimson: [220, 20, 60], tomato: [255, 99, 71], coral: [255, 127, 80],
  salmon: [250, 128, 114], orange: [255, 165, 0], gold: [255, 215, 0], yellow: [255, 255, 0],
  olive: [128, 128, 0], lime: [0, 255, 0], green: [0, 128, 0], teal: [0, 128, 128],
  turquoise: [64, 224, 208], cyan: [0, 255, 255], aqua: [0, 255, 255],
  skyblue: [135, 206, 235], dodgerblue: [30, 144, 255], blue: [0, 0, 255], navy: [0, 0, 128],
  indigo: [75, 0, 130], rebeccapurple: [102, 51, 153], purple: [128, 0, 128],
  violet: [238, 130, 238], orchid: [218, 112, 214], magenta: [255, 0, 255],
  fuchsia: [255, 0, 255], hotpink: [255, 105, 180], pink: [255, 192, 203], maroon: [128, 0, 0],
};

const NEUTRAL_KEYWORDS = new Set([
  'transparent', 'currentcolor', 'black', 'white', 'gray', 'grey', 'silver', 'dimgray',
  'dimgrey', 'darkgray', 'darkgrey', 'lightgray', 'lightgrey', 'gainsboro', 'whitesmoke',
]);

const COLOR_FUNCTIONS = new Set([
  'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'oklch', 'oklab', 'lch', 'lab', 'color', 'color-mix',
]);

function clamp01(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function encodeChannel(value) {
  const clamped = clamp01(value);
  const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

function decodeChannel(value) {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(Number.isFinite(value) ? value : 0);
  return sign * (abs <= 0.04045 ? abs / 12.92 : Math.pow((abs + 0.055) / 1.055, 2.4));
}

function linearToColor(red, green, blue, alpha = 1) {
  return { r: encodeChannel(red), g: encodeChannel(green), b: encodeChannel(blue), a: alpha };
}

function oklabToRgb(light, axisA, axisB) {
  const lms1 = light + 0.3963377774 * axisA + 0.2158037573 * axisB;
  const lms2 = light - 0.1055613458 * axisA - 0.0638541728 * axisB;
  const lms3 = light - 0.0894841775 * axisA - 1.291485548 * axisB;
  const cube1 = lms1 ** 3;
  const cube2 = lms2 ** 3;
  const cube3 = lms3 ** 3;
  return linearToColor(
    4.0767416621 * cube1 - 3.3077115913 * cube2 + 0.2309699292 * cube3,
    -1.2684380046 * cube1 + 2.6097574011 * cube2 - 0.3413193965 * cube3,
    -0.0041960863 * cube1 - 0.7034186147 * cube2 + 1.707614701 * cube3,
  );
}

function polarToRgb(convert, light, chroma, hue) {
  const radians = (hue * Math.PI) / 180;
  return convert(light, chroma * Math.cos(radians), chroma * Math.sin(radians));
}

function labToRgb(light, axisA, axisB) {
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;
  const baseY = (light + 16) / 116;
  const baseX = baseY + axisA / 500;
  const baseZ = baseY - axisB / 200;
  const invert = (value) => (value ** 3 > epsilon ? value ** 3 : (116 * value - 16) / kappa);
  const luminance = light > kappa * epsilon ? ((light + 16) / 116) ** 3 : light / kappa;
  const whiteX = 0.3457 / 0.3585;
  const whiteZ = (1 - 0.3457 - 0.3585) / 0.3585;
  const xyzX = invert(baseX) * whiteX;
  const xyzZ = invert(baseZ) * whiteZ;
  return linearToColor(
    3.1341359569958707 * xyzX - 1.6173863321612538 * luminance - 0.4906619460083532 * xyzZ,
    -0.978795502912089 * xyzX + 1.916254567259524 * luminance + 0.0334427311613195 * xyzZ,
    0.0719553798841168 * xyzX - 0.2289768264158322 * luminance + 1.405386058324125 * xyzZ,
  );
}

function hslToRgb(hueDeg, sat, light) {
  const hue = ((hueDeg % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const mid = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = light - chroma / 2;
  const sectors = [[chroma, mid, 0], [mid, chroma, 0], [0, chroma, mid], [0, mid, chroma], [mid, 0, chroma], [chroma, 0, mid]];
  const [red, green, blue] = sectors[Math.min(5, Math.floor(hue / 60))];
  const to255 = (value) => Math.round((value + offset) * 255);
  return { r: to255(red), g: to255(green), b: to255(blue), a: 1 };
}

function hwbToRgb(hueDeg, white, black) {
  if (white + black >= 1) {
    const gray = Math.round((white / (white + black)) * 255);
    return { r: gray, g: gray, b: gray, a: 1 };
  }
  const base = hslToRgb(hueDeg, 1, 0.5);
  const mix = (channel) => Math.round(((channel / 255) * (1 - white - black) + white) * 255);
  return { r: mix(base.r), g: mix(base.g), b: mix(base.b), a: 1 };
}

function colorSpaceToRgb(space, chan1, chan2, chan3) {
  if (space === 'srgb') {
    return { r: Math.round(clamp01(chan1) * 255), g: Math.round(clamp01(chan2) * 255), b: Math.round(clamp01(chan3) * 255), a: 1 };
  }
  if (space === 'srgb-linear') return linearToColor(chan1, chan2, chan3);
  if (space !== 'display-p3') return null;
  const [red, green, blue] = [chan1, chan2, chan3].map(decodeChannel);
  return linearToColor(
    1.2249401762805587 * red - 0.2249404646817506 * green,
    -0.0420569547096138 * red + 1.0420571661298634 * green,
    -0.0196375587040044 * red - 0.0786360772174755 * green + 1.09827363592148 * blue,
  );
}

function component(token, scale = 1) {
  if (token == null) return null;
  const text = String(token).trim();
  if (/^none$/i.test(text)) return 0;
  const num = parseFloat(text);
  if (!Number.isFinite(num)) return null;
  return text.endsWith('%') ? (num / 100) * scale : num;
}

function alphaToken(token) {
  if (token == null || /^none$/i.test(String(token).trim())) return 1;
  const text = String(token).trim();
  const num = parseFloat(text);
  if (!Number.isFinite(num)) return 1;
  return text.endsWith('%') ? num / 100 : num;
}

function withAlpha(color, rawAlpha, isPercent) {
  if (rawAlpha === undefined) return color;
  const alpha = parseFloat(rawAlpha);
  color.a = isPercent === '%' ? alpha / 100 : alpha;
  return color;
}

function parseRgbFunction(text) {
  const match = text.match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)(?:\s*[,/]\s*([\d.]+)(%)?)?\s*\)/);
  if (!match) return null;
  const color = { r: Math.round(+match[1]), g: Math.round(+match[2]), b: Math.round(+match[3]), a: 1 };
  return withAlpha(color, match[4], match[5]);
}

function parseHex(text) {
  const match = text.match(/^#([0-9a-f]{3,8})$/i);
  if (!match) return null;
  const digits = match[1];
  if (![3, 4, 6, 8].includes(digits.length)) return null;
  const short = digits.length <= 4;
  const read = (idx) => parseInt(short ? digits[idx] + digits[idx] : digits.slice(idx * 2, idx * 2 + 2), 16);
  const hasAlpha = digits.length === 4 || digits.length === 8;
  return { r: read(0), g: read(1), b: read(2), a: hasAlpha ? read(3) / 255 : 1 };
}

function parseOklch(text) {
  const match = text.match(/oklch\(\s*([\d.]+)(%?)\s*[\s,]*\s*([\d.]+)\s*[\s,]+\s*([-\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+)(%)?)?\s*\)/i);
  if (!match) return null;
  const light = match[2] === '%' ? parseFloat(match[1]) / 100 : parseFloat(match[1]);
  return withAlpha(polarToRgb(oklabToRgb, light, parseFloat(match[3]), parseFloat(match[4])), match[5], match[6]);
}

function parseOklab(text) {
  const match = text.match(/oklab\(\s*([\d.]+)(%?)\s+(-?[\d.]+)(%?)\s+(-?[\d.]+)(%?)(?:\s*\/\s*([\d.]+)(%)?)?\s*\)/i);
  if (!match) return null;
  const light = match[2] === '%' ? parseFloat(match[1]) / 100 : parseFloat(match[1]);
  const axisA = match[4] === '%' ? parseFloat(match[3]) * 0.004 : parseFloat(match[3]);
  const axisB = match[6] === '%' ? parseFloat(match[5]) * 0.004 : parseFloat(match[5]);
  return withAlpha(oklabToRgb(light, axisA, axisB), match[7], match[8]);
}

function parseLch(text) {
  const match = text.match(/^lch\(\s*([\d.]+%?|none)\s+([\d.]+%?|none)\s+(-?[\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?|none))?\s*\)$/i);
  if (!match) return null;
  const light = component(match[1], 100);
  const chroma = component(match[2], 150);
  const hue = parseFloat(match[3]);
  if (light == null || chroma == null || !Number.isFinite(hue)) return null;
  const color = polarToRgb(labToRgb, light, chroma, hue);
  color.a = alphaToken(match[4]);
  return color;
}

function parseLab(text) {
  const match = text.match(/^lab\(\s*([\d.]+%?|none)\s+(-?[\d.]+%?|none)\s+(-?[\d.]+%?|none)(?:\s*\/\s*([\d.]+%?|none))?\s*\)$/i);
  if (!match) return null;
  const parts = [component(match[1], 100), component(match[2], 125), component(match[3], 125)];
  if (parts.includes(null)) return null;
  const color = labToRgb(...parts);
  color.a = alphaToken(match[4]);
  return color;
}

function parseColorFunction(text) {
  const match = text.match(/^color\(\s*([a-z0-9-]+)\s+(-?[\d.eE+-]+%?|none)\s+(-?[\d.eE+-]+%?|none)\s+(-?[\d.eE+-]+%?|none)(?:\s*\/\s*([\d.]+%?|none))?\s*\)$/i);
  if (!match) return null;
  const parts = [component(match[2]), component(match[3]), component(match[4])];
  if (parts.includes(null)) return null;
  const color = colorSpaceToRgb(match[1].toLowerCase(), ...parts);
  if (!color) return null;
  color.a = alphaToken(match[5]);
  return color;
}

function parseHsl(text) {
  const match = text.match(/hsla?\(\s*(-?[\d.]+)(?:deg)?\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%(?:\s*[,/]\s*([\d.]+)(%)?)?\s*\)/i);
  if (!match) return null;
  return withAlpha(hslToRgb(parseFloat(match[1]), parseFloat(match[2]) / 100, parseFloat(match[3]) / 100), match[4], match[5]);
}

function parseHwb(text) {
  const match = text.match(/hwb\(\s*(-?[\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+)(%)?)?\s*\)/i);
  if (!match) return null;
  return withAlpha(hwbToRgb(parseFloat(match[1]), parseFloat(match[2]) / 100, parseFloat(match[3]) / 100), match[4], match[5]);
}

function parseNamed(text) {
  const named = CSS_NAMED_COLORS[text.toLowerCase()];
  return named ? { r: named[0], g: named[1], b: named[2], a: 1 } : null;
}

const COLOR_PARSERS = [
  parseRgbFunction, parseHex, parseOklch, parseOklab, parseLch, parseLab,
  parseColorFunction, parseHsl, parseHwb, parseNamed,
];

export function splitTopLevelCommas(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let idx = 0; idx < text.length; idx++) {
    const chr = text[idx];
    if (chr === '(') depth++;
    else if (chr === ')') depth = Math.max(0, depth - 1);
    else if (chr === ',' && depth === 0) {
      parts.push(text.slice(start, idx).trim());
      start = idx + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

export function balancedEnd(text, openIdx) {
  let depth = 0;
  for (let idx = openIdx; idx < text.length; idx++) {
    if (text[idx] === '(') depth++;
    else if (text[idx] === ')' && --depth === 0) return idx;
  }
  return -1;
}

function parseMixComponent(part) {
  const trail = part.match(/\s+([\d.]+)%$/);
  const lead = part.match(/^([\d.]+)%\s+/);
  let percent = null;
  let colorText = part;
  if (trail) {
    percent = parseFloat(trail[1]);
    colorText = part.slice(0, trail.index).trim();
  } else if (lead) {
    percent = parseFloat(lead[1]);
    colorText = part.slice(lead[0].length).trim();
  }
  const color = /^transparent$/i.test(colorText) ? { r: 0, g: 0, b: 0, a: 0 } : parseAnyColor(colorText);
  return color ? { color, percent } : null;
}

function resolveMixPercents(first, second) {
  if (first == null && second == null) return [50, 50];
  if (first == null) return [100 - second, second];
  if (second == null) return [first, 100 - first];
  return [first, second];
}

function parseColorMix(text) {
  const open = text.indexOf('(');
  const end = balancedEnd(text, open);
  if (end < 0) return null;
  const args = splitTopLevelCommas(text.slice(open + 1, end));
  if (args.length !== 3 || !/^in\s/i.test(args[0])) return null;
  const first = parseMixComponent(args[1]);
  const second = parseMixComponent(args[2]);
  if (!first || !second) return null;
  const [pct1, pct2] = resolveMixPercents(first.percent, second.percent);
  const sum = pct1 + pct2;
  if (sum <= 0) return null;
  const weight1 = pct1 / sum;
  const weight2 = pct2 / sum;
  const alpha1 = first.color.a ?? 1;
  const alpha2 = second.color.a ?? 1;
  const alpha = (alpha1 * weight1 + alpha2 * weight2) * (sum < 100 ? sum / 100 : 1);
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (key) => Math.round((first.color[key] * alpha1 * weight1 + second.color[key] * alpha2 * weight2) / (alpha1 * weight1 + alpha2 * weight2));
  return { r: mix('r'), g: mix('g'), b: mix('b'), a: Math.min(1, alpha) };
}

export function parseAnyColor(input) {
  if (!input || typeof input !== 'string') return null;
  const text = input.trim();
  if (text === 'transparent' || text === 'currentcolor' || text === 'inherit') return null;
  if (/^color-mix\(/i.test(text)) return parseColorMix(text);
  for (const parser of COLOR_PARSERS) {
    const color = parser(text);
    if (color) return color;
  }
  return null;
}

export function relativeLuminance({ r: red, g: green, b: blue }) {
  const [rLin, gLin, bLin] = [red / 255, green / 255, blue / 255].map((chan) => (
    chan <= 0.03928 ? chan / 12.92 : ((chan + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

export function contrastRatio(colorA, colorB) {
  const lumA = relativeLuminance(colorA);
  const lumB = relativeLuminance(colorB);
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
}

export function chromaSpread(color) {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

export function hasChroma(color, threshold = 30) {
  return Boolean(color) && chromaSpread(color) >= threshold;
}

export function getHue(color) {
  if (!color) return 0;
  const [red, green, blue] = [color.r / 255, color.g / 255, color.b / 255];
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  if (delta === 0) return 0;
  let sector;
  if (max === red) sector = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) sector = (blue - red) / delta + 2;
  else sector = (red - green) / delta + 4;
  return Math.round((sector / 6) * 360);
}

export function colorToHex(color) {
  if (!color) return '?';
  return '#' + [color.r, color.g, color.b].map((chan) => chan.toString(16).padStart(2, '0')).join('');
}

export function compositeColorOver(top, base) {
  const alpha = top.a ?? 1;
  const blend = (key) => Math.round(top[key] * alpha + base[key] * (1 - alpha));
  return { r: blend('r'), g: blend('g'), b: blend('b'), a: 1 };
}

// Color-function tokens inside a longer value, balanced-paren aware.
export function extractColorTokens(value) {
  const text = String(value || '');
  const tokens = [];
  const regex = /([a-z][a-z-]*)\(/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!COLOR_FUNCTIONS.has(match[1].toLowerCase())) continue;
    const end = balancedEnd(text, match.index + match[0].length - 1);
    if (end < 0) break;
    tokens.push(text.slice(match.index, end + 1));
    regex.lastIndex = end + 1;
  }
  return tokens;
}

export function parseGradientColors(image) {
  if (!image || !image.includes('gradient')) return [];
  const colors = extractColorTokens(image).map(parseAnyColor).filter(Boolean);
  const stripped = extractColorTokens(image).reduce((text, token) => text.replace(token, ' '), image);
  for (const match of stripped.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    colors.push(parseHex(match[0]));
  }
  return colors;
}

// Neutral test for colors as authored in CSS source. Unknown spellings stay chromatic.
export function isNeutralAuthoredColor(rawColor) {
  const text = String(rawColor || '').trim().toLowerCase();
  if (!text) return false;
  if (NEUTRAL_KEYWORDS.has(text)) return true;
  const parsed = parseAnyColor(text);
  return parsed ? chromaSpread(parsed) < 30 : false;
}

export function parseCssColorToken(text) {
  const token = String(text || '').match(/(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\([^)]*\)|#[0-9a-f]{3,8}\b|\b[a-z]+\b/i);
  return token ? parseAnyColor(token[0]) : null;
}
