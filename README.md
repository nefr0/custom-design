# custom-design

One agent skill that combines two design bodies of text:

- `impeccable/`: a fork of Impeccable (build and refine playbooks, craft floor and bans, critique and audit,
  three subagent prompts).
- `apple/`: the apple-design skill (Apple Human Interface Guidelines, 123 pages, five review lenses,
  cross-platform translation tables).

`SKILL.md` is the router. It tells the agent which 2 to 4 files to read for a task, so the large bodies stay
out of context until needed.

## Paradigm

Text only. The agent reads files and applies them by hand. The repository has no scripts, hooks, engines,
launchers, binaries, package manifests, CI, downloads or network access, and no file is executable. The
upstream detector, live-mode server, hooks and HIG re-pull script were deliberately left out.

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
LICENSE  NOTICE.md  README.md
```
