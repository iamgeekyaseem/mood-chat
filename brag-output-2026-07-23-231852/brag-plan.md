# Branch — launch video plan

**Run:** 2026-07-23-231852 · `--tone polished --format landscape --duration 22`
**One idea:** *a conversation is a tree, not a line.* Land it visually in the
first 3 seconds, then prove it with real UI.

## Tone

Earnest and confident, not jokey — a real productivity tool for people who
think in tangents, not a startup parody. Calm motion, longer holds, no bouncing
text. The branch colours (blue `#3987e5`, amber `#c98500`, magenta `#d55181`)
are the only saturated colour against the app's warm dark charcoal (`#171614`).
No generic SaaS language.

## The hook (must land by 0:03)

A normal-looking chat reply. Someone highlights a phrase mid-sentence — the word
**"p value"** — and a `⑂ Branch` chip snaps in right next to the selection. That
one gesture *is* the product.

## Beat sheet (22.0s, 7 holds)

| # | t (s) | Beat | What's on screen |
|---|-------|------|------------------|
| 1 | 0.0–4.6 | **Hook** | Chat: "explain regression" → reply. Cursor selects `p value`; a `⑂ Branch` chip snaps in beside it. Caption: *Highlight any phrase. Branch off it.* |
| 2 | 4.4–8.9 | **The shot** (hero — room to breathe) | The selection spurs a single blue strand + branch card to the right. The main thread is pinned in place and visibly **does not move**. Caption: *The main thread never moves.* |
| 3 | 8.7–12.7 | **Graph blooms** | Cut to the Graph tab: grey main spine, then blue / amber / magenta strands fan off it like a real tree. Caption: *Every tangent is its own branch.* |
| 4 | 12.5–16.5 | **One question, three models** | One question fans into three branches labelled `claude-opus-4-8`, `gpt-5`, `gemma3:4b`, each its colour. Caption: *Ask three models at once.* |
| 5 | 16.3–19.0 | **Cheaper by design** (quiet, confident) | Two sibling branches; the second's token cost ticks **down** to a fraction as a `cached` tag lights. Caption: *Siblings share a cached prefix.* |
| 6 | 18.8–20.6 | **No API key** | The model picker, open, showing an `ollama` group with `gemma3:4b` selected. Caption: *gemma3:4b runs fully local — nothing leaves your machine.* |
| 7 | 20.4–22.0 | **Punchline** | Wordmark `Branch⑂` → *Your conversation is a tree, not a line.* |

Holds overlap ~0.2s for crossfades. Beat 2 is the longest single hold by design.

## Motion rules

- Text uses `power2/3.out` only — **no `back`/overshoot on any caption or the
  wordmark** (the brief bans bouncing text).
- The one permitted "snap" is the `⑂ Branch` chip in beat 1 — it's a UI
  affordance appearing, given a restrained `back.out(1.4)`, short duration.
- Strands draw out with `scaleX` from a fixed origin; cards arrive with a small
  translate + fade. Main-thread nodes in beat 2 never receive a transform after
  they settle — proving they don't move.

## Audio

Bundled bed `happy-beats-business-moves-vol-1` at 0.5, fading under the wordmark
from ~20.4s. Music cues are timing guidance only; readability and the product
story stay primary. No SFX added.

## Don't

"Streamline your workflow", "boost productivity", any generic SaaS language.
Don't invent UI that isn't in the real app — every surface shown (chat bubbles,
branch chip, graph cards, model fan-out, cached meter, model picker) exists.

## Output

Fresh dir `brag-output-2026-07-23-231852/` — the earlier `brag-output/` run is
left untouched.
