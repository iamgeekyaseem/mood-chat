# Hyperframes Composition Brief: Branch

## Objective
A short, polished launch film for Branch — a chat client where the conversation
is a tree, not a line.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080, 30fps
- Duration: 20s

## Source Material
- Project root: `/Users/aseem/myai/claude-gui-aseem`
- Primary files read: `frontend/src/index.css` (palette), `README.md`, the app's
  own graph / branch UI (built and screenshotted in this project)
- Product name: Branch
- Tagline / strongest claim: "Your conversation is a tree, not a line."
- Key UI recreated: the branching graph — grey main spine, one continuous
  coloured strand per branch; the ⑂ Branch chip on a text selection; the
  multi-model fan-out (Opus / GPT-5 / Gemma branches).
- Copy that must appear verbatim:
  - "Ask about any word — without derailing the thread."
  - "The main thread never moved."
  - "Every tangent is its own branch."
  - "Ask three models at once. Compare."
  - "Branches share context. Caching does the rest."
  - "Your conversation is a tree, not a line."

## Creative Direction
- Tone preset: polished
- Creative direction: a quiet, confident product film for a thinking tool
- Interpretation: few scenes, longer holds, restrained motion. Colour comes only
  from the branch strands; everything else is the app's warm-neutral charcoal.
- Angle: every AI chat is a straight line — ask about one word and the thread
  follows you down the tangent. Branch makes the tangent its own coloured strand
  and leaves the main line untouched. Make that idea land visually, then the
  quiet kicker: branches share cached context, so they cost less.
- Hook: a reply with "p value" highlighted; the ⑂ Branch chip snaps in.
- Outro / punchline: the "Branch ⑂" wordmark and "Your conversation is a tree,
  not a line."
- Avoid: generic SaaS language, abstract filler, redesigning the product.

## Visual Identity
- Background: #171614 (app dark theme)
- Text: #edeae4; muted #9a948b
- Branch colours: blue #3987e5, amber #c98500, magenta #d55181 (validated,
  colourblind-safe in the app)
- Display/body font: system sans; mono for ⑂ marks and labels
- Visual references: the graph canvas with coloured strands; chat bubbles;
  the ⑂ Branch chip; the token meter (↑ / ↓ / cached).

## Storyboard
See `brag-output/brag-plan.md` (5 scenes, 20s). Scene summary:
1. Hook: select "p value" → ⑂ Branch chip — 4.7s
2. The branch spurs off, main thread stays — 3.7s
3. The graph blooms: 3 coloured branch strands — 4.2s
4. Ask three models at once (Opus / GPT-5 / Gemma) — 4.7s
5. Cheaper by design → wordmark — 3.5s

## Audio
- Audio role: warm professional bed with sparse, motion-matched accents
- Audio arc: low bed throughout; energy lifts on the three-model fan-out; one
  soft swell on the wordmark as music fades.
- Music: happy-beats-business-moves-vol-1-by-ende-dot-app.mp3 (120 BPM)
- Music treatment: enter ~0.3s at 0.5 volume; fade to 0 over 1.2s under the
  wordmark (18.6–19.8s).
- Music cue guidance: bundled preset (120.19 BPM); strong cues 17.02 / 17.52 /
  18.52 / 20.02s — the third model card (~14.4s) and the wordmark (~18.5–19.1s)
  sit near the strong-cue cluster; small accents ride the beat grid.
- Audio-reactive treatment: none in this cut (kept restrained; documented, not
  blocking).
- SFX: none added — the warm bed and fades carry it; the tone asks for restraint
  over a busy sound layer.

## Notes
- Composition authored directly per hyperframes-core (monolithic, one paused
  GSAP timeline). All strand "draws" use transform scale (allowlist-safe).
- `npx hyperframes check` passes: 0 errors, 0 warnings, 27/27 contrast checks.
