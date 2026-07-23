# Security review

Reviewed 2026-07-23. Scope: the whole app — the JS↔Python bridge, filesystem
access, key storage, web content handling, SQL, and client-side rendering.

The threat model that matters for a local desktop app like this: the renderer
displays **model output** and, with web search on, **untrusted text from
arbitrary web pages**. Any path from that content to code execution or the
filesystem is the thing to worry about, because the JS side can call every
Python bridge method.

## Findings and fixes

### 1. Path traversal → arbitrary file/directory deletion (Critical — fixed)

`delete_tree`, `add_file`, and `open_tree` took a `tree_id` from the frontend
and used it as a filesystem path component (`~/.branch/files/<tree_id>/…`).
A `tree_id` of `../../Documents` escaped the app directory; `delete_tree` would
then `unlink` every file in that directory and `rmdir` it. Confirmed with a
proof-of-concept.

Because the bridge is reachable from page JS, any XSS in the rendered content
would escalate this to remote arbitrary file deletion.

**Fix:** all ids are validated at the boundary (`ids.require_id`) against
`^[0-9a-f]{8,64}$` — the format they're minted in — so nothing with `/`, `.`,
or `\` reaches the filesystem. On top of that, `_files_dir` resolves the path
and re-checks containment within `~/.branch/files`, and `_safe_unlink` refuses
to delete anything outside it. Belt and suspenders. Tests:
`test_security.py::test_traversal_and_malformed_ids_are_rejected`,
`::test_files_dir_rejects_traversal`, `::test_safe_unlink_only_touches_app_files`.

### 2. Fragile JS injection via `evaluate_js` (Medium — fixed)

Streamed output was delivered to the page with
`evaluate_js(f"…emit({json.dumps(payload)})")`. That was safe only because
`json.dumps` defaults to `ensure_ascii=True`; a later `ensure_ascii=False`, or
a backend quirk, could let model/web content break out of the JS string.

**Fix:** the payload is now base64-encoded and the page decodes it
(`emit(JSON.parse(atob("…")))`). Base64 is `[A-Za-z0-9+/=]` — it cannot
terminate a JS string, so no payload content can break out, regardless of
escaping settings. No `eval`/`unsafe-eval` involved. Test:
`::test_emit_payload_is_inert_base64` throws the classic breakout characters at
it and confirms they never appear literally in the emitted JS.

### 3. Missing `tree_id` guards (Medium — fixed)

Filesystem methods assumed `self.tree_id` was set. After deleting the last
conversation it can be `None`. `add_file` now returns a clean error instead of
crashing on a `None` path component.

### 4. No Content-Security-Policy (Low — fixed)

React escapes by default and the single raw-HTML sink is highlight.js output
(which escapes the code it renders), so there is **no known XSS**. A CSP was
added anyway as defense in depth: `default-src 'none'` with `script-src 'self'`
(no inline/third-party scripts, no eval), `img-src data:` for thumbnails,
`style-src 'unsafe-inline'` for React inline styles, and a `connect-src` limited
to localhost. It caps the blast radius of any future slip and blocks
exfiltration. Verified the app runs fully under it.

### 5. SSRF in `fetch_page` (Low — fixed, though the function is unused)

`fetch_page` fetched any URL a page named — including `localhost`,
`169.254.169.254` (cloud metadata), and internal ranges. It's currently dead
code, but rather than leave a landmine, it now resolves the host and refuses
anything that isn't a global address, and re-validates each redirect hop
instead of following blindly. Test: `::test_ssrf_targets_are_rejected`.

## Reviewed and found OK

- **SQL** — every query in `store.py` is parameterized, including the dynamic
  `IN (…)` lists (placeholders, not string interpolation). No injection.
- **highlight.js `dangerouslySetInnerHTML`** — the only raw-HTML sink; input is
  `hljs.highlight(code).value`, which HTML-escapes the source. Safe.
- **Markdown links** — rendered as plain text, not `<a href>`, so a model can't
  plant a clickable link to a hostile or `file://` URL.
- **`keys.json`** — written `0o600`. Also resolves `ANTHROPIC_API_KEY` / an
  `ant auth login` profile, so a key need not be stored at all.
- **Attachment paths** — stored values are backend-generated
  (`~/.branch/files/<id>_<basename>`); the picker's filename is reduced to its
  basename before use.
- **Web search results** — wrapped in an envelope that names them as untrusted
  reference material so a page saying "ignore your instructions" reads as quoted
  content, not a command (prompt-injection mitigation, not elimination).

## Residual risks (accepted for a local single-user tool)

- **Prompt injection** via web-search content and attachments is mitigated by
  framing, not eliminated — inherent to putting untrusted text in a prompt.
- **`~/.branch/` directory permissions** follow the user's umask; only
  `keys.json` is explicitly `0o600`. On a shared machine, tighten the umask.
- **No sandboxing of the model** — a local model runs with the app's
  privileges. Expected for a desktop tool.
