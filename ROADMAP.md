# Roadmap

Ideas worth building, ordered by how much they'd change daily use. Nothing here
is committed — it's a menu.

Each item notes what it costs to build, because a few of these are an afternoon
and a few are a rewrite.

---

## Done

- **Token budget per conversation** — a running `↑ input · ↓ output` total in
  the top bar, weighted so cache reads (~0.1×) don't overstate spend. Computed
  from nodes already in memory, updates live as replies stream.
- **Regenerate a reply** — `⟳ regenerate` on any assistant message re-asks its
  question as a sibling, so both answers hang off the original side by side.
- **Collapse a branch** — `▾`/`▸` on a branch (rail and canvas) shrinks it to a
  title line and hides its descendants on the graph, with a `▸ N` count of
  what's hidden. Content is kept; the `collapsed` flag persists.
- **Search** — `⌘K` (or the ⌕ button) opens a full-text search over every
  message (SQLite FTS5), scoped to the current conversation or across all of
  them. Prefix-matches as you type, highlights the hit, arrow/Enter to jump —
  a hit in another conversation opens it first. The index self-heals: it
  backfills from history on first run and stays in sync on edit/delete.

---

## Near-term — small, high payoff

**Cheap-model routing for side branches.** The tree structure already knows
which questions are asides. Default branches to a cheaper model and keep the
main thread on the expensive one. Note the cache tension: a different model on a
branch forfeits the sibling cache hit, so this pays off only when the branch is
long enough to beat that. *Small: a per-branch model default.*

**Keyboard navigation — the rest.** `⌘K` search lands. Still worth adding:
`j`/`k` to move through branches on the canvas, and number/arrow selection
inside the graph. Enter-to-send already works. *Small.*

---

## Medium — real features

**PDF text extraction.** Attached PDFs are currently named but unreadable.
`pypdf` gets text out of most; page thumbnails need `pymupdf` or poppler.
*Medium: a dependency choice plus an extraction path.*

**Per-node context override.** Right now the context mode is chosen per branch.
Being able to pin specific ancestors in or out — "include the setup, skip the
tangent" — is a finer instrument. *Medium: a set of node IDs per branch.*

**Export a branch as markdown.** Notes capture excerpts; sometimes you want the
whole line of reasoning as a document. *Medium.*

**Diff two branches.** When you asked the same thing two ways, show the answers
side by side with differences marked. Genuinely useful for model comparison.
*Medium.*

**Templates / saved openings.** A conversation that always starts with the same
framing (a system prompt, a rubric, a set of attachments). *Medium.*

**Better local-model search.** Search currently fires on every send when `web`
is on. A cheap relevance check first — a small classifier or a keyword heuristic
— would skip the round trip for questions that don't need it. *Medium.*

**Attachment scoping.** A file linked to a node applies to that node and
everything below. Sometimes you want it on exactly one turn. *Medium.*

---

## Larger — changes the shape of the app

**Multi-model fan-out.** Ask one question, get answers from three models as
sibling branches, compare. The tree already supports this; the UI doesn't drive
it. *Large: parallel streaming, layout for a wide fan.*

**Shared / exported trees.** A conversation graph as a portable artifact
somebody else can open. Needs a serialisation format and a decision about what
happens to attachments and keys. *Large.*

**Semantic clustering on the canvas.** Group branches by topic rather than by
parentage, so a big tree self-organises. Needs embeddings — local ones would
keep it free. *Large.*

**Agentic branches.** A branch that runs tools and reports back, rather than
just answering. Rethinks what a node is. *Large.*

**Live collaboration.** Two people on one canvas. Almost certainly not worth it
for a personal tool, listed for completeness. *Large.*

---

## Known rough edges

Things that are already wrong rather than merely missing.

- **The on-canvas composer has no context-mode or model picker.** It inherits
  whatever the Chat composer is set to, which is invisible from the Graph tab.
- **Ollama model list is discovered at launch only.** Pull a model while the app
  is open and you must restart to see it.
- **No token count for non-Anthropic providers.** OpenAI and Ollama estimates
  are ~4 chars/token, which is rough. Anthropic is exact.
- **Notes are one document per conversation.** Sessions inside a conversation
  (multiple roots on one canvas) share one notes doc.
- **Cancel keeps the partial reply but doesn't mark it.** A truncated answer
  looks like a short one.
- **Nothing prunes attachments of deleted nodes.** Files persist until the
  conversation is deleted.
- **The graph auto-layout doesn't reflow after a drag.** Once you move a card it
  keeps that position, even if new siblings would now overlap it. **Reset layout**
  (Graph toolbar) is the escape hatch — it snaps every card back to auto-layout —
  but per-card reflow after a drag is still not automatic.
