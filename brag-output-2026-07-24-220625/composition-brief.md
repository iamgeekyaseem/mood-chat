# Composition brief — Branch launch, redo (22s, landscape, polished)

Handed to Hyperframes. `/brag` owns the product angle, storyboard, tone, audio,
and delivery; Hyperframes owns the concrete composition, exact timing, and the
render workflow.

This redo carries forward the frame, structure, motion discipline, audio, and
fidelity rules from `brag-output-2026-07-23-231852/composition-brief.md`
unchanged. **The only change is how beats 3 and 4 are built** — see below.

## Frame

- 1920×1080, 30 fps, 22.0s, single root timeline (`data-composition-id="main"`).
- Warm dark charcoal base `#171614` with a faint dotted canvas texture (the
  app's own graph background). The three branch hues — blue `#3987e5`, amber
  `#c98500`, magenta `#d55181` — are the **only** saturated colour on screen.
- Type: system sans for UI/captions, mono for token counts and model ids.

## Structure (7 holds)

1. **0.0–4.7 Hook.** A real chat reply. A selection caret sweeps the phrase
   `p value`, the blue highlight fills, and a `⑂ Branch from here` chip snaps in
   beside it. Caption: *Highlight any phrase. Branch off it.*
2. **4.5–8.9 The shot** (the hero, longest hold). The selection spurs one blue
   strand + a branch card to the right; the left-column main thread is pinned
   and receives no transform after it settles. Caption: *The main thread never
   moves.*
3. **8.7–12.7 Graph blooms.** Grey main spine, then blue/amber/magenta strands
   fan off it into three branch cards. **Now a composited Manim clip**
   (`assets/video/graph-blooms.webm`) instead of hand-coded CSS strands — see
   "The fix" below. Caption: *Every tangent is its own branch.*
4. **12.5–16.5 Three models.** One question fans into three branches labelled
   `claude-opus-4-8`, `gpt-5`, `gemma3:4b`. **Now a composited Manim clip**
   (`assets/video/three-models.webm`). Caption: *Ask three models at once.*
5. **16.3–19.0 Cheaper by design.** Two sibling branches; the second's cost
   ticks **1,280 → 128** as a `✓ cached · 0.1×` tag lights. Caption: *Siblings
   share a cached prefix.*
6. **18.8–20.6 No API key.** The model picker, open, `ollama · local` group with
   `gemma3:4b` selected. Caption: *Free, fully local — nothing leaves your
   machine.*
7. **20.4–22.0 Punchline.** Wordmark `Branch⑂` → *Your conversation is a tree,
   not a line.*

## The fix: composited Manim diagrams for beats 3 and 4

The prior run's connector lines (`.strand`/`.spine` divs, hand-typed
`left/top/width` + `transform:rotate(Ndeg)`) were positioned independently of
the card elements they were meant to touch, causing visible misalignment.
Beats 3 and 4 are now built in Manim instead (`manim/graph_blooms.py`,
`manim/three_models.py`, shared style in `manim/branch_theme.py`): every
connector is a `Line`/`CurvedArrow` drawn from one node mobject's real edge
anchor to another's (`node_a.get_right()` → `node_b.get_left()`, etc.), so a
line is structurally incapable of missing the card it connects. Rendered
transparent (VP9 `yuva420p`, required for alpha playback in Chromium's
`<video>` — ProRes/qtrle `.mov` alpha does not render in-browser) and
composited into the timeline as `<video class="clip">` layers
(`#s3-diagram`, `#s4-diagram`) sitting behind each scene's caption, which
GSAP only crossfades — same motion discipline as every other scene.

## Motion discipline (polished tone)

- Captions and the wordmark use `power2/3.out` only — **no overshoot on text**.
- The single permitted snap is the beat-1 `⑂ Branch` chip (a UI affordance, not
  text): a restrained `back.out(1.4)`, 0.32s.
- Strands draw via `scaleX` from a fixed origin (beat 2); cards arrive with a
  short translate + fade. Beat 2's main-thread nodes never move once settled.
- Beats 3–4: connector geometry comes from Manim's own anchor methods on the
  node mobjects — never a hand-typed angle/length.
- The cached counter is a deterministic gsap value tween (`onUpdate` writes
  `textContent`) — no `Date.now()`/`Math.random()`.

## Audio

Bundled bed `happy-beats-business-moves-vol-1` at 0.5, fading out under the
wordmark from ~20.6s. Cues are timing guidance only.

## Checks

`npx hyperframes check`: 0 errors, 0 warnings besides the pre-existing
non-blocking `timeline_track_too_dense` info (single-file composition by
choice), contrast 11/11 WCAG AA, layout 0 issues, motion 0 warnings.

Additional check specific to this redo: every connector line in
`graph-blooms.webm` and `three-models.webm` was verified by eye (opaque
smoke-test frames) to terminate flush against the card edge it connects to —
zero eyeballed/hardcoded angles remain in either clip.

## Fidelity

Every surface shown exists in the app: chat bubbles, the branch chip, the
graph cards + coloured strands (now Manim-rendered, same palette and content),
the multi-model fan-out (same), the cached token meter, and the
provider/model picker with its `ollama` group. No invented UI, no generic
SaaS language.
