# Command guidance

## Workflow questions

Give advice without executing commands; the menu below is only for bare invocations. Consult relevant command references as needed for prerequisites and scope. Link to the [docs](https://impeccable.style/docs/) for the broader workflow guide. If the user also requests execution, follow that request.

## No-argument routing: the context-aware menu

Read this when the user invokes `/impeccable` with no argument. They are asking "what should I do?" Make the menu context-aware instead of static.

Setup has already read the project context. If there is no PRODUCT.md, the project has no captured context yet: lead the menu with `/impeccable init` as the top recommendation (one line on why) and still show the rest below; don't silently jump into init. Otherwise inspect the project yourself (PRODUCT.md, DESIGN.md, `git status`, the surface the user is working on) and lead with the **2-3 highest-value next commands**, each with a one-line reason, followed by the full menu (the Commands table in SKILL.md, grouped by category). **Never auto-run a command; the recommendation is a suggestion the user confirms.**

Reason over what you see; there is no score to obey:

- DESIGN.md missing while code exists: `document` (capture the visual system).
- Changed files (`git status`) concentrated on one surface: scope `audit` or `polish` to those files, naming them.
- A visibly weak area (low contrast, cluttered hierarchy, flat or gray palette, loud effects): the matching command (`audit`, `layout`, `colorize`, `quieter`, and so on).
- A set-up project with a real surface and no recent review: `/impeccable critique <surface>` is a strong default.
- Otherwise group by intent (build new / improve what's there), tailored to the current surface and the `## Platform` in PRODUCT.md.

Keep it to 2-3 pointed picks with the exact command to type. The menu stays the fallback; the recommendation is the lede.
