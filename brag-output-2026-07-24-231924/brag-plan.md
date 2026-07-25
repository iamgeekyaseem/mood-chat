# Branch — launch video plan (bigger cut)

**Run:** 2026-07-24-231924 · `--tone polished --format landscape --duration 45`
**One idea:** *a conversation is a tree, not a line* — and the tree has real tools
built around it: compare, diff, cache, run local, search, export.

This is a deeper cut of `brag-output-2026-07-24-220625/`. That run proved the hook.
This one keeps the hook and adds the rest of what's actually shipped, each beat
pairing the claim with a short real-UI demo action. Product facts below are
verified against the code (`frontend/src/`, `backend/`, `ROADMAP.md`), not guessed.

## Verified facts this video is allowed to claim

- Model IDs (exact): Anthropic `claude-opus-4-8`, `claude-sonnet-5`,
  `claude-haiku-4-5`; OpenAI `gpt-5`, `gpt-5-mini`, `gpt-4.1`; Ollama local, dynamic
  list, e.g. `gemma3:4b`.
- Prompt caching is **Anthropic-only** (`supports_caching`); never claimed for
  OpenAI/Ollama.
- Ollama needs no API key, runs fully local/offline.
- Branch color law (`frontend/src/colors.ts`): 4 hues (blue/amber/magenta/green) +
  neutral overflow, each paired with a distinct dash pattern — color is never the
  only encoding.
- Real UI copy to quote verbatim: "⑉ compare" / "Send this question to several
  models at once — each answer becomes its own branch" (Composer.tsx); "⚖ diff" /
  "Compare two branches side by side" (top bar / DiffView.tsx); "{N} tokens read
  from cache at ~0.1×" (Message.tsx); Ollama Settings "↻ Refresh".
- **Not claimed** (ROADMAP "still open"/"deferred"): per-node context override,
  single-turn attachment scoping, exact OpenAI/Ollama token estimates, semantic
  branch clustering, live multi-user collaboration.

## Tone

Same as before: earnest, confident, not jokey. Calm motion, no bouncing text except
the one permitted UI-affordance snap (the ⑂ Branch chip in beat 1). Branch colours
are the only saturated colour against the warm dark charcoal (`#171614`).

## Beat sheet (45.0s, 10 holds, ~0.2s crossfades)

| # | t (s) | Beat | What's on screen | Built by |
|---|-------|------|------------------|----------|
| 1 | 0.0–3.2 | **Hook** | Chat: "explain regression" → reply. Highlight `p value`; `⑂ Branch` chip snaps in. Caption: *Highlight any phrase. Branch off it.* | Hyperframes |
| 2 | 3.0–7.4 | **The shot** | Selection spurs one blue strand + branch card right; main thread pinned. Caption: *The main thread never moves.* | **Manim** (`manim/main_thread.py`, carried over) |
| 3 | 7.2–11.7 | **The whole tree, one canvas** | Root fans into 4 colour-coded branches (blue/amber/magenta/green), each its own dash pattern; a small minimap thumbnail locks into the corner showing the same shape. Caption: *Every branch, one canvas.* | **Manim** (`manim/graph_canvas.py`) |
| 4 | 11.5–16.5 | **Ask three models at once** | One question fans into `claude-opus-4-8` / `gpt-5` / `gemma3:4b` branch cards. Caption: *"Send this question to several models at once — each answer becomes its own branch."* (Composer.tsx tooltip, verbatim) | **Manim** (`manim/multi_model.py`, adapted from `three_models.py`) |
| 5 | 16.3–20.8 | **Diff two branches** | Two branch cards side by side, a centered `⚖ diff` chip between them, a couple of lines highlighted (added/changed) in each. Caption: *"Compare two branches side by side."* | Hyperframes (two static panels + chip, no connector geometry needed) |
| 6 | 20.6–24.6 | **Cheaper by design** | Two sibling branches; second's token cost ticks down to a cached fraction, `✓ cached · 0.1×` tag lights. Caption: *Siblings share a cached prefix — Anthropic caching, on by default.* | Hyperframes |
| 7 | 24.4–28.4 | **No API key** | Model picker, `ollama · local` group, `gemma3:4b` selected + `↻ Refresh`. Caption: *gemma3:4b runs fully local — nothing leaves your machine.* | Hyperframes |
| 8 | 28.2–34.2 | **The toolbelt** (3 quick hits, ~2s each) | (a) `⌘K` search palette with a query typed; (b) Export chip → `.md` / `.branch.json`; (c) an excerpt clipped into the Notes tab. Captions per sub-beat: *Search everything.* / *Export a thread, or the whole tree.* / *Clip anything into notes.* | Hyperframes |
| 9 | 34.0–39.5 | **Color law** | One root node fanning into the 4 branch colours again, this time labelled as a legend with their distinct dash patterns spelled out. Caption: *Every branch has a colour and a shape — never colour alone.* | **Manim** (`manim/color_law.py`) |
| 10 | 39.3–45.0 | **Punchline** | Wordmark `Branch⑂` → *Your conversation is a tree, not a line.* | Hyperframes |

Beat 2 stays the emotional hero (longest early hold); beat 8 is intentionally
brisk — three fast, legible hits rather than one long one, per the "readable" law
(each still gets its ~0.8s settle).

## Motion rules

- Same discipline as before: captions/wordmark use `power2/3.out` only, no
  `back`/overshoot. The one permitted snap is the beat-1 chip.
- All new Manim connectors follow `branch_theme.py`'s rule: every line endpoint is
  a real mobject anchor (`get_edge_center`), never a hand-typed angle/length.
  `branch_theme.py` is copied into this run's `manim/` unmodified so the palette
  and helpers match the previous run exactly.
- Beats 5–8 are plain HTML/CSS panels (cards, chips, a picker) — no rotated
  connector lines anywhere in this video, Manim or CSS; where a beat doesn't need
  a connector, it doesn't get one.

## Audio

Same bundled bed (`happy-beats-business-moves-vol-1`) at 0.5, fading under the
wordmark from ~39.5s. Timing guidance only.

## Don't

Same list as before, plus: don't show caching for OpenAI/Ollama; don't show any
ROADMAP "still open"/"deferred" item as shipped; don't invent UI that isn't in the
real app.

## Output

Fresh dir `brag-output-2026-07-24-231924/` — `brag-output-2026-07-24-220625/` and
all earlier runs are left untouched.
