# custom-design

One agent skill that combines two design bodies of text, plus a small scanner:

- `impeccable/`: a fork of Impeccable (build and refine playbooks, craft floor and bans, critique and audit,
  three subagent prompts).
- `apple/`: the apple-design skill (Apple Human Interface Guidelines, 123 pages, five review lenses,
  cross-platform translation tables).

`SKILL.md` is the router. It tells the agent which 2 to 4 files to read for a task, so the large bodies stay
out of context until needed.

## Paradigm

Text plus a Node scanner. The agent reads files and applies them by hand, and can run `scan.mjs` over the files it
changed. npm dependencies are allowed; no binaries, no binary-downloading packages, no curl/wget install scripts,
no install-time scripts. The upstream live-mode server, hooks and HIG re-pull script were deliberately left out.

## Scanner

`node scan.mjs <files-or-dirs...> [--json] [--browser] [--url <http(s)://...|file>] [--header "Name: value"] [--cookie "name=value"] [--settle-ms <n>]` is a static, offline checker
ported from Impeccable's legacy JavaScript detector (Apache-2.0, see `NOTICE.md`). It walks directories (skipping
`node_modules`, `.git`, `dist`, `build`) and scans `.html .htm .css .scss .sass .less .jsx .tsx .js .ts .vue .svelte
.astro`. Output is one `path:line rule-id severity message` per finding, or a JSON array with `--json`. Exit 0: no
findings, 1: findings, 2: usage error. Page-level findings that have no source line report line 1.

Browser-tier options: pages are opened with the page's Content-Security-Policy bypassed (so the scan script can run),
after `load` the scanner waits for the network to go idle (best effort) plus `--settle-ms` (default 1000) so
data-driven pages finish rendering. `--header "Name: value"` and `--cookie "name=value"` are repeatable and scan
logged-in pages: they are sent as extra HTTP headers on every request of the browser context (cookie flags merge into
one `Cookie` header; this also reaches third-party origins the page loads, so use them on pages you trust) and their
values are never printed. A page that fails to scan is reported on stderr and skipped, not fatal.
Pixel contrast rates only the strongest glyph pixels (at least half the maximum change when text is hidden), and
flags text only when both the 10th percentile and the median ratio are below the threshold.

Tiers, from cheapest to richest. Each tier only adds findings; a missing tier never breaks the others.

| Tier | Needs | Rules |
|---|---|---|
| regex / text | Node only | side-tab, border-accent-on-rounded, gradient-text, ai-color-palette, gray-on-color (Tailwind), bounce-easing, layout-transition, broken-image (attributes), monotonous-spacing, em-dash-overuse, marketing-buzzword, aphoristic-cadence, dark-glow, radial-halo, marquee, codex-grid-background, pulsing-dot, shape-assembled-illustration, organic-clip-path, buried-raster, repeating-stripes-gradient, theater-slop-phrase, image-hover-transform |
| static html | `npm install` (htmlparser2, css-select, css-tree, domutils) | resolved-style versions of side-tab, border-accent-on-rounded, gradient-text, gray-on-color, ai-color-palette, low-contrast, broken-image, plus skipped-heading, nested-cards, cream-palette, flat-type-hierarchy, oversized-h1, gpt-thin-border-wide-shadow, tight-leading, justified-text, tiny-text, undersized-ui-text, all-caps-body, wide-tracking, extreme-negative-tracking, buried-raster (opacity) |
| browser | Playwright already installed (optional, never installed by this repo) | low-contrast (computed colors, plus screenshot pixel sampling for text over images, gradients and filters) and broken-image on the rendered page, line-length, cramped-padding, body-text-viewport-edge, edge-flush-cards, first-viewport-column-overflow, content-hidden-at-rest, script-error |

Not ported (17 of the upstream 61 rules): the font rules overused-font and italic-serif-display; the design-system
rules design-system-font, design-system-color, design-system-radius and design-system-font-size (they need a
DESIGN.md model); and the rules that need deeper layout or cascade work than this scanner does: hero-eyebrow-chip,
icon-tile-stack, kicker-above-heading, numbered-section-labels, repeated-container-text, radial-spotlight-glow,
clipped-overflow-container, text-occlusion, text-overflow, heading-rhythm, blinking-cursor. The page overlay UI is also not ported (screenshot contrast is ported and
runs in the browser tier, decoded in the page, so it needs no image library). The agent's read-based review in `SKILL.md` still covers
all of these. Offline the scanner runs 37 rules; with the browser tier, 44.

The scanner reads files, parses them, and prints. It imports only `node:fs`, `node:path`, `node:url` and
`node:process` plus the four npm packages above (and Playwright if present, by dynamic import); no network
access (a browser only loads a page you pass with `--url`), no process spawning, no `eval`.
`.npmrc` sets `ignore-scripts=true`, and none of the pinned packages has an install script. Run the tests with
`node --test`.

## Sources

- Impeccable by Paul Bakaus (Apache-2.0), via the fork https://github.com/nefr0/impeccable
- apple-design by dickwu, https://github.com/dickwu/apple-design-skill
- HIG text (c) Apple Inc., reproduced from the public guidelines

Details in `NOTICE.md`; Apache-2.0 text in `LICENSE`.

## Install

Symlink the directory into each agent's skills folder:

```
ln -s /path/to/custom-design ~/.claude/skills/custom-design
ln -s /path/to/custom-design ~/.agents/skills/custom-design
```

## Layout

```
SKILL.md        router (name: custom-design)
impeccable/     SKILL.md, reference/ (incl. degraded/), agents/
apple/          SKILL.md, references/ (hig/, hig-lookup.md, cross-platform.md)
scan.mjs        scanner entry; scanner/ holds its modules
tests/          node:test suite and fixtures
package.json  package-lock.json  .npmrc
LICENSE  NOTICE.md  README.md
```
