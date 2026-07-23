# Composition brief — Branch launch (22s, landscape, polished)

Handed to Hyperframes. `/brag` owns the product angle, storyboard, tone, audio,
and delivery; Hyperframes owns the concrete composition, exact timing, and the
render workflow.

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
   fan off it into three branch cards. Caption: *Every tangent is its own
   branch.*
4. **12.5–16.5 Three models.** One question fans into three branches labelled
   `claude-opus-4-8`, `gpt-5`, `gemma3:4b`. Caption: *Ask three models at once.*
5. **16.3–19.0 Cheaper by design.** Two sibling branches; the second's cost
   ticks **1,280 → 128** as a `✓ cached · 0.1×` tag lights. Caption: *Siblings
   share a cached prefix.*
6. **18.8–20.6 No API key.** The model picker, open, `ollama · local` group with
   `gemma3:4b` selected. Caption: *Free, fully local — nothing leaves your
   machine.*
7. **20.4–22.0 Punchline.** Wordmark `Branch⑂` → *Your conversation is a tree,
   not a line.*

## Motion discipline (polished tone)

- Captions and the wordmark use `power2/3.out` only — **no overshoot on text**.
- The single permitted snap is the beat-1 `⑂ Branch` chip (a UI affordance, not
  text): a restrained `back.out(1.4)`, 0.32s.
- Strands draw via `scaleX` from a fixed origin; cards arrive with a short
  translate + fade. Beat 2's main-thread nodes never move once settled.
- The cached counter is a deterministic gsap value tween (`onUpdate` writes
  `textContent`) — no `Date.now()`/`Math.random()`.

## Audio

Bundled bed `happy-beats-business-moves-vol-1` at 0.5, fading out under the
wordmark from ~20.6s. Cues are timing guidance only.

## Checks

`npx hyperframes check`: 0 errors, contrast 31/31 WCAG AA, layout 0 issues,
motion 0 warnings. (One non-blocking `timeline_track_too_dense` info — the whole
piece is authored in one file by choice.)

## Fidelity

Every surface shown exists in the app: chat bubbles, the branch chip, the graph
cards + coloured strands, the multi-model fan-out, the cached token meter, and
the provider/model picker with its `ollama` group. No invented UI, no generic
SaaS language.
