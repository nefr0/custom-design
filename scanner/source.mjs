// Source preparation: comment blanking, style-block and CSS-in-JS extraction, scoped corpora.
// Offsets and line counts are always preserved so findings map back to the original file.

export const JS_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
export const STYLESHEET_EXTS = new Set(['.css', '.scss', '.sass', '.less']);
export const HTML_EXTS = new Set(['.html', '.htm']);
export const COMPONENT_EXTS = new Set(['.vue', '.svelte', '.astro']);

function blankKeepingNewlines(text) {
  return text.replace(/[^\n]/g, ' ');
}

export function blankBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, blankKeepingNewlines);
}

export function blankHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, blankKeepingNewlines);
}

const SCRIPT_TOKENS = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\/\*[\s\S]*?\*\/)|((?<![:\\(])\/\/[^\n]*)/g;

// Blank `//` and `/* */` comments in script-like text, leaving string literals alone.
export function blankScriptComments(text) {
  return text.replace(SCRIPT_TOKENS, (whole, stringLiteral) => (stringLiteral ? whole : blankKeepingNewlines(whole)));
}

export function prepareSource(content, ext) {
  if (JS_EXTS.has(ext)) return blankScriptComments(content);
  if (ext === '.scss' || ext === '.sass' || ext === '.less') return blankScriptComments(content);
  if (ext === '.css') return blankBlockComments(content);
  return blankBlockComments(blankHtmlComments(content));
}

// ---- style blocks (<style> in html/vue/svelte/astro) ----

export function extractStyleBlocks(content) {
  const blocks = [];
  for (const match of content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const start = match.index + match[0].indexOf(match[1]);
    blocks.push({ text: match[1], start, line: content.slice(0, start).split('\n').length });
  }
  return blocks;
}

// ---- CSS-in-JS template literals (styled.x`...`, css`...`) ----

function templateEnd(text, openIdx) {
  let idx = openIdx + 1;
  while (idx < text.length) {
    if (text[idx] === '\\') idx += 2;
    else if (text[idx] === '`') return idx;
    else if (text[idx] === '$' && text[idx + 1] === '{') idx = expressionEnd(text, idx + 2) + 1;
    else idx++;
  }
  return -1;
}

function expressionEnd(text, startIdx) {
  let depth = 1;
  let idx = startIdx;
  while (idx < text.length) {
    if (text[idx] === '`') idx = templateEnd(text, idx);
    else if (text[idx] === '{') depth++;
    else if (text[idx] === '}' && --depth === 0) return idx;
    if (idx === -1) return text.length;
    idx++;
  }
  return text.length;
}

export function extractCssInJs(content, ext) {
  if (!['.js', '.jsx', '.ts', '.tsx'].includes(ext)) return [];
  const blocks = [];
  const tagPattern = /\b(?:styled(?:\.\w+|\([^)]+\))|css)\s*(?:<[^>`]*>)?\s*`/g;
  let match;
  while ((match = tagPattern.exec(content)) !== null) {
    const start = match.index + match[0].length;
    const end = templateEnd(content, start - 1);
    if (end === -1) continue;
    blocks.push({ text: content.slice(start, end), start, line: content.slice(0, start).split('\n').length });
    tagPattern.lastIndex = end + 1;
  }
  return blocks;
}

// ---- scoped corpora ----

// Blanks everything outside the ranges with ';' (newlines kept). A separator rather than spaces
// keeps rule-block regexes from rescanning long blank runs, which is quadratic.
function maskOutside(content, ranges) {
  const chars = content.split('').map((chr) => (chr === '\n' ? '\n' : ';'));
  for (const [start, end] of ranges) {
    for (let idx = start; idx < end; idx++) chars[idx] = content[idx];
  }
  return chars.join('');
}

export function buildCorpora(content, ext) {
  if (STYLESHEET_EXTS.has(ext)) return { styleText: content, classText: content };
  const styleRanges = extractStyleBlocks(content).map((block) => [block.start, block.start + block.text.length]);
  const classRanges = [];
  for (const tag of content.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const style = tag[0].match(/\bstyle\s*=\s*("[^"]*"|'[^']*')/i);
    if (style) styleRanges.push([tag.index + style.index, tag.index + style.index + style[0].length]);
    const cls = tag[0].match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (cls) classRanges.push([tag.index + cls.index, tag.index + cls.index + cls[0].length]);
  }
  return { styleText: maskOutside(content, styleRanges), classText: maskOutside(content, classRanges) };
}
