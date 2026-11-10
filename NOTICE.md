# Notices

This repository bundles text from three upstream sources, plus one scanner ported from Impeccable's detector.

## Impeccable (Apache-2.0)

`impeccable/` is built text output of a fork of Impeccable.

- Original work: Impeccable by Paul Bakaus, Copyright 2025 Paul Bakaus, https://github.com/pbakaus/impeccable
- License: Apache License 2.0 (full text in `LICENSE`)
- Fork: nefr0/impeccable, https://github.com/nefr0/impeccable
- Changes in this repository: the built skill and agent prompts were copied as text; five lines in
  `impeccable/reference/mode-*.md` and `impeccable/reference/critique.md` were reworded so they no longer
  point at the `impeccable` command line tool. The top-level skill router `SKILL.md` is new.

### Scanner (Apache-2.0, from Impeccable)

`scan.mjs` and `scanner/` are ported from Impeccable's legacy JavaScript detector, taken from the
nefr0/impeccable fork at commit `b6aab36ef^` (path `.agent/skills/impeccable/scripts/detector/`). Same upstream
copyright and license as above (Paul Bakaus, Apache License 2.0, text in `LICENSE`). Changes: rewritten as small
modules, trimmed to the rules that static analysis can check, font and design-system rules removed, and
Playwright used for the optional browser tier instead of the original headless-browser launcher. The rule names
and descriptions in `scanner/registry.mjs` come from the upstream rule registry.

Runtime npm dependencies (installed by the user with `npm install`, pinned in `package.json`): htmlparser2 (MIT),
css-tree (MIT), css-select (BSD-2-Clause), domutils (BSD-2-Clause). Their transitive dependencies are boolbase
(ISC), css-what, dom-serializer, domelementtype, domhandler, entities, nth-check (BSD-2-Clause), mdn-data (CC0-1.0)
and source-map-js (BSD-3-Clause). Playwright (Apache-2.0) is an optional peer, never installed by this repository.

### Platform Design Skills (MIT)

`impeccable/reference/ios.md` and `impeccable/reference/android.md` are distilled from ehmo's
`platform-design-skills` (Apple Human Interface Guidelines and Material Design 3 rules), rewritten in
Impeccable's voice.

- Original work: https://github.com/ehmo/platform-design-skills
- Original license: MIT
- Author: ehmo

## apple-design

`apple/` is a copy of the apple-design skill by dickwu, https://github.com/dickwu/apple-design-skill
(the upstream repository carries no license file).

- `apple/references/hig/*.md` is the text of Apple's Human Interface Guidelines. The guideline text belongs to
  Apple Inc. (c) Apple Inc., reproduced from the public guidelines at
  https://developer.apple.com/design/human-interface-guidelines/ for AI-assisted design review. This project
  is not affiliated with or endorsed by Apple.
- `apple/SKILL.md`, `apple/references/hig-lookup.md` and `apple/references/cross-platform.md` are upstream
  text. Changes here: references to the upstream `scripts/pull-hig.mjs` re-pull script were removed or
  reworded, because re-pulling is out of scope for this text-only skill. The script itself is not included.
