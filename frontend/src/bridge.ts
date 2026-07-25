/**
 * pywebview bridge.
 *
 * Python calls back into the page via `window.__branch.emit(...)`, so we own
 * that global and fan events out to subscribers. When pywebview is absent
 * (plain `npm run dev` in a browser) we fall back to a mock so the UI is
 * developable without launching the desktop shell.
 */

import type {
  Attachment,
  AttachmentLink,
  Estimate,
  Node,
  ProviderInfo,
  SearchResult,
  Template,
  TreeData,
  TreeSummary,
} from "./types";

type StreamEvent =
  | { event: "chunk"; node_id: string; text: string }
  | { event: "thinking"; node_id: string; text: string }
  | { event: "status"; node_id: string; text: string }
  | { event: "done"; node_id: string; node: Node; cancelled?: boolean }
  | { event: "error"; node_id: string; message: string };

type Listener = (e: StreamEvent) => void;

const listeners = new Set<Listener>();

declare global {
  interface Window {
    pywebview?: { api: Record<string, (...args: unknown[]) => Promise<unknown>> };
    __branch?: { emit: (e: StreamEvent) => void };
  }
}

window.__branch = {
  emit(e) {
    listeners.forEach((fn) => fn(e));
  },
};

export function onStream(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// pywebview creates `api` before attaching its methods, so probing a real
// method is the only reliable readiness signal.
const hasPywebview = () =>
  typeof window.pywebview?.api?.providers === "function";

async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  if (!hasPywebview()) return mock<T>(method, args);
  const api = window.pywebview!.api;
  if (typeof api[method] !== "function") {
    throw new Error(`bridge method not exposed by backend: ${method}`);
  }
  return (await api[method](...args)) as T;
}

/**
 * pywebview injects its api asynchronously; wait for it before first use.
 *
 * Two signals, whichever comes first: the `pywebviewready` event pywebview
 * dispatches on window, and a poll of the api itself. Relying on the timeout
 * alone was the bug behind "it only gives mock output" — on a slow start the
 * 3s timer fired before injection, the app fell back to the browser mock, and
 * stayed there. The event makes real-app detection reliable; the poll is a
 * belt-and-suspenders fallback, and only a genuine browser (no pywebview at
 * all) reaches the timeout.
 */
export function ready(timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    if (hasPywebview()) return resolve(true);

    let settled = false;
    const finish = (value: boolean, cleanup: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const started = Date.now();
    const onReady = () => finish(true, teardown);
    const tick = setInterval(() => {
      if (hasPywebview()) return finish(true, teardown);
      const elapsed = Date.now() - started;
      // A real browser never has `window.pywebview` at all — bail out of that
      // case quickly so dev doesn't sit through the full timeout. When the
      // object exists but its api isn't bound yet (a slow desktop start), keep
      // waiting for injection or the ready event.
      if (window.pywebview === undefined && elapsed > 1500) {
        return finish(false, teardown);
      }
      if (elapsed > timeoutMs) finish(false, teardown);
    }, 50);

    function teardown() {
      clearInterval(tick);
      window.removeEventListener("pywebviewready", onReady);
    }
    window.addEventListener("pywebviewready", onReady);
  });
}

export const api = {
  providers: () => call<Record<string, ProviderInfo>>("providers"),
  refreshModels: () => call<Record<string, ProviderInfo>>("refresh_models"),
  setKeys: (keys: Record<string, string>) =>
    call<Record<string, ProviderInfo>>("set_keys", keys),
  getSettings: () => call<Record<string, string>>("get_settings"),
  setSetting: (key: string, value: string) =>
    call<Record<string, string>>("set_setting", key, value),
  listTemplates: () => call<Template[]>("list_templates"),
  saveTemplate: (title: string, body: string, id?: string) =>
    call<Template>("save_template", title, body, id ?? null),
  deleteTemplate: (id: string) => call<{ ok: boolean }>("delete_template", id),
  exportBranch: (nodeId: string) =>
    call<{ ok: boolean; path?: string; markdown?: string; cancelled?: boolean; error?: string }>(
      "export_branch",
      nodeId,
    ),
  exportTree: (treeId?: string) =>
    call<{ ok: boolean; path?: string; json?: string; cancelled?: boolean; error?: string }>(
      "export_tree",
      treeId ?? null,
    ),
  importTree: () =>
    call<{ ok: boolean; id?: string; title?: string; nodes?: Record<string, Node>; children?: Record<string, string[]>; cancelled?: boolean; error?: string }>(
      "import_tree",
    ),
  listTrees: () => call<TreeSummary[]>("list_trees"),
  renameTree: (id: string, title: string) =>
    call<{ ok: boolean }>("rename_tree", id, title),
  deleteTree: (id: string) => call<{ ok: boolean }>("delete_tree", id),
  search: (query: string, scope: "all" | "current") =>
    call<SearchResult[]>("search", query, scope),
  cancel: (nodeId: string) => call<{ ok: boolean }>("cancel", nodeId),
  newTree: (title?: string) => call<TreeData>("new_tree", title ?? "Untitled"),
  openTree: (id: string) => call<TreeData>("open_tree", id),
  prune: (nodeId: string) => call<{ removed: string[] }>("prune", nodeId),
  setStarred: (nodeId: string, starred: boolean) =>
    call<Node>("set_starred", nodeId, starred),
  setCollapsed: (nodeId: string, collapsed: boolean) =>
    call<Node>("set_collapsed", nodeId, collapsed),
  setPosition: (nodeId: string, x: number, y: number) =>
    call<{ id: string; x: number; y: number }>("set_position", nodeId, x, y),
  resetLayout: () =>
    call<{ ok: boolean; nodes: string[]; attachments: string[] }>("reset_layout"),
  getNotes: (sessionId: string | null) => call<string>("get_notes", sessionId),
  appendNote: (sessionId: string, markdown: string) =>
    call<string>("append_note", sessionId, markdown),
  clipNode: (nodeId: string, markdown: string, whole: boolean) =>
    call<{
      ok: boolean;
      already?: boolean;
      notes?: string;
      node?: Node;
      error?: string;
      session_id?: string;
    }>("clip_node", nodeId, markdown, whole),
  setNotes: (sessionId: string, content: string) =>
    call<{ ok: boolean }>("set_notes", sessionId, content),
  exportNotes: (sessionId: string | null) =>
    call<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }>(
      "export_notes",
      sessionId,
    ),
  estimate: (args: {
    parentId: string | null;
    prompt: string;
    mode: string;
    anchorText?: string | null;
    provider: string;
    model: string;
  }) =>
    call<Estimate>(
      "estimate",
      args.parentId,
      args.prompt,
      args.mode,
      args.anchorText ?? null,
      args.provider,
      args.model,
    ),
  send: (args: {
    parentId: string | null;
    prompt: string;
    mode: string;
    anchorText?: string | null;
    anchorNodeId?: string | null;
    provider: string;
    model: string;
    searchMode?: string;
    thinkMode?: string;
  }) =>
    call<{ user_node: Node; assistant_node: Node; cache_marked: boolean }>(
      "send",
      args.parentId,
      args.prompt,
      args.mode,
      args.anchorText ?? null,
      args.anchorNodeId ?? null,
      args.provider,
      args.model,
      args.searchMode ?? "off",
      args.thinkMode ?? "auto",
    ) as Promise<{
      user_node: Node;
      assistant_node: Node;
      cache_marked: boolean;
      title?: string | null;
    }>,
  addFile: () =>
    call<{ ok: boolean; attachments?: Attachment[]; cancelled?: boolean }>(
      "add_file",
    ),
  listAttachments: () =>
    call<{ attachments: Attachment[]; links: AttachmentLink[] }>(
      "list_attachments",
    ),
  linkAttachment: (nodeId: string, attachmentId: string) =>
    call<{ ok: boolean }>("link_attachment", nodeId, attachmentId),
  unlinkAttachment: (nodeId: string, attachmentId: string) =>
    call<{ ok: boolean }>("unlink_attachment", nodeId, attachmentId),
  deleteAttachment: (attachmentId: string) =>
    call<{ ok: boolean }>("delete_attachment", attachmentId),
  moveAttachment: (attachmentId: string, x: number, y: number) =>
    call<{ ok: boolean }>("move_attachment", attachmentId, x, y),
};

// -- browser dev mock -------------------------------------------------------

let mockSeq = 0;
const mockNodes: Record<string, Node> = {};

function mockNode(partial: Partial<Node>): Node {
  return {
    id: `m${++mockSeq}`,
    parent_id: null,
    role: "user",
    content: "",
    created_at: Date.now() / 1000,
    model: "claude-opus-4-8",
    provider: "anthropic",
    anchor_text: null,
    anchor_node_id: null,
    context_mode: "path",
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    collapsed: false,
    starred: false,
    noted: false,
    clip_count: 0,
    color_slot: null,
    stopped: false,
    x: null,
    y: null,
    ...partial,
  };
}

// Notes are keyed by session (root node), mirroring the real backend.
const mockNotesBySession: Record<string, string> = {};
function mockSessionOf(nodeId: string): string {
  let cur = nodeId;
  while (mockNodes[cur]?.parent_id) cur = mockNodes[cur].parent_id as string;
  return cur;
}
let mockSlot = 0;
const mockAttachments: Attachment[] = [];
const mockLinks: AttachmentLink[] = [];
const mockTrees: TreeSummary[] = [];
const mockCancelled = new Set<string>();
const mockSettings: Record<string, string> = {};
const mockTemplates: Template[] = [
  { id: "t-review", title: "Code review", body: "Review this for correctness and edge cases:\n\n" },
  { id: "t-explain", title: "Explain like I'm 5", body: "Explain this simply, no jargon:\n\n" },
];

async function mock<T>(method: string, args: unknown[]): Promise<T> {
  switch (method) {
    case "providers":
      return {
        anthropic: {
          models: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"],
          supports_caching: true,
          supports_search: true,
          capabilities: {
            "claude-opus-4-8": { vision: true, tools: true, thinking: true },
            "claude-sonnet-5": { vision: true, tools: true, thinking: true },
            "claude-haiku-4-5": { vision: true, tools: true, thinking: true },
          },
          configured: false,
          error: null,
        },
        openai: {
          models: ["gpt-5"],
          supports_caching: false,
          supports_search: true,
          capabilities: { "gpt-5": { vision: true, tools: true, thinking: false } },
          configured: false,
          error: null,
        },
        // Mirrors the real local setup: a plain vision model plus a reasoning
        // model (qwen3) that streams a separate thinking channel.
        ollama: {
          models: ["gemma3:4b", "qwen3:8b"],
          supports_caching: false,
          supports_search: true,
          capabilities: {
            "gemma3:4b": { vision: true, tools: false, thinking: false },
            "qwen3:8b": { vision: false, tools: true, thinking: true },
          },
          configured: true,
          error: null,
        },
      } as T;
    case "add_file": {
      // A tiny inline SVG thumbnail so the preview path is exercised in the
      // browser mock without needing a real file.
      const svg = encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="150">
           <rect width="260" height="150" fill="#2a78d6"/>
           <circle cx="130" cy="75" r="42" fill="#eda100"/>
         </svg>`,
      );
      const att: Attachment = {
        id: `att${++mockSeq}`,
        tree_id: "mock",
        name: "diagram.png",
        path: "/mock/diagram.png",
        mime: "image/png",
        size: 24_000,
        created_at: Date.now() / 1000,
        x: null,
        y: null,
        kind: "image",
        preview: { type: "image", data_uri: `data:image/svg+xml,${svg}` },
      };
      mockAttachments.push(att);
      return { ok: true, attachments: [att] } as T;
    }
    case "clip_node": {
      const [nodeId, md, whole] = args as [string, string, boolean];
      const node = mockNodes[nodeId];
      if (!node) return { ok: false, error: "no such node" } as T;
      if (whole && node.noted) return { ok: false, already: true, node } as T;
      const sid = mockSessionOf(nodeId);
      const cur = mockNotesBySession[sid] ?? "";
      mockNotesBySession[sid] = cur ? `${cur.trimEnd()}\n\n${md}` : md;
      const updated = whole
        ? { ...node, noted: true }
        : { ...node, clip_count: node.clip_count + 1 };
      mockNodes[nodeId] = updated;
      return {
        ok: true,
        notes: mockNotesBySession[sid],
        node: updated,
        session_id: sid,
      } as T;
    }
    case "list_attachments":
      return { attachments: mockAttachments, links: mockLinks } as T;
    case "link_attachment":
      mockLinks.push({
        node_id: args[0] as string,
        attachment_id: args[1] as string,
      });
      return { ok: true } as T;
    case "unlink_attachment":
    case "move_attachment":
      return { ok: true } as T;
    case "delete_attachment": {
      const id = args[0] as string;
      const i = mockAttachments.findIndex((a) => a.id === id);
      if (i >= 0) mockAttachments.splice(i, 1);
      return { ok: true } as T;
    }
    case "list_trees":
      return mockTrees as T;
    case "rename_tree": {
      const [id, title] = args as [string, string];
      const t = mockTrees.find((x) => x.id === id);
      if (t) t.title = title;
      return { ok: true } as T;
    }
    case "delete_tree": {
      const i = mockTrees.findIndex((x) => x.id === args[0]);
      if (i >= 0) mockTrees.splice(i, 1);
      return { ok: true } as T;
    }
    case "search": {
      const [q] = args as [string, string];
      const needle = q.trim().toLowerCase();
      if (!needle) return [] as T;
      const tree = mockTrees[0];
      const hits: SearchResult[] = [];
      for (const n of Object.values(mockNodes)) {
        const idx = n.content.toLowerCase().indexOf(needle);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 20);
        const snippet =
          (start > 0 ? "…" : "") +
          n.content.slice(start, idx) +
          "\x02" +
          n.content.slice(idx, idx + needle.length) +
          "\x03" +
          n.content.slice(idx + needle.length, idx + needle.length + 40);
        hits.push({
          node_id: n.id,
          tree_id: tree?.id ?? "mock",
          tree_title: tree?.title ?? "Untitled",
          role: n.role,
          anchor_text: n.anchor_text,
          created_at: n.created_at,
          snippet,
        });
      }
      return hits as T;
    }
    case "cancel":
      mockCancelled.add(args[0] as string);
      return { ok: true } as T;
    case "new_tree": {
      const id = `tree${++mockSeq}`;
      mockTrees.unshift({
        id,
        title: (args[0] as string) ?? "Untitled",
        created_at: Date.now() / 1000,
        updated_at: Date.now() / 1000,
        nodes: 0,
        branches: 0,
        starred: 0,
      });
      return { id, nodes: {}, children: {} } as T;
    }
    case "open_tree":
      return { id: args[0], nodes: {}, children: {} } as T;
    case "prune":
      return { removed: [] } as T;
    case "set_starred": {
      const [id, starred] = args as [string, boolean];
      mockNodes[id] = { ...mockNodes[id], starred };
      return mockNodes[id] as T;
    }
    case "set_collapsed": {
      const [id, collapsed] = args as [string, boolean];
      mockNodes[id] = { ...mockNodes[id], collapsed };
      return mockNodes[id] as T;
    }
    case "set_position":
      return { id: args[0], x: args[1], y: args[2] } as T;
    case "reset_layout": {
      const nodeIds = Object.keys(mockNodes);
      for (const id of nodeIds) mockNodes[id] = { ...mockNodes[id], x: null, y: null };
      for (const a of mockAttachments) {
        a.x = null;
        a.y = null;
      }
      return { ok: true, nodes: nodeIds, attachments: mockAttachments.map((a) => a.id) } as T;
    }
    case "get_notes": {
      const sid = args[0] as string | null;
      return (sid ? mockNotesBySession[sid] ?? "" : "") as T;
    }
    case "append_note": {
      const [sid, md] = args as [string, string];
      const cur = mockNotesBySession[sid] ?? "";
      mockNotesBySession[sid] = cur ? `${cur.trimEnd()}\n\n${md}` : md;
      return mockNotesBySession[sid] as T;
    }
    case "set_notes": {
      const [sid, content] = args as [string, string];
      if (sid) mockNotesBySession[sid] = content;
      return { ok: true } as T;
    }
    case "export_notes":
      return { ok: true, path: "/mock/findings.md" } as T;
    case "refresh_models":
      return mock<T>("providers", []);
    case "get_settings":
      return { ...mockSettings } as T;
    case "set_setting":
      mockSettings[args[0] as string] = args[1] as string;
      return { ...mockSettings } as T;
    case "list_templates":
      return mockTemplates as T;
    case "save_template": {
      const [title, body, id] = args as [string, string, string | null];
      if (id) {
        const t = mockTemplates.find((x) => x.id === id);
        if (t) {
          t.title = title;
          t.body = body;
          return t as T;
        }
      }
      const tpl: Template = { id: `tpl${++mockSeq}`, title, body };
      mockTemplates.unshift(tpl);
      return tpl as T;
    }
    case "delete_template": {
      const i = mockTemplates.findIndex((x) => x.id === args[0]);
      if (i >= 0) mockTemplates.splice(i, 1);
      return { ok: true } as T;
    }
    case "export_branch": {
      const node = mockNodes[args[0] as string];
      return { ok: true, markdown: `### Export\n\n${node?.content ?? ""}` } as T;
    }
    case "export_tree":
      return { ok: true, json: JSON.stringify({ tree: { nodes: mockNodes } }) } as T;
    case "import_tree":
      return { ok: false, cancelled: true } as T;
    case "estimate": {
      const tokens = 300 + Object.keys(mockNodes).length * 700;
      return {
        prefix_tokens: tokens,
        prefix_messages: Object.keys(mockNodes).length,
        mode: args[2] as string,
        cache:
          tokens >= 4096
            ? { cacheable: true, minimum: 4096, note: `${tokens} token prefix caches` }
            : {
                cacheable: false,
                minimum: 4096,
                note: `${tokens} token prefix is below the 4,096 minimum`,
              },
      } as T;
    }
    case "send": {
      const [
        parentId,
        prompt,
        mode,
        anchorText,
        anchorNodeId,
        ,
        ,
        searchMode,
        thinkMode,
      ] = args as [
        string | null,
        string,
        string,
        string | null,
        string | null,
        string,
        string,
        string,
        string,
      ];
      const user = mockNode({
        role: "user",
        content: prompt,
        parent_id: parentId,
        anchor_text: anchorText,
        anchor_node_id: anchorNodeId,
        context_mode: mode as Node["context_mode"],
        color_slot: anchorText ? mockSlot++ : null,
      });
      const assistant = mockNode({ role: "assistant", parent_id: user.id });
      mockNodes[user.id] = user;
      mockNodes[assistant.id] = assistant;

      if (searchMode === "on") {
        window.__branch?.emit({
          event: "status",
          node_id: assistant.id,
          text: `searching the web for “${prompt.slice(0, 40)}”…`,
        });
      }

      // Reasoning models stream a separate thinking channel before the answer;
      // mock a little of it so the thinking panel is developable in-browser.
      if (thinkMode !== "fast") {
        const thought =
          "Let me work through this. The user is asking about " +
          `“${prompt.slice(0, 30)}”. I should consider the context, weigh a ` +
          "couple of approaches, then give a direct answer.";
        let t = 0;
        const think = setInterval(() => {
          const slice = thought.slice(t, t + 6);
          t += 6;
          if (!slice) {
            clearInterval(think);
            return;
          }
          window.__branch?.emit({
            event: "thinking",
            node_id: assistant.id,
            text: slice,
          });
        }, 20);
      }

      const reply =
        "This is mock output for browser development. Launch the pywebview " +
        "shell to talk to a real model. Notice the p value mentioned here — " +
        "select it to open a branch.";
      let i = 0;
      const timer = setInterval(() => {
        if (mockCancelled.has(assistant.id)) {
          clearInterval(timer);
          mockCancelled.delete(assistant.id);
          const partial = reply.slice(0, i);
          mockNodes[assistant.id] = { ...assistant, content: partial, stopped: true };
          window.__branch?.emit({
            event: "done",
            node_id: assistant.id,
            node: mockNodes[assistant.id],
            cancelled: true,
          });
          return;
        }
        const slice = reply.slice(i, i + 4);
        i += 4;
        if (!slice) {
          clearInterval(timer);
          // Keep the mock's own store in step with what was streamed, the way
          // the real backend persists the finished message — including some
          // plausible usage so the token meter has something to show.
          mockNodes[assistant.id] = {
            ...assistant,
            content: reply,
            usage: {
              input_tokens: 120 + Math.floor(reply.length / 4),
              output_tokens: Math.ceil(reply.length / 4),
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
          };
          window.__branch?.emit({
            event: "done",
            node_id: assistant.id,
            node: mockNodes[assistant.id],
          });
          return;
        }
        window.__branch?.emit({
          event: "chunk",
          node_id: assistant.id,
          text: slice,
        });
      }, 16);

      // Auto-title on the first message, as the real backend does.
      let title: string | null = null;
      const current = mockTrees[0];
      if (current && current.title === "Untitled") {
        title = prompt.length > 48 ? `${prompt.slice(0, 47)}…` : prompt;
        current.title = title;
      }
      if (current) current.nodes += 2;

      return {
        user_node: user,
        assistant_node: assistant,
        cache_marked: true,
        title,
      } as T;
    }
    default:
      throw new Error(`no mock for ${method}`);
  }
}
