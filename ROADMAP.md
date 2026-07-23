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
- **Startup model picker** — each launch asks which model to use for the
  session, pre-selecting a configured one (a key, or a running Ollama) over the
  no-key default. The choice persists. This is also the fix for "it only gives
  mock output": the mock is a browser-dev fallback, and a slow desktop start
  used to trip into it — readiness now waits on pywebview's `pywebviewready`
  event instead of racing a timer.
- **Multi-model fan-out** — the composer's `⑉ compare` ticks several models;
  one send branches the question to each, so the answers diverge into a little
  colour-coded tree (one branch per model, labelled by model) you compare and
  continue from any of. *This was a "Larger" item — the tree already modelled
  alternatives, so it fell out cleanly.*
- **Cheap-model routing for side branches** — Settings → *Cheap-model routing*
  picks a default model for new branches (point it at free local `gemma3:4b` to
  explore tangents for nothing); the main thread keeps the composer's model. The
  composer switches to the branch model while a branch draft is open, and you can
  still override it per branch.
- **Keyboard navigation — `j`/`k`** — step the focus through the whole tree in
  reading order, on the Chat thread and the canvas. Held off while typing so the
  composer isn't hijacked.
- **PDF text extraction** — attached PDFs are run through `pypdf`; the extracted
  text is inlined for the model and previewed on the card. A scanned PDF with no
  text layer says so plainly rather than faking a preview.
- **Export a branch as markdown** — `⭳ md` in the top bar writes the focused
  thread (root → here) as a Markdown transcript, exactly the path the model saw.
- **Diff two branches** — `⚖ diff` opens a side-by-side LCS line diff of any two
  branches or thread tips, colouring adds and deletes. Made for model comparison.
- **Templates / saved openings** — the composer's `⌸ templates` inserts a saved
  opening or banks the current one; they persist across restarts.
- **Better local-model search** — the inject-path search now runs through a
  relevance gate, so a local model doesn't fire a web search on a greeting, a
  rewrite, or a maths question — only when the prompt actually wants outside info.
- **Shared / exported trees** — a conversation is a portable `*.branch.json`
  (`⭳` per row in the sidebar); `⭱ Import` loads one as a fresh conversation,
  remapping ids so it never collides. Attachments and keys are deliberately left
  out of the export.
- **Cancel marks the partial reply** — a stopped reply carries a `stopped` flag,
  shown as a `⏹ stopped` badge, so a truncated answer no longer looks like a
  short one. It survives reload and is noted in the markdown export too.
- **Multi-model fan-out tracks every stream** — streaming state is a set of node
  ids now, so each fanned-out branch shows its own typing cursor and the composer
  only un-busies once the last one finishes.
- **Attachments of deleted nodes are pruned** — pruning a subtree clears the
  links of the removed messages and deletes any file left orphaned, on disk too.
- **On-canvas model picker** — the Graph composer has its own model dropdown, so
  branching from the canvas no longer silently inherits the Chat tab's model.
- **Ollama refresh without restart** — Settings → Local models has a *↻ Refresh*
  that re-scans for models pulled while the app is open.

---

## Still open

**Per-node context override.** The context mode is chosen per branch
(minimal / path / full). Pinning *specific* ancestors in or out — "include the
setup, skip the tangent" — is a finer instrument still worth building. *Medium:
a set of node IDs per branch.*

**Attachment scoping.** A file linked to a node applies to that node and
everything below. Sometimes you want it on exactly one turn. *Medium.*

**Token counts for non-Anthropic providers.** Ollama now reports real
`eval_count`/`prompt_eval_count` usage once a reply lands, but the *pre-send*
estimate for OpenAI and Ollama is still ~4 chars/token. Anthropic is exact both
ways. *Small–medium.*

---

## Larger — deferred with a reason

**Semantic clustering on the canvas.** Group branches by topic rather than by
parentage. This needs an embeddings model, and none is installed locally
(`ollama list` shows only `gemma3:4b`, which has no embedding endpoint).
Half-building it against a model that isn't there would be worse than leaving it
clearly deferred: pull an embedding model (e.g. `nomic-embed-text`) first, then
this becomes tractable. *Large.*

**Agentic branches.** A branch that runs tools and reports back, rather than just
answering. This rethinks what a node is — a node would need a tool-call
transcript, not just a message — and wants the tool-runner infrastructure the
app doesn't yet have. Deferred as a genuine design change rather than a feature
to bolt on. *Large.*

**Live collaboration.** Two people on one canvas. Almost certainly not worth it
for a personal tool, listed for completeness. *Large. (Intentionally not built.)*

---

## Known rough edges

Nothing outstanding — the two that used to live here are fixed:

- **Notes are now per session.** A session (a root node) keeps its own findings
  doc, so independent threads on one canvas no longer share notes. Clippings
  land in their node's session; the Notes tab shows the active session's doc and
  names it when more than one session exists. Legacy per-conversation notes were
  migrated onto each tree's first session on upgrade.
- **The graph reflows around dragged cards.** Every manually-dragged card is now
  registered as a fixed obstacle before auto-layout runs, so a new sibling can
  no longer land on top of a card you moved — it flows around it regardless of
  tree order. **Reset layout** still snaps everything back to auto-layout.
