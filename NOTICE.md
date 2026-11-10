# Notices

This repository bundles text from three upstream sources. It contains no code.

## Impeccable (Apache-2.0)

`impeccable/` is built text output of a fork of Impeccable.

- Original work: Impeccable by Paul Bakaus, Copyright 2025 Paul Bakaus, https://github.com/pbakaus/impeccable
- License: Apache License 2.0 (full text in `LICENSE`)
- Fork: nefr0/impeccable, https://github.com/nefr0/impeccable
- Changes in this repository: the built skill and agent prompts were copied as text; five lines in
  `impeccable/reference/mode-*.md` and `impeccable/reference/critique.md` were reworded so they no longer
  point at the `impeccable` command line tool. The top-level skill router `SKILL.md` is new.

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
