// Text legibility rules evaluated on resolved element styles.
// Ported from Impeccable's detector (Apache-2.0).
import { closestMatching, directText, isHidden, textOf } from './element-util.mjs';
import { lengthToPx } from './style-values.mjs';

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const NON_RENDERED = new Set(['script', 'style', 'title', 'noscript', 'template', 'head', 'meta', 'link', 'base', 'param', 'source', 'track', 'datalist', 'col', 'colgroup', 'map', 'area']);
const BODY_SKIP_TAGS = new Set(['sub', 'sup', 'code', 'kbd', 'samp', 'var', 'caption', 'figcaption']);
const TINY_UI_CONTEXT = 'button, a, label, summary, pre, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], nav, footer, [aria-hidden="true"], [class*="badge" i], [class*="caption" i], [class*="chip" i], [class*="code" i], [class*="console" i], [class*="diff" i], [class*="label" i], [class*="meta" i], [class*="mock" i], [class*="pill" i], [class*="preview" i], [class*="tag" i], [class*="terminal" i], [class*="writes" i]';
const EXEMPT_CONTEXT = 'pre, code, kbd, samp, var, svg, [aria-hidden="true"], [class*="terminal" i], [class*="console" i], [class*="code" i], [class*="mock" i], [class*="editor" i], [class*="syntax" i], [class*="diff" i], .sr-only, .visually-hidden, [class*="sr-only" i], [class*="visually-hidden" i], [class*="screen-reader" i]';
const INTERACTIVE = 'a[href], button, summary, label, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="treeitem"], [tabindex]';
const FURNITURE = 'nav, [role="navigation"], td, th, [role="gridcell"], [role="cell"], caption, figcaption, dt, dd, footer, [class*="meta" i], [class*="label" i], [class*="badge" i], [class*="chip" i], [class*="pill" i], [class*="tag" i], [class*="kicker" i], [class*="eyebrow" i], [class*="breadcrumb" i], [class*="timestamp" i], [class*="category" i], [class*="caption" i], [class*="nav" i]';
const SMALLPRINT = 'small, footer, [class*="legal" i], [class*="copyright" i], [class*="fineprint" i], [class*="fine-print" i], [class*="smallprint" i], [class*="small-print" i], [class*="disclaimer" i], [class*="disclosure" i], [class*="footnote" i]';

export function compileTextSelectors(modules) {
  const names = { tinyUi: TINY_UI_CONTEXT, exempt: EXEMPT_CONTEXT, interactive: INTERACTIVE, furniture: FURNITURE, smallprint: SMALLPRINT };
  return Object.fromEntries(Object.entries(names).map(([key, selector]) => [key, modules.compile(selector)]));
}

function lineHeightRatio(style) {
  const raw = String(style.get('line-height') || '').trim();
  if (!raw || raw === 'normal') return null;
  if (/^\d*\.?\d+$/.test(raw)) return parseFloat(raw);
  const pixels = lengthToPx(raw, style.fontPx);
  return pixels != null && style.fontPx > 0 ? pixels / style.fontPx : null;
}

function trackingEm(style) {
  const raw = String(style.get('letter-spacing') || '').trim();
  if (!raw || raw === 'normal') return null;
  const pixels = lengthToPx(raw, style.fontPx);
  return pixels != null && style.fontPx > 0 ? pixels / style.fontPx : null;
}

function isRendered(elem, style, resolver) {
  const nonRendered = NON_RENDERED.has(elem.name) || closestMatching(elem, (cur) => cur.name === 'head');
  return !nonRendered && !isHidden(elem, resolver) && style.get('display') !== 'none';
}

function proseFindings(facts) {
  const { elem, style, hasText, textLen } = facts;
  const findings = [];
  const ratio = lineHeightRatio(style);
  if (hasText && textLen > 50 && !HEADINGS.has(elem.name) && ratio !== null && ratio > 0 && ratio < 1.3) {
    findings.push({ id: 'tight-leading', snippet: `line-height ${ratio.toFixed(2)}x (need >=1.3)` });
  }
  const hyphens = style.get('hyphens') || style.get('-webkit-hyphens') || '';
  if (hasText && style.get('text-align') === 'justify' && hyphens !== 'auto') {
    findings.push({ id: 'justified-text', snippet: 'text-align: justify without hyphens: auto' });
  }
  const upper = style.get('text-transform') === 'uppercase';
  if (hasText && textLen > 30 && upper && !HEADINGS.has(elem.name)) {
    findings.push({ id: 'all-caps-body', snippet: `text-transform: uppercase on ${textLen} chars of body text` });
  }
  return findings;
}

function trackingFindings(facts) {
  const { elem, style, hasText, textLen, modules } = facts;
  const tracking = trackingEm(style);
  const upper = style.get('text-transform') === 'uppercase';
  const findings = [];
  if (hasText && textLen > 20 && !upper && tracking !== null && tracking > 0.05) {
    findings.push({ id: 'wide-tracking', snippet: `letter-spacing: ${tracking.toFixed(2)}em on body text` });
  }
  if (hasText && textLen > 20 && tracking !== null && tracking <= -0.05) {
    findings.push({ id: 'extreme-negative-tracking', snippet: `letter-spacing: ${tracking.toFixed(2)}em - "${textOf(elem, modules.domutils).slice(0, 40)}"` });
  }
  return findings;
}

function tinyBodyFinding(facts) {
  const { elem, style, hasText, textLen, selectors } = facts;
  if (!hasText || textLen <= 20 || style.fontPx >= 12 || BODY_SKIP_TAGS.has(elem.name)) return null;
  if (closestMatching(elem, selectors.tinyUi) || style.get('text-transform') === 'uppercase') return null;
  return { id: 'tiny-text', snippet: `${style.fontPx}px body text` };
}

function undersizedUiFinding(facts) {
  const { elem, style, selectors } = facts;
  const text = directText(elem).replace(/\s+/g, ' ').trim();
  if (style.fontPx >= 11 || text.length < 2 || ['sub', 'sup', 'option'].includes(elem.name)) return null;
  if (closestMatching(elem, selectors.exempt)) return null;
  const interactive = Boolean(closestMatching(elem, selectors.interactive));
  const furniture = Boolean(closestMatching(elem, selectors.furniture));
  const floor = !interactive && closestMatching(elem, selectors.smallprint) ? 10 : 11;
  if (style.fontPx >= floor || !(interactive || furniture || text.length <= 20)) return null;
  return { id: 'undersized-ui-text', snippet: `${style.fontPx}px functional text "${text.slice(0, 40)}" (below ${floor}px floor)` };
}

function buriedRasterFinding(elem, style) {
  const opacity = parseFloat(style.get('opacity'));
  const image = String(style.get('background-image') || '');
  if (!(Number.isFinite(opacity) && opacity >= 0 && opacity < 0.15) || !(elem.name === 'img' || /url\(/i.test(image))) return null;
  return { id: 'buried-raster', snippet: `${elem.name === 'img' ? '<img>' : 'raster background'} at opacity ${opacity}` };
}

export function textRulesFor(elem, resolver, modules, selectors) {
  const style = resolver.computed(elem);
  if (!isRendered(elem, style, resolver)) return [];
  const raw = directText(elem);
  const facts = {
    elem, style, modules, selectors,
    hasText: elem.children.some((child) => child.type === 'text' && child.data.trim().length > 10),
    textLen: modules.domutils.textContent(elem).trim().length,
  };
  const found = [buriedRasterFinding(elem, style)];
  if (style.fontKnown && raw.trim()) {
    found.push(tinyBodyFinding(facts), undersizedUiFinding(facts));
    found.push(...proseFindings(facts), ...trackingFindings(facts));
  }
  return found.filter(Boolean);
}

