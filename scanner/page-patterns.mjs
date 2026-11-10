// Page-level regex checks over scoped style/class corpora.
// Ported from Impeccable's detector (Apache-2.0).
import { scanGlow, scanGridBackground, scanRadialHalo } from './css-glow.mjs';
import { scanBuriedRaster, scanOrganicClipPath, scanShapeIllustration } from './css-imagery.mjs';
import { scanMarquee, scanPulsingDot } from './css-motion.mjs';
import { scanInsetStripe, scanPseudoStripe } from './css-stripes.mjs';

const PURPLE_HEX = '7c3aed|8b5cf6|a855f7|9333ea|7e22ce|6d28d9';
const PURPLE_TEXT = new RegExp(`(?:(?:^|;)\\s*color\\s*:\\s*(?:.*?)(?:#(?:${PURPLE_HEX}))|gradient.*?#(?:7c3aed|8b5cf6|a855f7|764ba2|667eea))`, 'gi');

function scanPurplePalette(styleText) {
  if (!/#(?:7c3aed|8b5cf6|a855f7|9333ea|7e22ce|6d28d9|6366f1|764ba2|667eea)\b/i.test(styleText)) return [];
  const hit = PURPLE_TEXT.exec(styleText);
  PURPLE_TEXT.lastIndex = 0;
  return hit ? [{ id: 'ai-color-palette', index: hit.index, snippet: 'Purple/violet accent colors detected' }] : [];
}

function scanGradientText(styleText, classText) {
  for (const clip of styleText.matchAll(/(?:-webkit-)?background-clip\s*:\s*text/gi)) {
    const context = styleText.substring(Math.max(0, clip.index - 200), clip.index + clip[0].length + 200);
    if (/gradient/i.test(context)) return [{ id: 'gradient-text', index: clip.index, snippet: 'background-clip: text + gradient' }];
  }
  if (/\bbg-clip-text\b/.test(classText) && /\bbg-gradient-to-/.test(classText)) {
    return [{ id: 'gradient-text', index: classText.search(/\bbg-clip-text\b/), snippet: 'bg-clip-text + bg-gradient (Tailwind)' }];
  }
  return [];
}

function scanRepeatingStripes(styleText) {
  const hit = /repeating-(?:linear|radial|conic)-gradient\s*\(/i.exec(styleText);
  return hit ? [{ id: 'repeating-stripes-gradient', index: hit.index, snippet: 'repeating-gradient decorative stripes' }] : [];
}

function scanTheaterPhrase(html) {
  const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const hit = /\b(\w+)\s+theater\b/i.exec(body);
  if (!hit) return [];
  return [{ id: 'theater-slop-phrase', index: Math.max(0, html.search(new RegExp(`${hit[1]}\\s+theater`, 'i'))), snippet: `"${hit[0].trim()}"` }];
}

function scanImageHover(styleText, html) {
  const findings = [];
  const cssHover = /\bimg\b[^,{}]*:hover\b[^{}]*\{[^}]*\btransform\s*:\s*(?:scale|rotate|translate|matrix|skew)/i.exec(styleText);
  if (cssHover) findings.push({ id: 'image-hover-transform', index: cssHover.index, snippet: 'img:hover { transform } rule' });
  for (const tag of html.matchAll(/<img\b[^>]*\bclass\s*=\s*"([^"]*)"/gi)) {
    if (/\bhover:(?:scale|rotate|translate|skew)-/.test(tag[1])) {
      findings.push({ id: 'image-hover-transform', index: tag.index, snippet: 'Tailwind hover transform on <img>' });
    }
  }
  return findings;
}

function firstOf(hits) {
  return hits.length ? [hits[0]] : [];
}

// Style-driven checks that every file family shares. `styleText` and `classText` keep the
// original byte offsets of the file (everything else blanked) so indexes map to lines.
export function scanStylePatterns(styleText, classText, html) {
  return [
    ...scanPurplePalette(styleText),
    ...scanGradientText(styleText, classText),
    ...scanPseudoStripe(styleText),
    ...scanInsetStripe(styleText),
    ...scanPulsingDot(styleText, html),
    ...scanShapeIllustration(html),
    ...scanOrganicClipPath(styleText),
    ...scanBuriedRaster(styleText),
    ...scanMarquee(styleText, html),
    ...firstOf(scanGlow(styleText)),
    ...firstOf(scanRadialHalo(styleText)),
    ...scanRepeatingStripes(styleText),
    ...scanGridBackground(styleText),
    ...scanTheaterPhrase(html),
    ...scanImageHover(styleText, html),
  ];
}
