---
name: custom-design
description: UI/UX design for any web, mobile or desktop interface - build, redesign, review, critique, audit, polish, make less generic, typography, color, layout, motion, dark mode, accessibility, responsive, UX copy, design systems (PRODUCT.md, DESIGN.md), Apple HIG and platform conventions (iOS, iPadOS, macOS). Single entry point for the bundled Impeccable and apple-design material. Text only, nothing to execute.
---
# custom-design (router)

One skill, two bundled bodies of text. All paths below are relative to this skill's directory.
- **Impeccable** (craft, anti-slop, build and refine commands, review playbooks): `impeccable/`
- **apple-design** (Apple HIG, 123 pages, review lenses): `apple/`

**Paradigm: text only.** You (the agent) read files and apply them by hand. There are no scripts, hooks,
engines, launchers, downloads or network calls in this skill, and nothing in it should ever be executed.
Where a bundled file mentions a command such as `/impeccable polish` or `init`, it names a playbook:
open the matching `impeccable/reference/<name>.md` and follow it yourself.

Do NOT load either SKILL.md whole unless needed: `impeccable/SKILL.md` is 12 KB, `apple/SKILL.md` is 23 KB.
Read only the files the table points to, usually 2 to 4 per task. Relative paths inside a bundled file
resolve against that body's folder (`impeccable/` or `apple/`).

## Steps (every task)

1. **Context, if the project has it:** read `PRODUCT.md` and `DESIGN.md` at the repo root (the full lookup
   order is in `impeccable/SKILL.md`, section Setup). Missing files are fine for small refinements.
2. **Pick one row below.** Read its files. Nothing else unless the task grows.
3. **Before any UI edit**, read `impeccable/reference/craft-floor.md` (4 KB): the quality floor and the bans.
4. **Edit**, matching the existing code's tokens, components and icon set. Refinement keeps the identity; only a
   requested redesign replaces it.
5. **Verify once, then fix in one batch, by reading:**
   - Re-read your diff against the `craft-floor.md` sections "Verify" and "Refuse" (the bans checklist) and the
     rules at the bottom of this file. Quote the offending line for each hit.
   - Look at the rendered result at phone and desktop sizes when you can run the app (skill `ui-mockup` if your
     environment has it; otherwise any screenshot tool you already have). If nothing can render, say so and
     review the code only.
   - At most one more round.

## Impeccable subagents

Impeccable's agent prompts live in `impeccable/agents/` (asset-producer, documenter, finish-reviewer). When an
Impeccable file says to spawn `impeccable-<role>`, start a fresh general-purpose subagent whose prompt begins
"Read `impeccable/agents/impeccable-<role>.md` (absolute path) and act as that agent; obey its tool and write
limits", followed by the input packet the Impeccable file lists. If your harness has no subagents, use the
in-thread fallback `impeccable/reference/degraded/<role>.md` and say so in one line.

## Route

| Task | Read |
|---|---|
| Review, critique, "is this good", screenshot feedback | `apple/SKILL.md` lines 95-302 (5 lenses + report format), then HIG pages for what is on screen (table below) |
| Score UX heuristics in depth | `impeccable/reference/critique.md` (38 KB: only for a full formal critique) |
| a11y / perf / responsive audit | `impeccable/reference/audit.md` (native: `audit.native.md`) |
| Polish before shipping | `impeccable/reference/polish.md` |
| App UI, dashboard, settings, tools (Operate) | `impeccable/reference/operate.md` + `impeccable/reference/mode-operate.md` |
| Landing / marketing (Persuade), portfolio (Experience) | `impeccable/reference/mode-persuade.md` + `impeccable/reference/new-work.md` |
| Docs, articles (Read) | `impeccable/reference/mode-read.md` + `impeccable/reference/operate.md` |
| New screen or surface | `impeccable/reference/shape.md`; full build direction: `impeccable/reference/new-work.md` (28 KB, read the sections you need) |
| Redesign / "less generic" / bolder | `apple/SKILL.md` lines 339-369 (improvement mode) + `impeccable/reference/bolder.md` |
| Too loud | `impeccable/reference/quieter.md` · Too complex: `impeccable/reference/distill.md` |
| Typography | `impeccable/reference/typeset.md` + HIG `typography.md` |
| Color, dark mode | `impeccable/reference/colorize.md` + HIG `color.md`, `dark-mode.md` |
| Spacing, rhythm, hierarchy | `impeccable/reference/layout.md` + HIG `layout.md` |
| Motion | `impeccable/reference/animate.md` + HIG `motion.md` |
| Copy, labels, errors | `impeccable/reference/clarify.md` + HIG `writing.md` |
| Empty states, first run | `impeccable/reference/onboard.md` |
| Edge cases, i18n, errors | `impeccable/reference/harden.md` |
| Phone / tablet / desktop adaptation | `impeccable/reference/adapt.md` (native: `adapt.native.md`) |
| Native iOS / Android screens | `impeccable/reference/ios.md` / `impeccable/reference/android.md` |
| Slow UI | `impeccable/reference/optimize.md` |
| Personality, memorable touch | `impeccable/reference/delight.md` · extreme effects: `impeccable/reference/overdrive.md` |
| Tokens / design system | `impeccable/reference/extract.md`; record it: `impeccable/reference/document.md` |
| Product context file | `impeccable/reference/init.md` (writes PRODUCT.md) |
| Command menu / "what should I run" | `impeccable/reference/routing.md` |
| Charts | skill `dataviz`, if available |
| Mockups of a live app | skill `ui-mockup`, if available |

## HIG pages (`apple/references/hig/<page>.md`)

Always for reviews: `accessibility`, `layout`, `typography`, `color`; web apps also `apple/references/cross-platform.md`.
By what is on screen:
- Tabs, sidebar, back nav: `tab-bars`, `sidebars`, `toolbars`. Buttons, menus: `buttons`, `menus`, `context-menus`.
- Sheets, dialogs: `modality`, `sheets`, `alerts`, `popovers`. Forms: `entering-data`, `text-fields`, `pickers`, `toggles`.
- Lists, cards: `lists-and-tables`, `collections`. Search: `searching`. Glass: `liquid-glass`, `materials`.
- Icons: `icons`, `sf-symbols`. Loading, empty, errors: `loading`, `feedback`, `progress-indicators`, `writing`.
- Anything else: find the topic in `apple/references/hig-lookup.md` (read it, or search it with your file search tool).

Cite as `buttons.md > Style`; anything not from a file you opened is your judgment, so label it.

## Rules that always apply (short form)

- Numbers, not adjectives: "12px #999 on #fff, 2.8:1 < 4.5:1".
- Touch targets >=44px; body contrast >=4.5:1; visible focus; reduced motion respected.
- One accent, one primary action per screen. Icons drawn in one consistent stroke, never emoji.
- No gradient text, no decorative glass, no colored side stripes >1px, no eyebrow labels over headings, no nested cards.
- Don't flatten personality: if your fixes make it look like a template, you went too far.

## Licenses

Impeccable text is Apache-2.0 (see `LICENSE`, `NOTICE.md`). HIG text is (c) Apple Inc., reproduced for design
review; see `NOTICE.md`.
