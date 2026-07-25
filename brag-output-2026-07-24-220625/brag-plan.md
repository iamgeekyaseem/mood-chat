# Branch — launch video plan (redo)

**Run:** 2026-07-24-220625 · `--tone polished --format landscape --duration 22`
**One idea:** *a conversation is a tree, not a line.* Land it visually in the
first 3 seconds, then prove it with real UI.

This is a redo of `brag-output/` and `brag-output-2026-07-23-231852/`. Product
understanding, tone, beat sheet, and audio are carried forward unchanged
(re-verified against the current app — the branch feature, colour slots, and
model list in `frontend/src/colors.ts` / `backend/providers/*.py` all still
match). **The only change is how beats 3 and 4 are built.**

## What was wrong last time

In both prior runs, `composition/index.html` drew every connector line
(`.strand` / `.spine`) as a `<div>` with hand-typed `left/top/width` plus
`transform: rotate(Ndeg)` — a guessed angle and length, entirely independent
of the actual `left/top` of the card `<div>` it was supposed to touch. Nothing
computed the endpoint from the card's real position, so strands routinely
missed the card edge they were meant to land on. The GSAP timeline only
animated `scaleX/scaleY` on these same static elements — it never touched
positioning, so it couldn't have fixed this.

## The fix

Beats 3 and 4 — the two scenes that are pure node-and-connector diagrams — are
now built in **Manim**, not hand-coded HTML/CSS. Every connector is a `Line`/
`CurvedArrow` drawn from one node mobject's real anchor to another's
(`node_a.get_right()` → `node_b.get_left()`, etc.), so a line is geometrically
incapable of missing the card it connects — see
`manim/graph_blooms.py` and `manim/three_models.py` in this output dir.
Rendered as transparent-background (alpha) clips and composited into the
Hyperframes timeline as video layers at the same beat timing as before.
Per `frontend/src/colors.ts`'s own design law — "a branch is never rendered as
color alone, its anchor text always shows" — every branch card in these clips
carries its label, never color alone.

Everything else (hook, real UI capture, tone, audio, delivery) stays exactly
as planned before and is unchanged from the prior runs' successful parts.

## Tone

Earnest and confident, not jokey — a real productivity tool for people who
think in tangents, not a startup parody. Calm motion, longer holds, no bouncing
text. The branch colours (blue `#3987e5`, amber `#c98500`, magenta `#d55181`,
from `frontend/src/colors.ts`) are the only saturated colour against the app's
warm dark charcoal (`#171614`). No generic SaaS language.

## The hook (must land by 0:03)

A normal-looking chat reply. Someone highlights a phrase mid-sentence — the word
**"p value"** — and a `⑂ Branch` chip snaps in right next to the selection. That
one gesture *is* the product.

## Beat sheet (22.0s, 7 holds)

| # | t (s) | Beat | What's on screen | Built by |
|---|-------|------|------------------|----------|
| 1 | 0.0–4.6 | **Hook** | Chat: "explain regression" → reply. Cursor selects `p value`; a `⑂ Branch` chip snaps in beside it. Caption: *Highlight any phrase. Branch off it.* | Hyperframes |
| 2 | 4.4–8.9 | **The shot** (hero — room to breathe) | The selection spurs a single blue strand + branch card to the right. The main thread is pinned in place and visibly **does not move**. Caption: *The main thread never moves.* | Hyperframes |
| 3 | 8.7–12.7 | **Graph blooms** | Cut to the Graph tab: grey main spine, then blue / amber / magenta strands fan off it like a real tree. Caption: *Every tangent is its own branch.* | **Manim clip** (`manim/graph_blooms.py`) composited as video layer |
| 4 | 12.5–16.5 | **One question, three models** | One question fans into three branches labelled `claude-opus-4-8`, `gpt-5`, `gemma3:4b`, each its colour. Caption: *Ask three models at once.* | **Manim clip** (`manim/three_models.py`) composited as video layer |
| 5 | 16.3–19.0 | **Cheaper by design** (quiet, confident) | Two sibling branches; the second's token cost ticks **down** to a fraction as a `cached` tag lights. Caption: *Siblings share a cached prefix.* | Hyperframes |
| 6 | 18.8–20.6 | **No API key** | The model picker, open, showing an `ollama` group with `gemma3:4b` selected. Caption: *gemma3:4b runs fully local — nothing leaves your machine.* | Hyperframes |
| 7 | 20.4–22.0 | **Punchline** | Wordmark `Branch⑂` → *Your conversation is a tree, not a line.* | Hyperframes |

Holds overlap ~0.2s for crossfades. Beat 2 is the longest single hold by design.

## Motion rules

- Text uses `power2/3.out` only — **no `back`/overshoot on any caption or the
  wordmark** (the brief bans bouncing text).
- The one permitted "snap" is the `⑂ Branch` chip in beat 1 — it's a UI
  affordance appearing, given a restrained `back.out(1.4)`, short duration.
- Beats 3 and 4: connector geometry comes from Manim's own anchor methods on
  the node mobjects — never a hand-typed angle/length. Verified by eye (line
  endpoint flush against each card edge) before the clip is accepted, and
  re-verified once composited into the timeline.
- Strands in beat 2 draw out with `scaleX` from a fixed origin; cards arrive
  with a small translate + fade. Main-thread nodes in beat 2 never receive a
  transform after they settle — proving they don't move.

## Audio

Bundled bed `happy-beats-business-moves-vol-1` at 0.5, fading under the wordmark
from ~20.4s. Music cues are timing guidance only; readability and the product
story stay primary. No SFX added.

## Don't

"Streamline your workflow", "boost productivity", any generic SaaS language.
Don't invent UI that isn't in the real app — every surface shown (chat bubbles,
branch chip, graph cards, model fan-out, cached meter, model picker) exists.
Don't hand-type a connector's angle/length independent of the nodes it joins.

## Output

Fresh dir `brag-output-2026-07-24-220625/` — both earlier runs are left
untouched.
