// Page-side rules for the optional browser tier. Loaded as text and injected into a live page by
// scanner/browser.mjs, so it must stay self-contained plain JavaScript (no imports, no Node APIs).
// Rule logic ported from Impeccable's browser detector (Apache-2.0).
(function installDesignScan() {
  const TEXT_TAGS = new Set(['P', 'LI', 'TD', 'TH', 'DD', 'BLOCKQUOTE', 'FIGCAPTION']);
  const HIDDEN_EXCLUDED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD', 'META', 'LINK', 'OPTION', 'OPTGROUP', 'SELECT', 'DATALIST', 'DIALOG']);
  const colorCanvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

  function describeElement(elem) {
    const idPart = elem.id ? `#${elem.id}` : '';
    const className = typeof elem.className === 'string' ? elem.className.trim().split(/\s+/)[0] : '';
    return `${elem.tagName.toLowerCase()}${idPart}${className ? `.${className}` : ''}`;
  }

  function directTextLength(elem) {
    let length = 0;
    for (const node of elem.childNodes) {
      if (node.nodeType === 3) length += node.textContent.replace(/\s+/g, ' ').trim().length;
    }
    return length;
  }

  function isRendered(elem, style, rect) {
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  // Normalizes any CSS color the browser understands (rgb, oklch, color-mix...) to rgba via a canvas pixel.
  function toRgba(cssColor) {
    colorCanvas.clearRect(0, 0, 1, 1);
    colorCanvas.fillStyle = '#000';
    colorCanvas.fillStyle = cssColor;
    colorCanvas.fillRect(0, 0, 1, 1);
    const data = colorCanvas.getImageData(0, 0, 1, 1).data;
    return { red: data[0], green: data[1], blue: data[2], alpha: data[3] / 255 };
  }

  function luminance(color) {
    const channels = [color.red, color.green, color.blue].map((value) => {
      const unit = value / 255;
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrast(colorA, colorB) {
    const lumA = luminance(colorA);
    const lumB = luminance(colorB);
    return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
  }

  function overColor(top, base) {
    const mix = (key) => Math.round(top[key] * top.alpha + base[key] * (1 - top.alpha));
    return { red: mix('red'), green: mix('green'), blue: mix('blue'), alpha: 1 };
  }

  // Walks up the ancestors compositing solid backgrounds; null when an image or gradient is in the way.
  function renderedBackground(elem) {
    const layers = [];
    for (let cur = elem; cur; cur = cur.parentElement) {
      const style = getComputedStyle(cur);
      if (style.backgroundImage && style.backgroundImage !== 'none') return null;
      const color = toRgba(style.backgroundColor);
      if (color.alpha > 0) layers.push(color);
      if (color.alpha >= 0.99) break;
    }
    let base = { red: 255, green: 255, blue: 255, alpha: 1 };
    for (let idx = layers.length - 1; idx >= 0; idx--) base = overColor(layers[idx], base);
    return base;
  }

  function contrastFinding(elem, style, rect) {
    if (directTextLength(elem) < 2 || rect.width < 4) return null;
    const background = renderedBackground(elem);
    if (!background) return null;
    const text = toRgba(style.color);
    const flat = text.alpha < 1 ? overColor(text, background) : text;
    const size = parseFloat(style.fontSize);
    const bold = (parseInt(style.fontWeight, 10) || 400) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const ratio = contrast(flat, background);
    const need = large ? 3 : 4.5;
    return ratio < need ? { id: 'low-contrast', detail: `${ratio.toFixed(1)}:1 (need ${need}:1) rendered text on ${describeElement(elem)}` } : null;
  }

  function lineLengthFinding(elem, style, rect) {
    const textLength = elem.textContent.trim().length;
    if (!TEXT_TAGS.has(elem.tagName) || directTextLength(elem) <= 10 || textLength <= 80) return null;
    const charsPerLine = rect.width / (parseFloat(style.fontSize) * 0.5);
    return charsPerLine > 85 ? { id: 'line-length', detail: `~${Math.round(charsPerLine)} chars/line (aim for <80) in ${describeElement(elem)}` } : null;
  }

  function hasBoundary(elem, style) {
    const own = toRgba(style.backgroundColor);
    if (own.alpha <= 0.05) return false;
    for (let cur = elem.parentElement; cur; cur = cur.parentElement) {
      const parent = toRgba(getComputedStyle(cur).backgroundColor);
      if (parent.alpha > 0.05) return Math.abs(parent.red - own.red) + Math.abs(parent.green - own.green) + Math.abs(parent.blue - own.blue) > 9;
    }
    return true;
  }

  function borderWidths(style) {
    return ['Top', 'Right', 'Bottom', 'Left'].map((side) => parseFloat(style[`border${side}Width`]) || 0);
  }

  function paddingFinding(elem, style, rect) {
    const textLength = elem.textContent.trim().length;
    const inlineCode = elem.tagName === 'CODE' && !elem.closest('pre');
    if (inlineCode || directTextLength(elem) <= 10 || textLength <= 20 || rect.width <= 100 || rect.height <= 30) return null;
    const widths = borderWidths(style);
    const boundary = hasBoundary(elem, style);
    if (widths.filter((width) => width > 0).length < 2 && !boundary) return null;
    const size = parseFloat(style.fontSize) || 16;
    const pads = ['Top', 'Right', 'Bottom', 'Left'].map((side, idx) => (boundary || widths[idx] > 0 ? parseFloat(style[`padding${side}`]) || 0 : Infinity));
    const vertical = Math.min(pads[0], pads[2]);
    const horizontal = Math.min(pads[1], pads[3]);
    if (vertical < Math.max(4, size * 0.3)) return { id: 'cramped-padding', detail: `${vertical}px vertical padding on ${describeElement(elem)} (${size}px text)` };
    if (horizontal < Math.max(8, size * 0.5)) return { id: 'cramped-padding', detail: `${horizontal}px horizontal padding on ${describeElement(elem)} (${size}px text)` };
    return null;
  }

  function viewportEdgeFinding(elem, style, rect) {
    const width = window.innerWidth;
    if (!['P', 'LI'].includes(elem.tagName) || directTextLength(elem) <= 40 || rect.width / width <= 0.5) return null;
    if (elem.closest('nav, header') || ['fixed', 'absolute'].includes(style.position) || toRgba(style.backgroundColor).alpha > 0.05) return null;
    if (rect.left >= 16 && rect.right <= width - 16) return null;
    return { id: 'body-text-viewport-edge', detail: `${describeElement(elem)} body text bleeds to the viewport edge (left ${Math.round(rect.left)}px, right ${Math.round(width - rect.right)}px)` };
  }

  function brokenImageFinding(elem) {
    if (elem.tagName !== 'IMG' || !elem.complete || elem.naturalWidth > 0) return null;
    const source = elem.getAttribute('src') || '';
    return { id: 'broken-image', detail: `<img src="${source.slice(0, 80)}"> failed to load` };
  }

  function elementFindings(elem) {
    const style = getComputedStyle(elem);
    const rect = elem.getBoundingClientRect();
    const image = brokenImageFinding(elem);
    if (!isRendered(elem, style, rect)) return image ? [image] : [];
    return [image, contrastFinding(elem, style, rect), lineLengthFinding(elem, style, rect), paddingFinding(elem, style, rect), viewportEdgeFinding(elem, style, rect)].filter(Boolean);
  }

  // ---- layout rules over scrollers and columns ----

  function isScroller(style) {
    return /(auto|scroll)/.test(style.overflowX || '') || /(auto|scroll)/.test(style.overflow || '');
  }

  function isCardLike(card, style) {
    const rect = card.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 40) return null;
    const fill = toRgba(style.backgroundColor);
    return fill.alpha > 0.5 || borderWidths(style).filter((width) => width > 0).length >= 2 ? rect : null;
  }

  function flushEdge(rect, contentLeft, contentRight) {
    const leftGutter = rect.left - contentLeft;
    const rightGap = contentRight - rect.right;
    if (leftGutter >= 6 && rightGap < 8 && rightGap > -24) return { edge: 'right', gap: Math.round(rightGap) };
    if (rightGap >= 6 && leftGutter < 8 && leftGutter > -24) return { edge: 'left', gap: Math.round(leftGutter) };
    return null;
  }

  function flushCards(scroller) {
    const box = scroller.getBoundingClientRect();
    const contentLeft = box.left + scroller.clientLeft;
    const flush = [];
    for (const card of scroller.querySelectorAll('*')) {
      const cardStyle = getComputedStyle(card);
      let owner = card.parentElement;
      while (owner && owner !== scroller && !isScroller(getComputedStyle(owner))) owner = owner.parentElement;
      const rect = owner === scroller && cardStyle.display !== 'none' ? isCardLike(card, cardStyle) : null;
      const edge = rect ? flushEdge(rect, contentLeft, contentLeft + scroller.clientWidth) : null;
      if (edge) flush.push({ card, ...edge });
    }
    return flush;
  }

  function edgeFlushFindings() {
    const findings = [];
    for (const scroller of document.querySelectorAll('*')) {
      if (!isScroller(getComputedStyle(scroller)) || scroller.scrollWidth <= scroller.clientWidth + 8 || scroller.scrollLeft > 4) continue;
      const box = scroller.getBoundingClientRect();
      if (box.width < 120 || box.height < 60 || box.top + window.scrollY > 2 * window.innerHeight) continue;
      const flush = flushCards(scroller);
      if (flush.length === 0) continue;
      const worst = flush.reduce((one, two) => (two.gap < one.gap ? two : one));
      findings.push({ id: 'edge-flush-cards', detail: `${flush.length} card(s) flush against the ${worst.edge} edge of ${describeElement(scroller)} at rest (${worst.gap}px gap, e.g. ${describeElement(worst.card)})` });
    }
    return findings;
  }

  function contentExtent(child, top) {
    let bottom = top;
    for (const inner of child.querySelectorAll('*')) {
      const style = getComputedStyle(inner);
      if (['absolute', 'fixed'].includes(style.position) || style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = inner.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) bottom = Math.max(bottom, rect.bottom);
    }
    return bottom - top;
  }

  function columnsOf(container, containerRect) {
    const columns = [];
    for (const child of container.children) {
      const style = getComputedStyle(child);
      const rect = child.getBoundingClientRect();
      const share = rect.width / containerRect.width;
      if (style.display === 'none' || ['absolute', 'fixed'].includes(style.position) || share < 0.25 || share > 0.9 || rect.height < 40) continue;
      columns.push({ top: rect.top, height: contentExtent(child, rect.top) });
    }
    return columns.sort((one, two) => two.height - one.height);
  }

  function columnOverflowFindings() {
    const findings = [];
    const viewH = window.innerHeight;
    for (const container of document.querySelectorAll('body *')) {
      if (!/(^|inline-)(grid|flex)$/.test(getComputedStyle(container).display)) continue;
      const rect = container.getBoundingClientRect();
      const pageTop = rect.top + window.scrollY;
      if (rect.width < 0.5 * window.innerWidth || pageTop >= viewH * 0.9 || pageTop + rect.height <= viewH) continue;
      const columns = columnsOf(container, rect);
      if (columns.length < 2) continue;
      const tall = columns[0];
      const short = columns[columns.length - 1];
      if (Math.abs(tall.top - short.top) > 0.25 * viewH || tall.height <= viewH * 1.4 || short.height > viewH) continue;
      findings.push({ id: 'first-viewport-column-overflow', detail: `${describeElement(container)} opens the page with one column ${Math.round((tall.height / viewH) * 100)}% of the viewport tall while a sibling fits in ${Math.round((short.height / viewH) * 100)}%` });
    }
    return findings;
  }

  // ---- text that stays invisible after reveal handlers ran ----

  function visibilityState(elem, cache) {
    if (!elem || elem.nodeType !== 1 || elem === document.documentElement) return 'visible';
    if (cache.has(elem)) return cache.get(elem);
    let state = 'visible';
    const parentState = HIDDEN_EXCLUDED.has(elem.tagName) ? 'excluded' : visibilityState(elem.parentElement, cache);
    const style = getComputedStyle(elem);
    if (parentState === 'excluded' || style.display === 'none' || elem.hidden || elem.getAttribute('aria-hidden') === 'true') state = 'excluded';
    else if (parentState === 'invisible' || (parseFloat(style.opacity) || 0) <= 0.02 || /^(hidden|collapse)$/.test(style.visibility)) state = 'invisible';
    cache.set(elem, state);
    return state;
  }

  function measureHiddenText() {
    const cache = new Map();
    const result = { totalChars: 0, hiddenChars: 0, sample: '' };
    for (const elem of document.querySelectorAll('body *')) {
      const length = directTextLength(elem);
      const state = length ? visibilityState(elem, cache) : 'excluded';
      if (state === 'excluded') continue;
      result.totalChars += length;
      if (state === 'invisible') result.hiddenChars += length;
      if (state === 'invisible' && !result.sample) result.sample = elem.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
    }
    return result;
  }

  function hiddenAtRestFinding(measure) {
    if (measure.totalChars < 200 || measure.hiddenChars < 150 || measure.hiddenChars / measure.totalChars <= 0.3) return [];
    const share = Math.round((measure.hiddenChars / measure.totalChars) * 100);
    const example = measure.sample ? ` (e.g. "${measure.sample}")` : '';
    return [{ id: 'content-hidden-at-rest', detail: `${share}% of page text (${measure.hiddenChars} of ${measure.totalChars} chars) stays at opacity 0 / visibility hidden after reveal handlers ran${example}` }];
  }

  async function revealSweep() {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.7));
    const max = Math.max(document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight : 0);
    for (let top = 0; top <= max; top += step) {
      window.scrollTo({ top, left: 0, behavior: 'instant' });
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 40)));
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  // ---- pixel contrast: text the static check cannot judge (images, gradients, filters), measured on screenshots ----
  // Ported from Impeccable's screenshot contrast check. The Node side takes a screenshot with the text visible and
  // one with it hidden, then compareShots() decodes both in the page (canvas) and rates every glyph pixel.

  const PIXEL_SAFE_TAGS = new Set(['BLOCKQUOTE', 'NAV', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'PRE', 'CODE', 'SPAN', 'TH', 'TD', 'TR', 'LI', 'LABEL', 'BUTTON', 'HR', 'IMG', 'SVG']);
  const UNDERLAY_TAGS = new Set(['IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'SVG']);
  const RENDERED_FOREGROUND = new Set(['opacity stack', 'blend mode', 'filter', 'backdrop filter', 'background-clip text']);
  const MAX_PIXEL_CANDIDATES = 12;
  const TARGET_ATTR = 'data-design-scan-target';
  const HIDE_STYLE_ID = 'design-scan-hide-style';
  const GLYPH_DELTA = 10;
  const MIN_GLYPH_PIXELS = 8;
  const CORE_DELTA_SHARE = 0.5;

  function ownTextRect(elem) {
    const rects = [];
    for (const node of elem.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width >= 1 && rect.height >= 1) rects.push(rect);
    }
    if (rects.length === 0) return null;
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    return { left, top, width: Math.max(...rects.map((rect) => rect.right)) - left, height: Math.max(...rects.map((rect) => rect.bottom)) - top };
  }

  function layerReasons(style, isSurface) {
    const reasons = [];
    const image = style.backgroundImage || '';
    if (!isSurface && /url\s*\(/i.test(image)) reasons.push('image background');
    if (!isSurface && /gradient/i.test(image)) reasons.push('gradient background');
    if (parseFloat(style.opacity) < 0.99) reasons.push('opacity stack');
    if (style.mixBlendMode && style.mixBlendMode !== 'normal') reasons.push('blend mode');
    if (style.filter && style.filter !== 'none') reasons.push('filter');
    if (style.backdropFilter && style.backdropFilter !== 'none') reasons.push('backdrop filter');
    return reasons;
  }

  function ancestorReasons(elem) {
    const reasons = [];
    for (let cur = elem; cur && cur.nodeType === 1; cur = cur.parentElement) {
      const style = getComputedStyle(cur);
      reasons.push(...layerReasons(style, cur === document.body || cur === document.documentElement));
      const image = style.backgroundImage || '';
      if (toRgba(style.backgroundColor).alpha >= 0.95 && (!image || image === 'none')) break;
    }
    return reasons;
  }

  function underlayReasons(elem, rect) {
    const reasons = [];
    const inside = (xPos, yPos) => xPos >= 0 && yPos >= 0 && xPos <= window.innerWidth && yPos <= window.innerHeight;
    for (const share of [0.5, 0.25, 0.75]) {
      const xPos = rect.left + Math.min(rect.width - 1, Math.max(1, rect.width * share));
      const yPos = rect.top + rect.height / 2;
      if (!inside(xPos, yPos)) continue;
      const stack = document.elementsFromPoint(xPos, yPos);
      const selfAt = stack.findIndex((node) => node === elem || elem.contains(node) || node.contains(elem));
      const below = selfAt < 0 ? undefined : stack.slice(selfAt + 1).find((node) => UNDERLAY_TAGS.has(node.tagName.toUpperCase()));
      if (below) reasons.push(`${below.tagName.toLowerCase()} underlay`);
    }
    return reasons;
  }

  function pixelReasons(elem, style, rect) {
    const reasons = new Set(ancestorReasons(elem));
    if ((style.webkitBackgroundClip || style.backgroundClip) === 'text' && style.backgroundImage !== 'none') reasons.add('background-clip text');
    if (style.textShadow && style.textShadow !== 'none') reasons.add('text shadow');
    for (const reason of underlayReasons(elem, rect)) reasons.add(reason);
    return [...reasons];
  }

  function isPixelCandidate(elem, style, rect) {
    if (elem === document.body || elem === document.documentElement || !isRendered(elem, style, rect)) return false;
    if (directTextLength(elem) === 0 || /^[\p{Extended_Pictographic}\s\uFE0F\u200D]+$/u.test(elem.textContent.trim())) return false;
    const styledControl = ['A', 'BUTTON'].includes(elem.tagName) && toRgba(style.backgroundColor).alpha > 0.5;
    return !PIXEL_SAFE_TAGS.has(elem.tagName) || styledControl;
  }

  function clipAround(rect) {
    return {
      x: Math.max(0, Math.floor(rect.left + window.scrollX - 2)),
      y: Math.max(0, Math.floor(rect.top + window.scrollY - 2)),
      width: Math.max(1, Math.ceil(rect.width + 4)),
      height: Math.max(1, Math.ceil(rect.height + 4)),
    };
  }

  function pixelCandidate(elem, index) {
    const style = getComputedStyle(elem);
    const bounds = elem.getBoundingClientRect();
    if (!isPixelCandidate(elem, style, bounds) || contrastFinding(elem, style, bounds)) return null;
    const rect = ownTextRect(elem) || bounds;
    if (rect.width < 4 || rect.height < 4) return null;
    const reasons = pixelReasons(elem, style, rect);
    if (reasons.length === 0) return null;
    const color = toRgba(style.color);
    const size = parseFloat(style.fontSize) || 16;
    const large = size >= 24 || (size >= 18.66 && (parseInt(style.fontWeight, 10) || 400) >= 700);
    elem.setAttribute(TARGET_ATTR, String(index));
    return {
      index,
      text: elem.textContent.replace(/\s+/g, ' ').trim().slice(0, 80),
      threshold: large ? 3 : 4.5,
      reasons,
      clip: clipAround(rect),
      textColor: { red: color.red, green: color.green, blue: color.blue },
      renderedForeground: color.alpha < 0.99 || reasons.some((reason) => RENDERED_FOREGROUND.has(reason)),
      clipsText: reasons.includes('background-clip text'),
    };
  }

  function contrastCandidates() {
    const candidates = [];
    for (const elem of document.querySelectorAll('body *')) {
      if (candidates.length >= MAX_PIXEL_CANDIDATES) break;
      const candidate = pixelCandidate(elem, candidates.length);
      if (candidate) candidates.push(candidate);
    }
    return candidates;
  }

  function targetOf(index) {
    return document.querySelector(`[${TARGET_ATTR}="${index}"]`);
  }

  function ensureHideStyle() {
    if (document.getElementById(HIDE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = HIDE_STYLE_ID;
    style.textContent = `[data-design-scan-hide] { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }
[data-design-scan-hide][data-design-scan-clip] { background-image: none !important; }`;
    document.head.appendChild(style);
  }

  function hideText(index, clipsText) {
    const elem = targetOf(index);
    if (!elem) return false;
    ensureHideStyle();
    elem.setAttribute('data-design-scan-hide', '');
    if (clipsText) elem.setAttribute('data-design-scan-clip', '');
    return true;
  }

  function showText(index) {
    const elem = targetOf(index);
    if (elem) elem.removeAttribute('data-design-scan-hide');
    if (elem) elem.removeAttribute('data-design-scan-clip');
  }

  function decodeImage(base64) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('could not decode contrast screenshot'));
      image.src = `data:image/png;base64,${base64}`;
    });
  }

  function readPixels(context, image, width, height) {
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  }

  function pixelAt(data, offset) {
    return { red: data[offset], green: data[offset + 1], blue: data[offset + 2] };
  }

  // Glyph pixels are those that change when the text is hidden. Anti-aliased edge pixels change only a little, so
  // only "core" pixels (change of at least CORE_DELTA_SHARE of the strongest change) are rated; edges alone would
  // read as low contrast on any readable text.
  function glyphRatios(before, after, fixedText) {
    const deltas = [];
    let strongest = 0;
    for (let offset = 0; offset < before.length; offset += 4) {
      const delta = [0, 1, 2, 3].reduce((sum, channel) => sum + Math.abs(before[offset + channel] - after[offset + channel]), 0);
      deltas.push(delta);
      strongest = Math.max(strongest, delta);
    }
    const floor = Math.max(GLYPH_DELTA, strongest * CORE_DELTA_SHARE);
    const ratios = [];
    deltas.forEach((delta, index) => {
      const offset = index * 4;
      if (delta >= floor) ratios.push(contrast(fixedText || pixelAt(before, offset), pixelAt(after, offset)));
    });
    return ratios.sort((one, two) => one - two);
  }

  function percentile(sorted, pct) {
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((pct / 100) * sorted.length)))];
  }

  function pixelDetail(ratios, candidate) {
    if (ratios.length < MIN_GLYPH_PIXELS) return null;
    const measured = percentile(ratios, 10);
    if (measured >= candidate.threshold || percentile(ratios, 50) >= candidate.threshold) return null;
    const reason = candidate.reasons.slice(0, 3).join(', ');
    return `pixel contrast ${measured.toFixed(1)}:1 median ${percentile(ratios, 50).toFixed(1)}:1 (need ${candidate.threshold}:1) on ${reason} "${candidate.text}"`;
  }

  async function compareShots(beforeBase64, afterBase64, candidate) {
    const [before, after] = await Promise.all([decodeImage(beforeBase64), decodeImage(afterBase64)]);
    const width = Math.min(before.width, after.width);
    const height = Math.min(before.height, after.height);
    if (width < 1 || height < 1) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const beforeData = readPixels(context, before, width, height);
    const afterData = readPixels(context, after, width, height);
    return pixelDetail(glyphRatios(beforeData, afterData, candidate.renderedForeground ? null : candidate.textColor), candidate);
  }

  async function run() {
    const findings = [];
    for (const elem of document.querySelectorAll('body, body *')) findings.push(...elementFindings(elem));
    findings.push(...edgeFlushFindings(), ...columnOverflowFindings());
    await revealSweep();
    findings.push(...hiddenAtRestFinding(measureHiddenText()));
    return findings;
  }

  window.__designScan = { run, contrastCandidates, hideText, showText, compareShots };
})();
