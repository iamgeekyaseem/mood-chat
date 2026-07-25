/** Client-side mirror of backend/tree.py traversal, plus minimap layout. */

import type { Node, TreeData } from "./types";

export type NodeMap = Record<string, Node>;
export type ChildMap = Record<string, string[]>;

export function childrenOf(children: ChildMap, id: string | null): string[] {
  return children[id ?? "None"] ?? children[String(id)] ?? [];
}

export function pathToRoot(nodes: NodeMap, id: string): Node[] {
  const out: Node[] = [];
  let cur: string | null = id;
  while (cur && nodes[cur]) {
    out.push(nodes[cur]);
    cur = nodes[cur].parent_id;
  }
  return out.reverse();
}

/** A branch is a child that opened a new line of questioning. */
export function branchesFrom(
  nodes: NodeMap,
  children: ChildMap,
  id: string,
): Node[] {
  return childrenOf(children, id)
    .map((c) => nodes[c])
    .filter((n): n is Node => Boolean(n?.anchor_text));
}

/** The child that continues the thread rather than forking it. */
export function mainChild(
  nodes: NodeMap,
  children: ChildMap,
  id: string,
): Node | null {
  for (const c of childrenOf(children, id)) {
    const n = nodes[c];
    if (n && !n.anchor_text) return n;
  }
  return null;
}

/** Walk from `id` down the non-branching spine to the end of its thread. */
export function threadTip(
  nodes: NodeMap,
  children: ChildMap,
  id: string,
): string {
  let cur = id;
  for (;;) {
    const next = mainChild(nodes, children, cur);
    if (!next) return cur;
    cur = next.id;
  }
}

/** Root of the branch `id` belongs to — the nearest ancestor with an anchor. */
export function branchRoot(nodes: NodeMap, id: string): Node | null {
  let cur: string | null = id;
  while (cur && nodes[cur]) {
    if (nodes[cur].anchor_text) return nodes[cur];
    cur = nodes[cur].parent_id;
  }
  return null;
}

export interface CompareGroup {
  parentId: string | null;
  prompt: string;
  /** One entry per model column, in creation order. */
  members: { userId: string; assistantId: string | null; model: string | null }[];
}

/**
 * Group sibling user nodes produced by the same `sendMulti` fan-out: same
 * parent, same prompt text, same `anchor_node_id` (including a shared root
 * session where it's null on every member), created within a minute of each
 * other. That shape is unique to a fan-out — a single re-ask never repeats
 * the same parent+content+anchor_node_id — so no extra persisted field is
 * needed to detect it.
 */
export function compareGroupFor(
  nodes: NodeMap,
  children: ChildMap,
  userId: string,
): CompareGroup | null {
  const u = nodes[userId];
  if (!u || u.role !== "user") return null;

  const siblings = childrenOf(children, u.parent_id)
    .map((id) => nodes[id])
    .filter(
      (n): n is Node =>
        Boolean(n) &&
        n.role === "user" &&
        n.anchor_node_id === u.anchor_node_id &&
        n.content === u.content &&
        Math.abs(n.created_at - u.created_at) < 60,
    )
    .sort((a, b) => a.created_at - b.created_at);

  if (siblings.length < 2) return null;

  return {
    parentId: u.parent_id,
    prompt: u.content,
    members: siblings.map((s) => {
      const assistantId =
        childrenOf(children, s.id).find((c) => nodes[c]?.role === "assistant") ??
        null;
      return { userId: s.id, assistantId, model: s.model };
    }),
  };
}

// -- minimap layout ---------------------------------------------------------

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  isBranch: boolean;
  role: Node["role"];
}

export interface Layout {
  nodes: LaidOutNode[];
  edges: { from: string; to: string; isBranch: boolean }[];
  width: number;
  height: number;
}

// Spacing tuned for the 184px rail: wide enough that a fork visibly steps
// right, tight enough that a 40-node tree still fits without scrolling.
const COL = 22;
const ROW = 18;

/**
 * Depth-first layout: x from branch depth, y from visit order. Keeps the main
 * spine in a straight vertical line so the eye can follow it, with forks
 * stepping right.
 */
export function layoutTree(nodes: NodeMap, children: ChildMap): Layout {
  const laid: LaidOutNode[] = [];
  const edges: Layout["edges"] = [];
  let row = 0;
  let maxCol = 0;

  const visit = (id: string, col: number) => {
    const node = nodes[id];
    if (!node) return;

    laid.push({
      id,
      x: col * COL + 10,
      y: row * ROW + 10,
      isBranch: Boolean(node.anchor_text),
      role: node.role,
    });
    row += 1;
    maxCol = Math.max(maxCol, col);

    // Spine first so it stays visually contiguous, then forks to the right.
    const kids = childrenOf(children, id).map((c) => nodes[c]).filter(Boolean);
    const spine = kids.filter((k) => !k.anchor_text);
    const forks = kids.filter((k) => k.anchor_text);

    for (const k of spine) {
      edges.push({ from: id, to: k.id, isBranch: false });
      visit(k.id, col);
    }
    for (const k of forks) {
      edges.push({ from: id, to: k.id, isBranch: true });
      visit(k.id, col + 1);
    }
  };

  for (const rootId of childrenOf(children, null)) visit(rootId, 0);

  return {
    nodes: laid,
    edges,
    width: (maxCol + 1) * COL + 20,
    height: row * ROW + 20,
  };
}

// -- turn-collapsed layout (minimap) ----------------------------------------

/**
 * A turn is one exchange: a user question and the assistant reply it produced.
 * The tree stores those as two nodes, but on the minimap they read better as a
 * single dot — one dot per question-and-answer.
 */
export interface LaidOutTurn {
  /** Layout key — the user node that opens the turn. */
  key: string;
  /** Node to focus when the dot is clicked (the reply, or the question if the
   *  reply hasn't arrived yet). */
  selectId: string;
  /** Both underlying node ids, for focus/active/starred membership tests. */
  memberIds: string[];
  x: number;
  y: number;
  isBranch: boolean;
  starred: boolean;
}

export interface TurnLayout {
  nodes: LaidOutTurn[];
  edges: { from: string; to: string; isBranch: boolean }[];
  width: number;
  height: number;
}

/**
 * Same depth-first shape as `layoutTree`, but each user→assistant pair collapses
 * to one dot. Edges connect turns; a turn's children are the user nodes hanging
 * off its reply (continuations stay in-column, branches step right).
 */
export function layoutTurns(nodes: NodeMap, children: ChildMap): TurnLayout {
  const laid: LaidOutTurn[] = [];
  const edges: TurnLayout["edges"] = [];
  let row = 0;
  let maxCol = 0;

  const assistantOf = (userId: string): Node | null => {
    for (const c of childrenOf(children, userId)) {
      if (nodes[c]?.role === "assistant") return nodes[c];
    }
    return null;
  };

  // The next turns after this one are the user nodes that hang off its reply.
  const childUserNodes = (userId: string): Node[] => {
    const a = assistantOf(userId);
    if (!a) return [];
    return childrenOf(children, a.id)
      .map((c) => nodes[c])
      .filter((n): n is Node => Boolean(n) && n.role === "user");
  };

  const visit = (userId: string, col: number) => {
    const u = nodes[userId];
    if (!u) return;
    const a = assistantOf(userId);

    laid.push({
      key: userId,
      selectId: a?.id ?? userId,
      memberIds: a ? [userId, a.id] : [userId],
      x: col * COL + 10,
      y: row * ROW + 10,
      isBranch: Boolean(u.anchor_text),
      starred: Boolean(u.starred) || Boolean(a?.starred),
    });
    row += 1;
    maxCol = Math.max(maxCol, col);

    const kids = childUserNodes(userId);
    const spine = kids.filter((k) => !k.anchor_text);
    const forks = kids.filter((k) => k.anchor_text);

    for (const k of spine) {
      edges.push({ from: userId, to: k.id, isBranch: false });
      visit(k.id, col);
    }
    for (const k of forks) {
      edges.push({ from: userId, to: k.id, isBranch: true });
      visit(k.id, col + 1);
    }
  };

  // Roots are user nodes (an exchange always opens with a question).
  for (const rootId of childrenOf(children, null)) {
    if (nodes[rootId]?.role === "user") visit(rootId, 0);
  }

  return {
    nodes: laid,
    edges,
    width: (maxCol + 1) * COL + 20,
    height: row * ROW + 20,
  };
}

export function fromTreeData(data: TreeData): {
  nodes: NodeMap;
  children: ChildMap;
} {
  return { nodes: data.nodes ?? {}, children: data.children ?? {} };
}
