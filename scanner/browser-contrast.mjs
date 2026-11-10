// Screenshot contrast for the browser tier. For each text candidate collected in the page (text over images,
// gradients, filters...) it screenshots the text region with the text visible and hidden, then lets the page
// decode both PNGs and rate the glyph pixels. No image decoder is needed in Node.
const MAX_CLIP_HEIGHT = 320;
const MAX_CLIP_WIDTH = 1600;

export function sanitizeClip(clip) {
  if (!clip) return null;
  return {
    x: Math.max(0, Math.floor(clip.x || 0)),
    y: Math.max(0, Math.floor(clip.y || 0)),
    width: Math.min(Math.max(1, Math.ceil(clip.width || 0)), MAX_CLIP_WIDTH),
    height: Math.min(Math.max(1, Math.ceil(clip.height || 0)), MAX_CLIP_HEIGHT),
  };
}

async function shoot(page, clip) {
  const buffer = await page.screenshot({ clip, fullPage: true, animations: 'disabled', type: 'png' });
  return buffer.toString('base64');
}

async function shootWithoutText(page, candidate, clip) {
  const hidden = await page.evaluate(({ index, clipsText }) => window.__designScan.hideText(index, clipsText), { index: candidate.index, clipsText: candidate.clipsText });
  if (!hidden) return null;
  try {
    return await shoot(page, clip);
  } finally {
    await page.evaluate((index) => window.__designScan.showText(index), candidate.index).catch(() => {});
  }
}

async function measureCandidate(page, candidate) {
  const clip = sanitizeClip(candidate.clip);
  const before = await shoot(page, clip);
  const after = await shootWithoutText(page, candidate, clip);
  if (!after) return null;
  return page.evaluate(({ beforeShot, afterShot, found }) => window.__designScan.compareShots(beforeShot, afterShot, found), { beforeShot: before, afterShot: after, found: candidate });
}

export async function pixelContrastFindings(page) {
  const candidates = await page.evaluate(() => window.__designScan.contrastCandidates());
  const findings = [];
  for (const candidate of candidates) {
    try {
      const detail = await measureCandidate(page, candidate);
      if (detail) findings.push({ id: 'low-contrast', detail });
    } catch {
      // A candidate that cannot be captured or decoded (stale element, CSP) is skipped, not reported.
    }
  }
  return findings;
}
