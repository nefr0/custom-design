# Visualize: Asset Production

Load this from [new-work.md](new-work.md), or from any command, whenever the build needs a raster asset: an illustration, a photograph, a figure, a product object, or a material texture that code cannot draw. Image generation runs only through the harness's own image tool. With no image tool in the harness, produce nothing: leave a labelled slot at the asset's size and add it to the list of material the user supplies. Never download images, fetch reference URLs, or hotlink stock.

PRODUCT.md is a precondition. The visual world is already decided: DESIGN.md's on an established world, the direction contract's OWN-WORLD on a new one. This file must not reopen it. An asset carries the world's palette, material, lighting, and imagery stance as they stand; it never introduces a new motif, a new palette, or a second art direction.

## What ships as a raster

The medium follows from what the pixels are, never from what feels buildable: a figure, a product object, machinery, any illustration with perspective, shading, or drawing skill in it, and any texture by name (woven cloth, paper grain, fabric, leather, brushed metal) ships as a raster. Text, controls, chrome, diagrams with countable elements, flat shape systems, charts drawn from data, and anything that must move, scale, or respond are built in code. Writing CSS for a sculpted panel's finish, or a many-vertex `clip-path` for a torn edge, is the quiet deletion of the design. Generated imagery is a material, not a claim: evidence rules bind assertions, specs, testimonials, and photographs presented as real, never render fidelity. Never rasterize core UI text or controls.

## Produce

- Decide each asset's job before prompting: where it sits, at what size, and what the page draws around it. The page draws text, controls, radius, shadow, and layout in code; the raster carries only what code cannot draw, so leave that presentation chrome out of it.
- A prompt is short and carries only what the image model cannot know: the subject by name and what it is doing, the world's look in two to four sentences of concrete visual law (the ground and main colours with what each does, the material, the one signature that makes it recognisable), and the framing. On an established world, pass a screenshot of a representative existing page, or an asset the project already ships, as the image tool's input image, and say in one sentence what it contributes (palette, material, rendering character) and what it must not (its layout and content). A pixel reference holds a look where words drift.
- The subject must be in it. A render that depicts the world and nothing of the subject fails however faithful its atmosphere; regenerate with the subject named.
- Generate at the size the asset ships, at least 1.5x its largest rendered size, in an aspect matching its slot. Create the output directory first.
- Choose the background from the asset's role: an isolated figure, object, or line drawing that sits on the page's own ground is a **transparent cutout**; a photograph, a full-frame illustration, or a texture stays **opaque**. For a cutout, request native PNG alpha and say so in the prompt (clear margins, white paint kept solid, fine edges, interior holes open). Open every cutout on light and dark grounds: white paint must stay solid, holes must clear, and fine edges must avoid halos. Never chroma-key or flatten native transparent output. A tool that returns opaque pixels or a painted checkerboard for a cutout is a transparency blocker; report it rather than faking alpha.
- A frame asset (a window, a doorway, an arch) is a transparent cutout with its opening fully transparent; the content seen through it is its own asset at the opening's size.
- A texture (paper, cloth, grain) is a seamless patch tiled to size; generate one patch, never a full-page image of it.
- Open every result by its workspace-relative path (sandboxed viewers reject absolute paths) and compare it against its job. On a miss, tighten the prompt and regenerate once; after two misses keep the better result and name the drift to the user.
- With parallel subagents and more than two assets, spawn the shipped asset producer (`impeccable-asset-producer`; `impeccable_asset_producer` in codex; `/impeccable-asset-producer` in Cursor; on GitHub Copilot say "Use the impeccable-asset-producer agent") with a packet listing, per asset, its id, output path, size, background, the prompt notes, and any reference image path, plus the PRODUCT.md path and the direction contract's OWN-WORLD block. Without subagents, produce them here.

Convert or resize images with whatever converter the environment already has; probe for one at most once per session, never per image.

## Provenance

Generation context is part of the asset. Beside every raster the artifact references, write a prompt sidecar, the image's full file name plus `.json` (`a.png` gets `a.png.json`), holding `{"prompt": "<the exact string the image tool received>"}`, plus `"background"` for cutouts. A project-supplied or pre-existing raster records `{"origin": "<where it came from>"}` instead. That sidecar is the raster's **provenance**. A raster created or replaced later, in a fix batch or a reviewer's rebuild, is produced the same way; a raster a fix abandons is deleted in the same batch, sidecar included.

Return to [new-work.md](new-work.md) for the direction contract, the build, and the finishing pass.
