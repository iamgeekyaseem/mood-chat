import { resolveBranchColor } from "../colors";
import { branchesFrom, childrenOf, type ChildMap, type NodeMap } from "../tree";
import type { Node } from "../types";

interface Props {
  nodes: NodeMap;
  children: ChildMap;
  focusPath: Node[];
  isDark: boolean;
  onPromote: (id: string) => void;
  onPrune: (id: string) => void;
  onToggleStar: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

/** The branch the centre column is currently showing, if any. */
function activeBranchId(focusPath: Node[]): string | null {
  for (let i = focusPath.length - 1; i >= 0; i--) {
    if (focusPath[i].anchor_text) return focusPath[i].id;
  }
  return null;
}

export function BranchRail({
  nodes,
  children,
  focusPath,
  isDark,
  onPromote,
  onPrune,
  onToggleStar,
  onToggleCollapse,
}: Props) {
  const active = activeBranchId(focusPath);

  // A branch that IS the centre column shouldn't also be a card in its own
  // rail — that reads as two copies of the same thing.
  const entries = focusPath
    .flatMap((n) => branchesFrom(nodes, children, n.id))
    .filter((b) => b.id !== active);

  // Reading a branch means the main thread is one click away, and that click
  // needs to exist somewhere. Here is where the user is already looking.
  const returnTarget = active ? nodes[active].parent_id : null;

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-border bg-sunken">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-faint">
          {active ? "Reading a branch" : "Branches"}
        </h2>
        {returnTarget && (
          <button
            onClick={() => onPromote(returnTarget)}
            className="ml-auto text-[11px] text-text hover:underline"
          >
            ← main thread
          </button>
        )}
      </header>

      <div className="scroll-y flex-1 p-3">
        {entries.length === 0 ? (
          <p className="px-1 py-4 text-[13px] leading-relaxed text-faint">
            {active
              ? "No further branches from this one yet. Select a phrase above to go deeper."
              : "Select any phrase in a reply to ask about it without pulling the main thread off course."}
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((branch) => (
              <BranchCard
                key={branch.id}
                nodes={nodes}
                children={children}
                branch={branch}
                isDark={isDark}
                onPromote={onPromote}
                onPrune={onPrune}
                onToggleStar={onToggleStar}
                onToggleCollapse={onToggleCollapse}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function BranchCard({
  nodes,
  children,
  branch,
  isDark,
  onPromote,
  onPrune,
  onToggleStar,
  onToggleCollapse,
}: {
  nodes: NodeMap;
  children: ChildMap;
  branch: Node;
  isDark: boolean;
  onPromote: (id: string) => void;
  onPrune: (id: string) => void;
  onToggleStar: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}) {
  const color =
    branch.color_slot != null
      ? resolveBranchColor(branch.color_slot, isDark)
      : null;

  const reply = childrenOf(children, branch.id)
    .map((c) => nodes[c])
    .find((n) => n?.role === "assistant");

  const subBranches = reply ? branchesFrom(nodes, children, reply.id).length : 0;

  return (
    <li
      className="group rounded-lg border bg-surface p-3 transition-shadow hover:shadow-sm"
      style={{
        borderColor: "var(--color-border)",
        borderLeftColor: color?.fg,
        borderLeftWidth: color ? 3 : 1,
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {color && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color.fg }}
            aria-hidden
          />
        )}
        <button
          onClick={() => onToggleCollapse(branch.id)}
          title={branch.collapsed ? "Expand branch" : "Collapse branch"}
          className="shrink-0 text-[11px] leading-none text-faint hover:text-text"
        >
          {branch.collapsed ? "▸" : "▾"}
        </button>

        <span
          className="truncate text-[12px]"
          style={{ color: color?.fg ?? "var(--color-muted)" }}
        >
          ⑂ {branch.anchor_text}
        </span>

        <button
          onClick={() => onToggleStar(branch.id)}
          title={branch.starred ? "Unmark as important" : "Mark as important"}
          className={`ml-auto shrink-0 text-[13px] leading-none transition-opacity ${
            branch.starred ? "" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{
            color: branch.starred ? "var(--color-star)" : "var(--color-faint)",
          }}
        >
          {branch.starred ? "★" : "☆"}
        </button>

        <button
          onClick={() => onPrune(branch.id)}
          className="shrink-0 text-[11px] text-faint opacity-0 transition-opacity hover:text-warn group-hover:opacity-100"
        >
          prune
        </button>
      </div>

      {/* Collapsed: the branch shrinks to its title line. The content is kept —
          expand to see it again. */}
      {!branch.collapsed && (
        <>
          <button
            onClick={() => onPromote(branch.id)}
            className="block w-full text-left"
          >
            <p className="mb-1.5 line-clamp-2 text-[13px] text-text">
              {branch.content}
            </p>
            {reply?.content && (
              <p className="line-clamp-3 text-[13px] leading-relaxed text-muted">
                {reply.content}
              </p>
            )}
          </button>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-faint">
            <span>{branch.context_mode}</span>
            {subBranches > 0 && <span>· ⑂ {subBranches}</span>}
            <button
              onClick={() => onPromote(branch.id)}
              className="ml-auto text-text opacity-0 transition-opacity group-hover:opacity-100"
            >
              open →
            </button>
          </div>
        </>
      )}
    </li>
  );
}
