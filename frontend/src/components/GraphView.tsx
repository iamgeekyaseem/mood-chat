import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { branchDash, resolveBranchColor } from "../colors";
import { branchRoot, childrenOf, type ChildMap, type NodeMap } from "../tree";
import type { Attachment, AttachmentLink, Node, ProviderInfo } from "../types";

interface Props {
  nodes: NodeMap;
  children: ChildMap;
  attachments: Attachment[];
  links: AttachmentLink[];
  isDark: boolean;
  focusId: string | null;
  onToggleStar: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onMoveAttachment: (id: string, x: number, y: number) => void;
  onLink: (nodeId: string, attachmentId: string) => void;
  onUnlink: (nodeId: string, attachmentId: string) => void;
  onDeleteAttachment: (id: string) => void;
  onAddFile: () => void;
  onNewSession: () => void;
  onResetLayout: () => void;
  /** Bumped to force React Flow to adopt fresh auto-layout positions. */
  layoutEpoch: number;
  onClipWhole: (id: string) => void;
  onOpenInChat: (id: string) => void;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  // On-canvas composing
  onSend: (text: string) => void;
  busy: boolean;
  status?: string | null;
  targetLabel: string;
  provider: string;
  model: string;
  providers: Record<string, ProviderInfo>;
  onProviderChange: (provider: string, model: string) => void;
}

const KIND_GLYPH: Record<Attachment["kind"], string> = {
  image: "▣",
  text: "≡",
  pdf: "▤",
  other: "◈",
};

interface CardData extends Record<string, unknown> {
  node: Node;
  color: ReturnType<typeof resolveBranchColor> | null;
  onSelect: (id: string) => void;
  onOpenInChat: (id: string) => void;
  onToggleStar: (id: string) => void;
  onClipWhole: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  hiddenCount: number;
  isFocus: boolean;
}

const COL_W = 340;
// Card height is bounded by the 3-line clamp on the body; this leaves a gap
// rather than letting neighbours touch.
const ROW_H = 200;
// Collision box for a card, a little tighter than the column/row pitch so
// auto-placed nodes never sit on top of each other or on a dragged node.
const CARD_W = 280;
const CARD_H = 168;

/**
 * A conversation card on the canvas. Identity is carried by the branch label
 * plus its colour — never colour alone, which the palette validation requires
 * (yellow and magenta are sub-3:1 on the light surface, and green/yellow sit
 * in the CVD warn band on dark).
 */
function Card({ data }: NodeProps) {
  const {
    node,
    color,
    onSelect,
    onOpenInChat,
    onToggleStar,
    onClipWhole,
    onToggleCollapse,
    hiddenCount,
    isFocus,
  } = data as unknown as CardData;
  const isUser = node.role === "user";

  return (
    <div
      className="w-[260px] overflow-hidden rounded-lg border text-left shadow-sm transition-shadow hover:shadow-md"
      style={{
        background: isUser
          ? "var(--color-user-surface)"
          : "var(--color-assistant-surface)",
        borderColor: color
          ? color.fg
          : isUser
            ? "var(--color-user-border)"
            : "var(--color-assistant-border)",
        // Active state is stroke weight in neutral ink, never a competing hue.
        outline: isFocus ? "2px solid var(--color-ink)" : "none",
        outlineOffset: 2,
        // Anything already in the notes carries a persistent marker, so you
        // can see at a glance what you've already collected.
        boxShadow: node.noted ? "inset 3px 0 0 var(--color-star)" : undefined,
      }}
    >
      {/* Kept subtle rather than hidden: a fully invisible drop target is
          near-impossible to hit when dragging a file connector over. The
          canvas also runs a wide connectionRadius so a near miss still snaps. */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 10,
          height: 10,
          background: "var(--color-border)",
          border: "1px solid var(--color-surface)",
        }}
      />

      <div
        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider"
        style={{
          background: color ? color.soft : "transparent",
          color: "var(--color-muted)",
        }}
      >
        {color && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color.fg }}
            aria-hidden
          />
        )}
        <span className="truncate">
          {node.anchor_text ? `⑂ ${node.anchor_text}` : isUser ? "You" : "Reply"}
        </span>

        {(hiddenCount > 0 || node.collapsed) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(node.id);
            }}
            title={node.collapsed ? "Expand" : "Collapse — hide what follows"}
            className="shrink-0 text-[11px] leading-none text-faint hover:text-text"
          >
            {node.collapsed ? `▸ ${hiddenCount}` : "▾"}
          </button>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(node.id);
          }}
          title={node.starred ? "Unmark as important" : "Mark as important"}
          className="ml-auto shrink-0 text-[13px] leading-none"
          style={{ color: node.starred ? "var(--color-star)" : "var(--color-faint)" }}
        >
          {node.starred ? "★" : "☆"}
        </button>
      </div>

      {/* Selecting a card targets it for the on-canvas composer; it no longer
          throws you over to the Chat tab. */}
      <button
        onClick={() => onSelect(node.id)}
        className="block w-full px-3 py-2 text-left"
      >
        <p className="line-clamp-3 text-[12px] leading-relaxed text-text">
          {node.content || <span className="text-faint">…</span>}
        </p>
      </button>

      <div className="flex items-center gap-2 px-3 pb-2 text-[10px] text-faint">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenInChat(node.id);
          }}
          className="hover:text-text"
        >
          ↗ chat
        </button>

        {node.clip_count > 0 && !node.noted && (
          <span title={`${node.clip_count} excerpt(s) clipped from this message`}>
            ✎ {node.clip_count}
          </span>
        )}

        {/* Adding the whole message twice would just duplicate the text, so
            once it's in, the control reports that instead of repeating. */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!node.noted) onClipWhole(node.id);
          }}
          disabled={node.noted}
          title={
            node.noted
              ? "This message is already in your notes"
              : "Add this whole message to notes"
          }
          className={
            node.noted
              ? "ml-auto cursor-not-allowed opacity-60"
              : "ml-auto hover:text-text"
          }
          style={node.noted ? { color: "var(--color-star)" } : undefined}
        >
          {node.noted ? "in notes ✓" : "+ notes"}
        </button>
      </div>

      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

interface FileData extends Record<string, unknown> {
  attachment: Attachment;
  linkCount: number;
  onDelete: (id: string) => void;
}

/**
 * A file on the canvas. Its source handle is deliberately visible and large —
 * dragging from it to a message is the whole interaction, and an invisible
 * handle would make the feature undiscoverable.
 */
function FileCard({ data }: NodeProps) {
  const { attachment, linkCount, onDelete } = data as unknown as FileData;
  const kb = Math.max(1, Math.round(attachment.size / 1024));
  const p = attachment.preview;

  return (
    <div className="w-[220px] overflow-hidden rounded-lg border border-dashed border-border bg-surface shadow-sm">
      {p?.type === "image" && (
        <img
          src={p.data_uri}
          alt={`Preview of ${attachment.name}`}
          className="block max-h-[130px] w-full bg-sunken object-cover"
          draggable={false}
        />
      )}

      {p?.type === "text" && (
        <pre className="max-h-[110px] overflow-hidden border-b border-border bg-sunken px-3 py-2 font-mono text-[9px] leading-snug text-muted">
          {p.text}
        </pre>
      )}

      {/* PDFs and unknown types say so plainly rather than showing a fake
          preview — rendering a PDF page needs a native dependency we don't
          carry. */}
      {p?.type === "none" && (
        <div className="flex h-[64px] items-center justify-center border-b border-border bg-sunken text-[10px] text-faint">
          {p.note}
        </div>
      )}

      {p?.type === "missing" && (
        <div className="flex h-[64px] items-center justify-center border-b border-border bg-sunken text-[10px] text-warn">
          file missing
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[15px] leading-none text-muted" aria-hidden>
          {KIND_GLYPH[attachment.kind]}
        </span>
        <span className="truncate text-[12px] font-medium" title={attachment.name}>
          {attachment.name}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(attachment.id);
          }}
          className="ml-auto text-[11px] text-faint hover:text-warn"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 pb-2 text-[10px] text-faint">
        <span>{attachment.kind}</span>
        <span>{kb} KB</span>
        <span className="ml-auto">
          {linkCount === 0
            ? "drag ↓ to a message"
            : `${linkCount} link${linkCount === 1 ? "" : "s"}`}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 12,
          height: 12,
          background: "var(--color-ink)",
          border: "2px solid var(--color-surface)",
        }}
      />
    </div>
  );
}

const nodeTypes = { card: Card, file: FileCard };

export function GraphView({
  nodes,
  children,
  attachments,
  links,
  isDark,
  focusId,
  onToggleStar,
  onMove,
  onMoveAttachment,
  onLink,
  onUnlink,
  onDeleteAttachment,
  onAddFile,
  onNewSession,
  onResetLayout,
  layoutEpoch,
  onClipWhole,
  onOpenInChat,
  onSelect,
  onToggleCollapse,
  onSend,
  busy,
  status,
  targetLabel,
  provider,
  model,
  providers,
  onProviderChange,
}: Props) {
  const [draft, setDraft] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const activeProviders = Object.entries(providers).filter(
    ([, info]) => info.models.length > 0,
  );

  /**
   * Card callbacks, pinned to stable identities.
   *
   * These handlers close over `nodes`, so their identity changes on every
   * message update — including every streamed chunk. Feeding that churn into
   * the node memo made React Flow rebuild its node array constantly, which
   * discarded the measurements it uses to decide visibility and left every
   * card `visibility: hidden`. Routing through a ref keeps the memo stable.
   */
  const latest = useRef({
    onSelect,
    onOpenInChat,
    onToggleStar,
    onClipWhole,
    onToggleCollapse,
    onDeleteAttachment,
  });
  latest.current = {
    onSelect,
    onOpenInChat,
    onToggleStar,
    onClipWhole,
    onToggleCollapse,
    onDeleteAttachment,
  };

  const stable = useMemo(
    () => ({
      onSelect: (id: string) => latest.current.onSelect(id),
      onOpenInChat: (id: string) => latest.current.onOpenInChat(id),
      onToggleStar: (id: string) => latest.current.onToggleStar(id),
      onClipWhole: (id: string) => latest.current.onClipWhole(id),
      onToggleCollapse: (id: string) => latest.current.onToggleCollapse(id),
      onDeleteAttachment: (id: string) => latest.current.onDeleteAttachment(id),
    }),
    [],
  );

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || busy) return;
    onSend(text);
    setDraft("");
  }, [draft, busy, onSend]);
  const { flowNodes, flowEdges } = useMemo(() => {
    const laid: FlowNode[] = [];
    const edges: Edge[] = [];

    // Per-column cursors. A single global row counter let a tall card in one
    // column overlap the next card in another; tracking the next free y per
    // column, and keeping children below their parent, prevents both.
    const nextFreeY: Record<number, number> = {};

    // Every card box already placed (auto or dragged). New auto cards test
    // against these and slide down until they're clear, so nothing ever lands
    // completely on top of another node — including a card the user dragged.
    const placed: { x: number; y: number }[] = [];
    const collides = (x: number, y: number) =>
      placed.some(
        (p) => Math.abs(p.x - x) < CARD_W && Math.abs(p.y - y) < CARD_H,
      );
    const resolve = (x: number, y: number) => {
      let yy = y;
      let guard = 0;
      while (collides(x, yy) && guard++ < 200) yy += ROW_H / 2;
      return yy;
    };

    const colorFor = (n: Node) => {
      const root = branchRoot(nodes, n.id);
      return root?.color_slot != null
        ? resolveBranchColor(root.color_slot, isDark)
        : null;
    };

    // A branch's whole strand shares one dash pattern (keyed to its colour
    // slot); the main spine has none (solid). Two nearby branches are then
    // distinguishable by line style, not colour alone.
    const dashFor = (n: Node): string | undefined => {
      const root = branchRoot(nodes, n.id);
      return root?.color_slot != null ? branchDash(root.color_slot) : undefined;
    };

    // Filtering to starred keeps each starred node's ancestors too — a node
    // with its lineage cut away loses the context that made it worth starring.
    const keep = new Set<string>();
    if (starredOnly) {
      for (const n of Object.values(nodes)) {
        if (!n.starred) continue;
        let cur: string | null = n.id;
        while (cur && nodes[cur] && !keep.has(cur)) {
          keep.add(cur);
          cur = nodes[cur].parent_id;
        }
      }
    }
    const visible = (id: string) => !starredOnly || keep.has(id);

    // Descendants of a node, for the "N hidden" badge on a collapsed card.
    const descendantCount = (id: string): number => {
      let n = 0;
      for (const c of childrenOf(children, id)) {
        n += 1 + descendantCount(c);
      }
      return n;
    };

    const visit = (id: string, col: number, parentY: number) => {
      const node = nodes[id];
      if (!node || !visible(id)) return;
      const color = colorFor(node);

      const dragged = node.x != null && node.y != null;
      const baseX = dragged ? node.x! : col * COL_W;
      const baseY = dragged
        ? node.y!
        : resolve(col * COL_W, Math.max(parentY + ROW_H, nextFreeY[col] ?? 0));
      if (!dragged) nextFreeY[col] = baseY + ROW_H;
      // Reserve this card's box so later cards steer around it.
      placed.push({ x: baseX, y: baseY });
      const y = baseY;

      laid.push({
        id,
        type: "card",
        position: { x: baseX, y: baseY },
        data: {
          node,
          color,
          onSelect: stable.onSelect,
          onOpenInChat: stable.onOpenInChat,
          onToggleStar: stable.onToggleStar,
          onClipWhole: stable.onClipWhole,
          onToggleCollapse: stable.onToggleCollapse,
          hiddenCount: descendantCount(id),
          isFocus: id === focusId,
        } satisfies CardData,
      });

      // A collapsed node keeps its card but hides everything below it.
      if (node.collapsed) return;

      const kids = childrenOf(children, id)
        .map((c) => nodes[c])
        .filter((k) => k && visible(k.id));
      const spine = kids.filter((k) => !k.anchor_text);
      const forks = kids.filter((k) => k.anchor_text);

      for (const k of spine) {
        // A continuation inside a branch carries that branch's colour AND its
        // dash pattern, so the whole strand reads as one coloured, styled
        // thread. The main spine (no branch colour) stays a solid neutral grey.
        const kc = colorFor(k);
        edges.push({
          id: `${id}-${k.id}`,
          source: id,
          target: k.id,
          style: {
            stroke: kc?.fg ?? "var(--color-border)",
            strokeWidth: kc ? 2.5 : 2,
            strokeDasharray: dashFor(k),
          },
        });
        visit(k.id, col, y);
      }
      // Each sibling fork gets its own column so parallel branches read as
      // parallel; stacking them in one column made three branches look like a
      // single chain.
      forks.forEach((k, forkIndex) => {
        const kc = colorFor(k);
        edges.push({
          id: `${id}-${k.id}`,
          source: id,
          target: k.id,
          animated: false,
          style: {
            stroke: kc?.fg ?? "var(--color-border)",
            strokeWidth: 2,
            // Each branch's own dash pattern — colour + line style together.
            strokeDasharray: dashFor(k) ?? "5 3",
          },
        });
        visit(k.id, col + 1 + forkIndex, y);
      });
    };

    // Pin every manually-dragged card as an obstacle up front — before any
    // auto card is placed. `visit` reserves boxes as it walks the tree, so a
    // dragged card only became an obstacle once traversal reached it; a sibling
    // visited earlier could still land on top of it. Seeding all dragged
    // positions here means every auto-placed card flows around every dragged
    // card regardless of tree order, which is the reflow-after-a-drag fix.
    for (const n of Object.values(nodes)) {
      if (n.x != null && n.y != null && visible(n.id)) {
        placed.push({ x: n.x, y: n.y });
      }
    }

    // Multiple roots: each is an independent session, given its own column
    // band so playground sessions never tangle with each other.
    let band = 0;
    for (const rootId of childrenOf(children, null)) {
      visit(rootId, band, -ROW_H);
      band = Math.max(...Object.keys(nextFreeY).map(Number)) + 2;
    }

    // Files sit in a band to the left of the conversation so they read as
    // inputs feeding in, rather than as part of any one thread.
    attachments.forEach((att, i) => {
      const linkCount = links.filter((l) => l.attachment_id === att.id).length;
      laid.push({
        id: `att:${att.id}`,
        type: "file",
        position:
          att.x != null && att.y != null
            ? { x: att.x, y: att.y }
            : { x: -COL_W - 40, y: i * 120 },
        data: { attachment: att, linkCount, onDelete: stable.onDeleteAttachment },
      });
    });

    for (const link of links) {
      if (!nodes[link.node_id] || !visible(link.node_id)) continue;
      edges.push({
        id: `att:${link.attachment_id}->${link.node_id}`,
        source: `att:${link.attachment_id}`,
        target: link.node_id,
        style: {
          stroke: "var(--color-muted)",
          strokeWidth: 1.5,
          strokeDasharray: "2 3",
        },
      });
    }

    return { flowNodes: laid, flowEdges: edges };
  }, [
    nodes,
    children,
    attachments,
    links,
    isDark,
    focusId,
    stable,
    starredOnly,
  ]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(flowNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Merge rather than replace. React Flow stores measured dimensions on the
  // node objects and keeps a node hidden until it has them, so swapping in
  // fresh objects on every update would blank the canvas. Carrying the old
  // object forward also preserves a position the user dragged.
  //
  // Reset layout is the exception: bumping `layoutEpoch` makes this take the
  // freshly computed position instead of the preserved one, so "reset" visibly
  // snaps every card back to auto-layout.
  const prevEpoch = useRef(layoutEpoch);
  useEffect(() => {
    const forcePositions = prevEpoch.current !== layoutEpoch;
    prevEpoch.current = layoutEpoch;
    setRfNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      return flowNodes.map((next) => {
        const old = byId.get(next.id);
        if (!old) return next;
        return {
          ...old,
          data: next.data,
          position: forcePositions ? next.position : old.position,
        };
      });
    });
  }, [flowNodes, setRfNodes, layoutEpoch]);

  useEffect(() => setRfEdges(flowEdges), [flowEdges, setRfEdges]);

  const handleDragStop = useCallback(
    (_: unknown, node: FlowNode) => {
      if (node.id.startsWith("att:")) {
        onMoveAttachment(node.id.slice(4), node.position.x, node.position.y);
      } else {
        onMove(node.id, node.position.x, node.position.y);
      }
    },
    [onMove, onMoveAttachment],
  );

  // Connecting a file to a message is the attach gesture. Only that direction
  // means anything, so anything else is dropped rather than drawn.
  const handleConnect = useCallback(
    (conn: { source?: string | null; target?: string | null }) => {
      const { source, target } = conn;
      if (!source?.startsWith("att:") || !target || target.startsWith("att:")) return;
      onLink(target, source.slice(4));
    },
    [onLink],
  );

  const handleEdgesDelete = useCallback(
    (removed: Edge[]) => {
      for (const e of removed) {
        if (e.source.startsWith("att:")) {
          onUnlink(e.target, e.source.slice(4));
        }
      }
    },
    [onUnlink],
  );

  return (
    <div className="relative h-full w-full">
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <button
          onClick={onNewSession}
          className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-on-ink shadow-sm"
        >
          + New session
        </button>
        <button
          onClick={onAddFile}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] font-medium shadow-sm hover:border-ink"
        >
          + Add file
        </button>
        <button
          onClick={() => setStarredOnly((v) => !v)}
          title="Show only starred nodes and their ancestors"
          className={`rounded-md border px-3 py-1.5 text-[12px] font-medium shadow-sm ${
            starredOnly
              ? "border-transparent bg-ink text-on-ink"
              : "border-border bg-surface hover:border-ink"
          }`}
        >
          ★ Starred only
        </button>
        <button
          onClick={onResetLayout}
          title="Snap every card back to the automatic layout"
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] font-medium shadow-sm hover:border-ink"
        >
          ⤢ Reset layout
        </button>
      </div>

      {flowNodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="max-w-[320px] text-center text-[14px] leading-relaxed text-faint">
            An empty playground. Start a session here, or switch to Chat and ask
            something — everything you branch will lay itself out on this canvas.
          </p>
        </div>
      )}

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleDragStop}
        onConnect={handleConnect}
        onEdgesDelete={handleEdgesDelete}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={1.8}
        // Generous snap: dropping a file connector near a card counts as
        // hitting it, which matters because the drop target is deliberately
        // unobtrusive.
        connectionRadius={60}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={isDark ? "#34322d" : "#e6e2da"}
        />
        <Controls showInteractive={false} />
      </ReactFlow>

      {/* Compose without leaving the canvas. Replies land as new cards right
          here, so the graph is a place to work rather than an overview you
          have to leave to do anything. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4">
        <div className="pointer-events-auto w-full max-w-[680px] rounded-xl border border-border bg-surface p-2.5 shadow-lg">
          <div className="mb-1.5 flex items-center gap-2 px-1 text-[11px] text-faint">
            <span className="truncate">{targetLabel}</span>
            {status && (
              <span className="ml-auto flex items-center gap-1.5 text-muted">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
                {status}
              </span>
            )}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter is the newline.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
                // The canvas binds plain keys for pan/zoom; stop them here so
                // typing in the composer never moves the viewport.
                e.stopPropagation();
              }}
              rows={2}
              placeholder="Ask here…  (↵ to send, ⇧↵ for a new line)"
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-[14px] leading-relaxed outline-none placeholder:text-faint focus:border-ink"
            />
            <button
              onClick={submit}
              disabled={busy || !draft.trim()}
              className="shrink-0 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-on-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "…" : "Send"}
            </button>
          </div>

          {/* The on-canvas composer picks a model too, so branching from the
              graph no longer silently uses whatever the Chat tab last set. */}
          {activeProviders.length > 0 && (
            <div className="mt-1.5 flex px-1">
              <select
                value={`${provider}:${model}`}
                onChange={(e) => {
                  const idx = e.target.value.indexOf(":");
                  onProviderChange(
                    e.target.value.slice(0, idx),
                    e.target.value.slice(idx + 1),
                  );
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted outline-none hover:border-ink"
              >
                {activeProviders.map(([name, info]) => (
                  <optgroup key={name} label={name}>
                    {info.models.map((m) => (
                      <option key={m} value={`${name}:${m}`}>
                        {m}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
