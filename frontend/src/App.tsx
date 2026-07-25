import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, onStream, ready } from "./bridge";
import { resolveBranchColor } from "./colors";
import { BranchRail } from "./components/BranchRail";
import { CompareRow } from "./components/CompareRow";
import { Composer } from "./components/Composer";
import { DiffView } from "./components/DiffView";
import { GraphView } from "./components/GraphView";
import {
  IconDiff,
  IconExport,
  IconMoon,
  IconSearch,
  IconSettings,
  IconStop,
  IconSun,
} from "./components/icons";
import { Message } from "./components/Message";
import { Minimap } from "./components/Minimap";
import { ModelPicker } from "./components/ModelPicker";
import { NotesView } from "./components/NotesView";
import { SearchPalette } from "./components/SearchPalette";
import { Sessions } from "./components/Sessions";
import { Settings } from "./components/Settings";
import {
  branchRoot,
  branchesFrom,
  childrenOf,
  compareGroupFor,
  pathToRoot,
  threadTip,
  type ChildMap,
  type NodeMap,
} from "./tree";
import { useTheme } from "./useTheme";
import type {
  Attachment,
  AttachmentLink,
  ContextMode,
  DraftBranch,
  Estimate,
  ProviderInfo,
  SearchMode,
  Tab,
  Template,
  ThinkMode,
  TreeSummary,
} from "./types";

const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "graph", label: "Graph" },
  { id: "notes", label: "Notes" },
];

export default function App() {
  const { isDark, toggle: toggleTheme } = useTheme();

  const [tab, setTab] = useState<Tab>("chat");
  const [nodes, setNodes] = useState<NodeMap>({});
  const [children, setChildren] = useState<ChildMap>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftBranch | null>(null);
  const [mode, setMode] = useState<ContextMode>("path");
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});
  // Seed from the last-used choice so the picker and composer open on it.
  const lastChoice = useMemo(() => {
    try {
      const raw = localStorage.getItem("branch.model");
      return raw ? (JSON.parse(raw) as { provider: string; model: string }) : null;
    } catch {
      return null;
    }
  }, []);
  const [provider, setProvider] = useState(lastChoice?.provider ?? "anthropic");
  const [model, setModel] = useState(lastChoice?.model ?? "claude-opus-4-8");
  // Cheap-model routing: the default model for side branches, as
  // "provider/model" ("" = use the main thread's model). Kept server-side so
  // it survives restarts.
  const [branchModel, setBranchModel] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  // A set, not a single id: a multi-model fan-out has several replies streaming
  // at once, and tracking only one left the others looking frozen.
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  // Never a silent success: every clip reports what it did.
  const [clipFlash, setClipFlash] = useState<{
    n: number;
    message: string;
  } | null>(null);

  // Until the backend handshake finishes there is no tree to write into, and
  // anything sent early would be wiped when the initial tree loads.
  const [booted, setBooted] = useState(false);

  const [trees, setTrees] = useState<TreeSummary[]>([]);
  const [treeId, setTreeId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [layoutEpoch, setLayoutEpoch] = useState(0);

  const [searchMode, setSearchMode] = useState<SearchMode>("off");
  const [thinkMode, setThinkMode] = useState<ThinkMode>("auto");
  // Reasoning streamed per assistant node. Kept out of the persisted Node —
  // it's a live, ephemeral trace shown in each reply's thinking panel.
  const [thinkingById, setThinkingById] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [links, setLinks] = useState<AttachmentLink[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);

  // -- boot ---------------------------------------------------------------

  useEffect(() => {
    (async () => {
      await ready();
      try {
        const provs = await api.providers();
        setProviders(provs);
        // Ask which model to use for this session, so the active model is a
        // conscious choice rather than a default that might have no key.
        if (Object.values(provs).some((p) => p.models.length > 0)) {
          setShowModelPicker(true);
        }

        // Resume the most recent conversation rather than always opening a
        // blank one — history is the point of the sidebar.
        const existing = await api.listTrees();
        const tree = existing.length
          ? await api.openTree(existing[0].id)
          : await api.newTree("Untitled");

        setTreeId(tree.id);
        setNodes(tree.nodes ?? {});
        setChildren(tree.children ?? {});
        // Notes load per session, driven by the sessionId effect below.
        const files = await api.listAttachments();
        setAttachments(files.attachments ?? []);
        setLinks(files.links ?? []);
        setTrees(await api.listTrees());
        const settings = await api.getSettings();
        if (settings.branch_model) setBranchModel(settings.branch_model);
        setTemplates(await api.listTemplates());
      } catch (e) {
        setError(String(e));
      } finally {
        // Set even on failure: a broken backend should surface its error, not
        // leave the composer permanently disabled with no explanation.
        setBooted(true);
      }
    })();
  }, []);

  // -- streaming ----------------------------------------------------------

  useEffect(
    () =>
      onStream((e) => {
        if (e.event === "chunk") {
          setNodes((prev) => {
            const n = prev[e.node_id];
            if (!n) return prev;
            return { ...prev, [e.node_id]: { ...n, content: n.content + e.text } };
          });
        } else if (e.event === "thinking") {
          setThinkingById((prev) => ({
            ...prev,
            [e.node_id]: (prev[e.node_id] ?? "") + e.text,
          }));
        } else if (e.event === "status") {
          setStatus(e.text);
        } else if (e.event === "done") {
          setNodes((prev) => ({ ...prev, [e.node_id]: e.node }));
          setStreamingIds((prev) => {
            const next = new Set(prev);
            next.delete(e.node_id);
            return next;
          });
          setStatus(null);
        } else if (e.event === "error") {
          setError(e.message);
          setStreamingIds((prev) => {
            const next = new Set(prev);
            next.delete(e.node_id);
            return next;
          });
          setStatus(null);
        }
      }),
    [],
  );

  // -- derived ------------------------------------------------------------

  const focusPath = useMemo(
    () => (focusId ? pathToRoot(nodes, focusId) : []),
    [nodes, focusId],
  );

  // The active session = the root node the focus sits under; with nothing
  // focused, the first root, so the Notes tab always shows *a* session's doc.
  // Notes are scoped to this, not the whole conversation.
  const sessionId = useMemo(() => {
    if (focusId && nodes[focusId]) return pathToRoot(nodes, focusId)[0]?.id ?? null;
    return childrenOf(children, null)[0] ?? null;
  }, [focusId, nodes, children]);

  // A short name for the active session — its opening message — so the Notes
  // tab makes clear which session's findings it's showing.
  const sessionLabel = useMemo(() => {
    if (!sessionId || !nodes[sessionId]) return null;
    const text = nodes[sessionId].content.replace(/\s+/g, " ").trim();
    if (!text) return "Untitled session";
    return text.length > 44 ? `${text.slice(0, 44)}…` : text;
  }, [sessionId, nodes]);

  // Load the active session's notes whenever the session (or conversation)
  // changes. A conversation's sessions each keep their own findings doc.
  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setNotes("");
      return;
    }
    api
      .getNotes(sessionId)
      .then((n) => !cancelled && setNotes(n))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId, treeId]);
  const focusPathIds = useMemo(
    () => new Set(focusPath.map((n) => n.id)),
    [focusPath],
  );

  const colorFor = useCallback(
    (id: string) => {
      const root = branchRoot(nodes, id);
      return root?.color_slot != null
        ? resolveBranchColor(root.color_slot, isDark)
        : null;
    },
    [nodes, isDark],
  );

  const targetParentId = draft?.parentId ?? focusId;
  const activeMode = draft?.mode ?? mode;

  // While branching, the composer runs on the configured branch default model
  // (cheap-model routing) unless the user overrides it; the main thread keeps
  // its own choice. Everything downstream — estimate, send, the picker — reads
  // these effective values so the two never get crossed.
  const branchChoice = useMemo(() => {
    if (!branchModel) return null;
    const slash = branchModel.indexOf("/");
    if (slash < 0) return null;
    return {
      provider: branchModel.slice(0, slash),
      model: branchModel.slice(slash + 1),
    };
  }, [branchModel]);
  const effProvider = draft && branchChoice ? branchChoice.provider : provider;
  const effModel = draft && branchChoice ? branchChoice.model : model;

  // Running token spend for the open conversation. Computed from nodes already
  // in memory, so it costs nothing and updates live as replies stream in.
  // Cache reads bill at ~0.1x, so they're folded into a weighted input figure
  // rather than counted at face value.
  const tokenTotals = useMemo(() => {
    let input = 0;
    let output = 0;
    let cached = 0;
    for (const n of Object.values(nodes)) {
      const u = n.usage;
      input += u.input_tokens + u.cache_creation_input_tokens * 1.25;
      cached += u.cache_read_input_tokens;
      output += u.output_tokens;
    }
    return {
      input: Math.round(input + cached * 0.1),
      output,
      cached,
    };
  }, [nodes]);

  useEffect(() => {
    if (!Object.keys(providers).length) return;
    let cancelled = false;
    api
      .estimate({
        parentId: targetParentId,
        prompt: "",
        mode: activeMode,
        anchorText: draft?.anchorText ?? null,
        provider: effProvider,
        model: effModel,
      })
      .then((est) => !cancelled && setEstimate(est))
      .catch(() => !cancelled && setEstimate(null));
    return () => {
      cancelled = true;
    };
  }, [targetParentId, activeMode, effProvider, effModel, providers, draft?.anchorText]);

  const anyStreaming = streamingIds.size > 0;

  useEffect(() => {
    if (tab !== "chat") return;
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [focusId, anyStreaming, tab]);

  // -- actions ------------------------------------------------------------

  // The one place a turn is actually dispatched. Both the composer and
  // "regenerate" go through here so the node/child bookkeeping lives once.
  const dispatchSend = useCallback(
    async (opts: {
      parentId: string | null;
      prompt: string;
      mode: ContextMode;
      anchorText?: string | null;
      anchorNodeId?: string | null;
      provider: string;
      model: string;
      searchMode?: SearchMode;
      thinkMode?: ThinkMode;
    }) => {
      if (!booted) return;
      setError(null);
      try {
        const res = await api.send({
          parentId: opts.parentId,
          prompt: opts.prompt,
          mode: opts.mode,
          anchorText: opts.anchorText ?? null,
          anchorNodeId: opts.anchorNodeId ?? null,
          provider: opts.provider,
          model: opts.model,
          searchMode: opts.searchMode ?? "off",
          thinkMode: opts.thinkMode ?? "auto",
        });

        setNodes((prev) => ({
          ...prev,
          [res.user_node.id]: res.user_node,
          [res.assistant_node.id]: res.assistant_node,
        }));
        setChildren((prev) => {
          const next = { ...prev };
          const key = String(res.user_node.parent_id);
          next[key] = [...(next[key] ?? []), res.user_node.id];
          next[res.user_node.id] = [res.assistant_node.id];
          next[res.assistant_node.id] = [];
          return next;
        });

        setStreamingIds((prev) => new Set(prev).add(res.assistant_node.id));
        setFocusId(res.assistant_node.id);
        setDraft(null);

        // The backend titles an untitled conversation from its first message.
        if (res.title) {
          setTrees((prev) =>
            prev.map((t) => (t.id === treeId ? { ...t, title: res.title! } : t)),
          );
        }
        api.listTrees().then(setTrees).catch(() => {});
        // Deliberately no tab switch: sending from the Graph keeps you there,
        // with the reply appearing as a new card in place.
      } catch (e) {
        setError(String(e));
      }
    },
    [booted, treeId],
  );

  const send = useCallback(
    (text: string) =>
      dispatchSend({
        parentId: targetParentId,
        prompt: text,
        mode: activeMode,
        anchorText: draft?.anchorText ?? null,
        anchorNodeId: draft?.anchorNodeId ?? null,
        provider: effProvider,
        model: effModel,
        searchMode,
        thinkMode,
      }),
    [dispatchSend, targetParentId, activeMode, draft, effProvider, effModel, searchMode, thinkMode],
  );

  /**
   * Fan one question out to several models at once. Each becomes its own
   * branch, labelled and coloured by model, so the answers diverge into a
   * little tree you can compare and continue from any of.
   */
  const sendMulti = useCallback(
    async (text: string, targets: { provider: string; model: string }[]) => {
      if (!booted || targets.length === 0) return;
      const anchorNodeId = draft?.anchorNodeId ?? focusId ?? null;
      const parentId = targetParentId;
      // Sequential so each branch's colour slot is allocated distinctly and the
      // tree isn't mutated by two calls at once.
      for (const t of targets) {
        await dispatchSend({
          parentId,
          prompt: text,
          mode: activeMode,
          // The branch's identity is the model — that's what makes the strands
          // distinguishable at a glance.
          anchorText: t.model,
          anchorNodeId,
          provider: t.provider,
          model: t.model,
          searchMode,
          thinkMode,
        });
      }
      setDraft(null);
    },
    [booted, draft, focusId, targetParentId, activeMode, searchMode, thinkMode, dispatchSend],
  );

  /**
   * Re-run the question that produced a reply, as a sibling. The tree already
   * models alternatives — this asks the same thing again under the same parent,
   * so both answers hang off the original question side by side.
   */
  const regenerate = useCallback(
    (assistantId: string) => {
      const assistant = nodes[assistantId];
      if (!assistant || assistant.parent_id == null) return;
      const question = nodes[assistant.parent_id];
      if (!question || question.role !== "user") return;

      dispatchSend({
        parentId: question.parent_id,
        prompt: question.content,
        mode: question.context_mode,
        anchorText: question.anchor_text,
        anchorNodeId: question.anchor_node_id,
        provider: question.provider ?? provider,
        model: question.model ?? model,
        thinkMode,
      });
    },
    [nodes, dispatchSend, provider, model, thinkMode],
  );

  // -- attachments --------------------------------------------------------

  const addFile = useCallback(async () => {
    const res = await api.addFile();
    if (!res.ok || !res.attachments?.length) return;
    setAttachments((prev) => [...prev, ...res.attachments!]);
    // A newly added file is only useful once connected, and the connector
    // lives on the canvas.
    setTab("graph");
  }, []);

  const linkAttachment = useCallback(
    async (nodeId: string, attachmentId: string) => {
      setLinks((prev) =>
        prev.some((l) => l.node_id === nodeId && l.attachment_id === attachmentId)
          ? prev
          : [...prev, { node_id: nodeId, attachment_id: attachmentId }],
      );
      await api.linkAttachment(nodeId, attachmentId);
    },
    [],
  );

  const unlinkAttachment = useCallback(
    async (nodeId: string, attachmentId: string) => {
      setLinks((prev) =>
        prev.filter(
          (l) => !(l.node_id === nodeId && l.attachment_id === attachmentId),
        ),
      );
      await api.unlinkAttachment(nodeId, attachmentId);
    },
    [],
  );

  const deleteAttachment = useCallback(async (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setLinks((prev) => prev.filter((l) => l.attachment_id !== id));
    await api.deleteAttachment(id);
  }, []);

  const moveAttachment = useCallback((id: string, x: number, y: number) => {
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, x, y } : a)),
    );
    api.moveAttachment(id, x, y).catch(() => {});
  }, []);

  const startBranch = useCallback(
    (anchorText: string, anchorNodeId: string) =>
      setDraft({ anchorText, anchorNodeId, parentId: anchorNodeId, mode }),
    [mode],
  );

  /** Open a node's thread in the Chat tab. */
  const promote = useCallback(
    (id: string) => {
      setDraft(null);
      setFocusId(threadTip(nodes, children, id));
      setTab("chat");
    },
    [nodes, children],
  );

  /** Target a node for the on-canvas composer without leaving the Graph. */
  const selectOnGraph = useCallback((id: string) => {
    setDraft(null);
    setFocusId(id);
  }, []);

  const prune = useCallback(
    async (id: string) => {
      const res = await api.prune(id);
      const removed = new Set(res.removed);
      setNodes((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([k]) => !removed.has(k))),
      );
      setChildren((prev) => {
        const next: ChildMap = {};
        for (const [k, v] of Object.entries(prev)) {
          if (removed.has(k)) continue;
          next[k] = v.filter((c) => !removed.has(c));
        }
        return next;
      });
      if (focusId && removed.has(focusId)) setFocusId(null);
    },
    [focusId],
  );

  const toggleStar = useCallback(
    async (id: string) => {
      const next = !nodes[id]?.starred;
      // Optimistic: starring is cheap and reversible, and waiting on the
      // round trip makes the click feel broken.
      setNodes((prev) => ({ ...prev, [id]: { ...prev[id], starred: next } }));
      try {
        await api.setStarred(id, next);
      } catch {
        setNodes((prev) => ({ ...prev, [id]: { ...prev[id], starred: !next } }));
      }
    },
    [nodes],
  );

  const toggleCollapse = useCallback(
    async (id: string) => {
      const next = !nodes[id]?.collapsed;
      setNodes((prev) => ({ ...prev, [id]: { ...prev[id], collapsed: next } }));
      try {
        await api.setCollapsed(id, next);
      } catch {
        setNodes((prev) => ({ ...prev, [id]: { ...prev[id], collapsed: !next } }));
      }
    },
    [nodes],
  );

  const move = useCallback((id: string, x: number, y: number) => {
    setNodes((prev) => ({ ...prev, [id]: { ...prev[id], x, y } }));
    api.setPosition(id, x, y).catch(() => {});
  }, []);

  /** Clear every dragged position so the canvas re-runs auto-layout. */
  const resetLayout = useCallback(async () => {
    await api.resetLayout();
    setNodes((prev) => {
      const next: NodeMap = {};
      for (const [k, n] of Object.entries(prev)) next[k] = { ...n, x: null, y: null };
      return next;
    });
    setAttachments((prev) => prev.map((a) => ({ ...a, x: null, y: null })));
    // React Flow keeps its own positions across re-renders (so streaming
    // doesn't jitter the canvas); bumping this tells it to adopt the freshly
    // computed auto-layout instead.
    setLayoutEpoch((e) => e + 1);
  }, []);

  /** Clip an excerpt. Unlimited per message — several sentences from one
   *  reply is a normal thing to want. */
  const clipExcerpt = useCallback(async (nodeId: string, markdown: string) => {
    const res = await api.clipNode(nodeId, markdown, false);
    if (!res.ok) return;
    // Only refresh the visible doc when the clip landed in the session on
    // screen; a clip from another session is saved but shown when you switch.
    if (res.notes !== undefined && res.session_id === sessionId) setNotes(res.notes);
    // Merge only the clip bookkeeping. The response carries the node as the
    // backend knows it, and mid-stream that copy has no content yet — taking
    // it wholesale would blank the message you just clipped from.
    setNodes((prev) =>
      prev[nodeId]
        ? {
            ...prev,
            [nodeId]: {
              ...prev[nodeId],
              clip_count: res.node?.clip_count ?? prev[nodeId].clip_count + 1,
            },
          }
        : prev,
    );
    setSaveState("saved");
    setClipFlash({ n: Date.now(), message: "excerpt added to notes ✓" });
  }, [sessionId]);

  /** Clip a whole message. Allowed once — a repeat would duplicate the text. */
  const clipWhole = useCallback(
    async (nodeId: string) => {
      const node = nodes[nodeId];
      if (!node || node.noted) return;

      const source = node.anchor_text
        ? `branch “${node.anchor_text}”`
        : node.role;
      const md = `> ${node.content.replace(/\n/g, "\n> ")}\n>\n> — ${source}${
        node.model ? `, ${node.model}` : ""
      }`;

      const res = await api.clipNode(nodeId, md, true);
      if (res.already) {
        setClipFlash({ n: Date.now(), message: "already in notes" });
        return;
      }
      if (!res.ok) return;
      if (res.notes !== undefined && res.session_id === sessionId) setNotes(res.notes);
      // Same reasoning as clipExcerpt: merge the flag, never the content.
      setNodes((prev) =>
        prev[nodeId]
          ? { ...prev, [nodeId]: { ...prev[nodeId], noted: true } }
          : prev,
      );
      setSaveState("saved");
      setClipFlash({ n: Date.now(), message: "message added to notes ✓" });
    },
    [nodes, sessionId],
  );

  const newSession = useCallback(() => {
    // A root node is just a node with no parent; the tree already supports
    // several, so a fresh session inside the current conversation is a matter
    // of clearing the focus.
    setFocusId(null);
    setDraft(null);
    setTab("chat");
  }, []);

  // -- conversations ------------------------------------------------------

  /** Swap the whole workspace: tree, notes, and attachments. */
  const openTree = useCallback(
    async (id: string, focusNodeId: string | null = null) => {
      const tree = await api.openTree(id);
      setTreeId(tree.id);
      setNodes(tree.nodes ?? {});
      setChildren(tree.children ?? {});
      setFocusId(focusNodeId);
      setDraft(null);
      setStatus(null);
      // Notes load per session via the sessionId effect.
      const files = await api.listAttachments();
      setAttachments(files.attachments ?? []);
      setLinks(files.links ?? []);
      setTab("chat");
    },
    [],
  );

  /** Jump to a search hit — open its conversation if needed, then focus it. */
  const openSearchResult = useCallback(
    async (resultTreeId: string, nodeId: string) => {
      setShowSearch(false);
      if (resultTreeId === treeId) {
        setFocusId(nodeId);
        setTab("chat");
      } else {
        await openTree(resultTreeId, nodeId);
      }
    },
    [treeId, openTree],
  );

  const newTree = useCallback(async () => {
    const tree = await api.newTree("Untitled");
    setTreeId(tree.id);
    setNodes({});
    setChildren({});
    setFocusId(null);
    setDraft(null);
    setNotes("");
    setAttachments([]);
    setLinks([]);
    setTrees(await api.listTrees());
    setTab("chat");
  }, []);

  const renameTree = useCallback(async (id: string, title: string) => {
    setTrees((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: title || "Untitled" } : t)),
    );
    await api.renameTree(id, title);
  }, []);

  const deleteTree = useCallback(
    async (id: string) => {
      await api.deleteTree(id);
      const remaining = await api.listTrees();
      setTrees(remaining);
      // Deleting what you're looking at has to land somewhere sensible.
      if (id === treeId) {
        if (remaining.length) await openTree(remaining[0].id);
        else await newTree();
      }
    },
    [treeId, openTree, newTree],
  );

  const cancelStream = useCallback(async () => {
    // Stop every in-flight reply, so the button works during a fan-out too.
    await Promise.all([...streamingIds].map((id) => api.cancel(id)));
  }, [streamingIds]);

  const changeBranchModel = useCallback((value: string) => {
    setBranchModel(value);
    api.setSetting("branch_model", value).catch(() => {});
  }, []);

  const saveTemplate = useCallback(async (title: string, body: string) => {
    const tpl = await api.saveTemplate(title, body);
    setTemplates((prev) => [tpl, ...prev.filter((t) => t.id !== tpl.id)]);
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    await api.deleteTemplate(id);
  }, []);

  const refreshProviders = useCallback(async () => {
    setProviders(await api.refreshModels());
  }, []);

  const chooseModel = useCallback((choice: { provider: string; model: string }) => {
    setProvider(choice.provider);
    setModel(choice.model);
    try {
      localStorage.setItem("branch.model", JSON.stringify(choice));
    } catch {
      /* ignore quota/private-mode failures */
    }
    setShowModelPicker(false);
  }, []);

  // Debounced note persistence — typing shouldn't hit SQLite per keystroke.
  const saveTimer = useRef<number | undefined>(undefined);
  const editNotes = useCallback((content: string) => {
    setNotes(content);
    // No session yet (a brand-new, un-sent thread) means nowhere to save to.
    if (!sessionId) return;
    setSaveState("dirty");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState("saving");
      await api.setNotes(sessionId, content);
      setSaveState("saved");
    }, 600);
  }, [sessionId]);

  const exportNotes = useCallback(async () => {
    const res = await api.exportNotes(sessionId);
    if (res.ok && res.path) setError(null);
    else if (res.error) setError(res.error);
  }, [sessionId]);

  const exportTree = useCallback(async (id: string) => {
    const res = await api.exportTree(id);
    if (res.error) setError(res.error);
  }, []);

  /** Import a tree from JSON as a brand-new conversation, then open it. */
  const importTree = useCallback(async () => {
    const res = await api.importTree();
    if (res.cancelled) return;
    if (!res.ok || !res.id) {
      if (res.error) setError(res.error);
      return;
    }
    setTreeId(res.id);
    setNodes(res.nodes ?? {});
    setChildren(res.children ?? {});
    setFocusId(null);
    setDraft(null);
    setNotes("");
    setAttachments([]);
    setLinks([]);
    setTrees(await api.listTrees());
    setTab("chat");
  }, []);

  /** Export the currently focused thread (root → focus) as Markdown. */
  const exportBranch = useCallback(async () => {
    if (!focusId) return;
    const res = await api.exportBranch(focusId);
    if (res.error) setError(res.error);
  }, [focusId]);

  // -- clip confirmation --------------------------------------------------

  useEffect(() => {
    if (!clipFlash) return;
    const t = window.setTimeout(() => setClipFlash(null), 1800);
    return () => window.clearTimeout(t);
  }, [clipFlash]);

  // ⌘K / Ctrl-K opens search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A depth-first ordering of the tree, so j/k step through the conversation in
  // the same order the eye reads it on the canvas.
  const navOrder = useMemo(() => {
    const order: string[] = [];
    const walk = (id: string) => {
      order.push(id);
      for (const c of childrenOf(children, id)) walk(c);
    };
    for (const r of childrenOf(children, null)) walk(r);
    return order;
  }, [children]);

  // j / k move the focused node down / up that ordering. This is the on-canvas
  // keyboard navigation — held off while typing so the composer isn't hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key !== "j" && key !== "k") return;
      if (navOrder.length === 0) return;
      e.preventDefault();
      const cur = focusId ? navOrder.indexOf(focusId) : -1;
      const delta = key === "j" ? 1 : -1;
      const nextIdx =
        cur === -1
          ? key === "j"
            ? 0
            : navOrder.length - 1
          : Math.min(navOrder.length - 1, Math.max(0, cur + delta));
      setFocusId(navOrder[nextIdx]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOrder, focusId]);

  const rootIds = childrenOf(children, null);
  const visible = focusPath.length ? focusPath : rootIds.map((id) => nodes[id]);

  return (
    <div className="flex h-full">
      <Sessions
        trees={trees}
        activeId={treeId}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        onOpen={openTree}
        onNew={newTree}
        onRename={renameTree}
        onDelete={deleteTree}
        onExport={exportTree}
        onImport={importTree}
      />

      <div className="flex min-w-0 flex-1 flex-col">
      <nav className="flex items-center gap-1.5 border-b border-border px-4 py-2">
        <span className="mr-3 text-[14px] font-semibold tracking-tight">Branch</span>

        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex h-8 items-center rounded-md px-3 text-[13px] transition-colors ${
              tab === t.id
                ? "bg-ink text-on-ink"
                : "text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}

        {clipFlash && (
          <span className="ml-3 text-[12px] text-muted">{clipFlash.message}</span>
        )}

        {anyStreaming && (
          <button
            onClick={cancelStream}
            className="ml-3 flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] text-warn transition-transform hover:border-warn active:scale-95"
          >
            <IconStop className="h-3.5 w-3.5" /> Stop
            {streamingIds.size > 1 ? ` (${streamingIds.size})` : ""}
          </button>
        )}

        {tokenTotals.output > 0 && (
          <span
            className="ml-auto text-[12px] text-faint tabular-nums"
            title={
              `Tokens this conversation — input weighted for cache reads (~0.1x).\n` +
              `${tokenTotals.cached.toLocaleString()} of the input was served from cache.`
            }
          >
            ↑ {tokenTotals.input.toLocaleString()} · ↓{" "}
            {tokenTotals.output.toLocaleString()}
          </span>
        )}

        <button
          onClick={toggleTheme}
          title={isDark ? "Switch to light" : "Switch to dark"}
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          className={`${tokenTotals.output > 0 ? "ml-3" : "ml-auto"} flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-transform hover:border-ink hover:text-text active:scale-95`}
        >
          {isDark ? <IconSun className="h-4 w-4" /> : <IconMoon className="h-4 w-4" />}
        </button>

        {focusId && (
          <button
            onClick={exportBranch}
            title="Export this thread (root → here) as Markdown"
            aria-label="Export branch as Markdown"
            className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] text-muted transition-transform hover:border-ink hover:text-text active:scale-95"
          >
            <IconExport className="h-4 w-4" /> md
          </button>
        )}

        {Object.keys(nodes).length > 1 && (
          <button
            onClick={() => setShowDiff(true)}
            title="Compare two branches side by side"
            aria-label="Diff two branches"
            className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] text-muted transition-transform hover:border-ink hover:text-text active:scale-95"
          >
            <IconDiff className="h-4 w-4" /> diff
          </button>
        )}

        <button
          onClick={() => setShowSearch(true)}
          title="Search messages (⌘K)"
          aria-label="Open search"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-transform hover:border-ink hover:text-text active:scale-95"
        >
          <IconSearch className="h-[18px] w-[18px]" />
        </button>

        <button
          onClick={() => setShowSettings(true)}
          title="Settings"
          aria-label="Settings"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-transform hover:border-ink hover:text-text active:scale-95"
        >
          <IconSettings className="h-[18px] w-[18px]" />
        </button>

        <button
          onClick={newSession}
          title="Start an independent session inside this conversation"
          className="flex h-8 items-center rounded-md border border-border px-2.5 text-[13px] text-muted transition-colors hover:border-ink hover:text-text"
        >
          + New session
        </button>
      </nav>

      <div className="min-h-0 flex-1">
        {tab === "chat" && (
          <div className="flex h-full">
            <Minimap
              nodes={nodes}
              children={children}
              focusPath={focusPathIds}
              activeId={focusId}
              isDark={isDark}
              onSelect={promote}
            />

            <main className="flex min-w-0 flex-1 flex-col">
              <div ref={threadRef} className="scroll-y flex-1 px-6 py-6">
                <div className="mx-auto flex max-w-[680px] flex-col gap-6">
                  {visible.length === 0 && (
                    <p className="py-16 text-center text-[14px] leading-relaxed text-faint">
                      Ask something to begin.
                      <br />
                      Highlight any phrase in a reply to branch off it, or to
                      clip it into your notes.
                    </p>
                  )}

                  {(() => {
                    // A compare fan-out's sibling user nodes never sit
                    // together in one root→tip path, so the first member we
                    // hit renders the whole group as columns; the rest are
                    // just skipped (they're shown inside that CompareRow).
                    const skip = new Set<string>();
                    return visible.filter(Boolean).map((n) => {
                      if (skip.has(n.id)) return null;
                      if (n.role === "user") {
                        const group = compareGroupFor(nodes, children, n.id);
                        if (group) {
                          for (const m of group.members) skip.add(m.userId);
                          return (
                            <CompareRow
                              key={`cmp:${n.id}`}
                              group={group}
                              nodes={nodes}
                              colorFor={colorFor}
                              streamingIds={streamingIds}
                              onCancel={(id) => api.cancel(id)}
                              onToggleStar={toggleStar}
                              onSelectColumn={setFocusId}
                            />
                          );
                        }
                      }
                      return (
                        <Message
                          key={n.id}
                          node={n}
                          color={colorFor(n.id)}
                          streaming={streamingIds.has(n.id)}
                          thinking={thinkingById[n.id]}
                          branchCount={branchesFrom(nodes, children, n.id).length}
                          onBranch={startBranch}
                          onClipExcerpt={clipExcerpt}
                          onClipWhole={clipWhole}
                          onToggleStar={toggleStar}
                          onRegenerate={
                            n.role === "assistant" && !streamingIds.has(n.id)
                              ? regenerate
                              : undefined
                          }
                          onPrune={n.parent_id ? prune : undefined}
                          onCancel={(id) => api.cancel(id)}
                        />
                      );
                    });
                  })()}
                </div>
              </div>

              {error && (
                <div className="border-t border-border bg-sunken px-6 py-2 text-[12px] text-warn">
                  {error}
                </div>
              )}

              <Composer
                placeholder={
                  !booted
                    ? "Connecting…"
                    : draft
                      ? `Ask about “${draft.anchorText}”…`
                      : "Continue the thread…  (↵ to send, ⇧↵ for a new line)"
                }
                anchorText={draft?.anchorText}
                mode={activeMode}
                onModeChange={(m) =>
                  draft ? setDraft({ ...draft, mode: m }) : setMode(m)
                }
                provider={effProvider}
                model={effModel}
                providers={providers}
                onProviderChange={(p, m) => {
                  // While branching, changing the model sets this branch's
                  // default (and persists it); otherwise it's the main thread.
                  if (draft) {
                    changeBranchModel(`${p}/${m}`);
                  } else {
                    setProvider(p);
                    setModel(m);
                  }
                }}
                estimate={estimate}
                busy={anyStreaming || !booted}
                searchMode={searchMode}
                onSearchModeChange={setSearchMode}
                thinkMode={thinkMode}
                onThinkModeChange={setThinkMode}
                attachmentCount={attachments.length}
                onAddFile={addFile}
                status={status}
                onSend={send}
                onSendMulti={sendMulti}
                onCancel={draft ? () => setDraft(null) : undefined}
                templates={templates}
                onSaveTemplate={saveTemplate}
                onDeleteTemplate={deleteTemplate}
              />
            </main>

            <BranchRail
              nodes={nodes}
              children={children}
              focusPath={focusPath}
              isDark={isDark}
              onPromote={promote}
              onPrune={prune}
              onToggleStar={toggleStar}
              onToggleCollapse={toggleCollapse}
            />
          </div>
        )}

        {tab === "graph" && (
          <GraphView
            nodes={nodes}
            children={children}
            attachments={attachments}
            links={links}
            isDark={isDark}
            focusId={focusId}
            onSelect={selectOnGraph}
            onOpenInChat={promote}
            onToggleStar={toggleStar}
            onToggleCollapse={toggleCollapse}
            onCancel={(id) => api.cancel(id)}
            streamingIds={streamingIds}
            onMove={move}
            onResetLayout={resetLayout}
            layoutEpoch={layoutEpoch}
            onMoveAttachment={moveAttachment}
            onLink={linkAttachment}
            onUnlink={unlinkAttachment}
            onDeleteAttachment={deleteAttachment}
            onAddFile={addFile}
            onNewSession={newSession}
            onClipWhole={clipWhole}
            onSend={send}
            busy={anyStreaming || !booted}
            status={status}
            provider={effProvider}
            model={effModel}
            providers={providers}
            onProviderChange={(p, m) => {
              setProvider(p);
              setModel(m);
            }}
            targetLabel={
              !booted
                ? "Connecting…"
                : focusId && nodes[focusId]
                  ? `Continuing from: ${nodes[focusId].content.slice(0, 60) || "…"}`
                  : "New session — nothing selected. Click a card to continue from it."
            }
          />
        )}

        {tab === "notes" && (
          <NotesView
            content={notes}
            onChange={editNotes}
            onExport={exportNotes}
            saveState={saveState}
            hasSession={sessionId !== null}
            sessionLabel={sessionLabel}
            multiSession={rootIds.length > 1}
          />
        )}
      </div>

      {showModelPicker && (
        <ModelPicker
          providers={providers}
          initial={lastChoice}
          onConfirm={chooseModel}
          onOpenSettings={() => {
            setShowModelPicker(false);
            setShowSettings(true);
          }}
        />
      )}

      {showSearch && (
        <SearchPalette
          currentTreeId={treeId}
          onOpen={openSearchResult}
          onClose={() => setShowSearch(false)}
        />
      )}

      {showDiff && (
        <DiffView
          nodes={nodes}
          children={children}
          isDark={isDark}
          initialLeft={focusId}
          onClose={() => setShowDiff(false)}
        />
      )}

      {showSettings && (
        <Settings
          providers={providers}
          onSave={async (keys) => {
            setProviders(await api.setKeys(keys));
          }}
          onClose={() => setShowSettings(false)}
          onRefresh={refreshProviders}
          branchModel={branchModel}
          onBranchModelChange={changeBranchModel}
        />
      )}
      </div>
    </div>
  );
}
