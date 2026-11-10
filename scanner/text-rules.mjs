// Copy and rhythm analyzers over a whole page. Ported from Impeccable's detector (Apache-2.0).

export const EM_DASH_FLOOR = 8;
export const EM_DASH_CHARS_PER_DASH = 500;

const BUZZWORDS = [
  'streamline your', 'empower your', 'supercharge your', 'unleash your', 'unleash the power',
  'leverage the power', 'built for the modern', 'trusted by leading', 'trusted by the world',
  'best-in-class', 'industry-leading', 'world-class', 'enterprise-grade', 'next-generation',
  'cutting-edge', 'transform your business', 'revolutionize', 'game-changer', 'game changing',
  'mission-critical', 'best of breed', 'future-proof', 'future proof', 'seamless experience',
  'seamlessly integrate', 'drive engagement', 'drive growth', 'drive results', 'harness the power',
];

export function stripHtmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isFullPage(content) {
  return /<!doctype\s|<html[\s>]|<head[\s>]/i.test(content.replace(/<!--[\s\S]*?-->/g, ''));
}

function collectSpacingValues(content) {
  const values = [];
  const push = (regex, convert, keep) => {
    for (const match of content.matchAll(regex)) {
      const value = convert(parseFloat(match[1]));
      if (keep(value)) values.push(value);
    }
  };
  const inRange = (value) => value > 0 && value < 200;
  push(/(?:padding|margin)(?:-(?:top|right|bottom|left))?\s*:\s*(\d+)px/gi, (num) => num, inRange);
  push(/(?:padding|margin)(?:-(?:top|right|bottom|left))?\s*:\s*([\d.]+)rem/gi, (num) => Math.round(num * 16), inRange);
  push(/gap\s*:\s*(\d+)px/gi, (num) => num, () => true);
  push(/\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap)-(\d+)\b/g, (num) => num * 4, () => true);
  return values;
}

export function analyzeMonotonousSpacing(content) {
  const rounded = collectSpacingValues(content).map((value) => Math.round(value / 4) * 4);
  if (rounded.length < 10) return [];
  const counts = {};
  for (const value of rounded) counts[value] = (counts[value] || 0) + 1;
  const [dominant, maxCount] = Object.entries(counts).sort((one, two) => two[1] - one[1])[0];
  const share = maxCount / rounded.length;
  const unique = new Set(rounded.filter((value) => value > 0));
  if (share <= 0.6 || unique.size > 3) return [];
  return [{ id: 'monotonous-spacing', snippet: `~${dominant}px used ${maxCount}/${rounded.length} times (${Math.round(share * 100)}%)` }];
}

export function analyzeEmDashes(content) {
  const text = stripHtmlToText(content).replace(/&mdash;|&#0*8212;|&#x0*2014;/gi, '—');
  const count = (text.match(/—|--(?=\S)/g) || []).length;
  if (count < EM_DASH_FLOOR || text.length > count * EM_DASH_CHARS_PER_DASH) return [];
  return [{ id: 'em-dash-overuse', snippet: `${count} em-dashes in body text` }];
}

export function analyzeBuzzwords(content) {
  const text = stripHtmlToText(content);
  const lower = text.toLowerCase();
  let count = 0;
  let sample = '';
  for (const phrase of BUZZWORDS) {
    let from = 0;
    for (let idx = lower.indexOf(phrase, from); idx !== -1; idx = lower.indexOf(phrase, from)) {
      count++;
      if (!sample) sample = text.slice(Math.max(0, idx - 12), idx + phrase.length + 12).trim();
      from = idx + phrase.length;
    }
  }
  if (count === 0) return [];
  return [{ id: 'marketing-buzzword', snippet: `${count} buzzword phrase${count === 1 ? '' : 's'}: "${sample}"` }];
}

export function analyzeAphorisms(content) {
  const text = stripHtmlToText(content);
  const patterns = [
    /\bNot an? [a-z][^.!?]{1,40}[.!]\s+[A-Z][^.!?]{1,60}[.!]/g,
    /\b[A-Z][^.!?]{4,80}[.!]\s+(No|Just)\s+[a-z][^.!?]{2,60}[.!]/g,
  ];
  const hits = patterns.flatMap((pattern) => [...text.matchAll(pattern)]);
  if (hits.length < 3) return [];
  return [{ id: 'aphoristic-cadence', snippet: `${hits.length} aphoristic constructions: "${hits[0][0].trim().slice(0, 80)}"` }];
}

export function analyzePage(content) {
  return [
    ...analyzeMonotonousSpacing(content), ...analyzeEmDashes(content),
    ...analyzeBuzzwords(content), ...analyzeAphorisms(content),
  ];
}
