import { useMemo } from "react";
import { resolveBranchColor } from "../colors";
import { branchRoot, layoutTurns, type ChildMap, type NodeMap } from "../tree";

interface Props {
  nodes: NodeMap;
  children: ChildMap;
  focusPath: Set<string>;
  activeId: string | null;
  isDark: boolean;
  onSelect: (id: string) => void;
}

/**
 * Whole-conversation overview. One dot per turn — a question and its answer
 * collapse into a single node, since on the map you care about the shape of the
 * exchange, not each individual message. Branch hue identifies which line a turn
 * belongs to; being on the active path is shown with neutral ink and heavier
 * stroke, so state and identity never compete for the same channel.
 */
export function Minimap({
  nodes,
  children,
  focusPath,
  activeId,
  isDark,
  onSelect,
}: Props) {
  const layout = useMemo(() => layoutTurns(nodes, children), [nodes, children]);
  const positions = useMemo(
    () => Object.fromEntries(layout.nodes.map((n) => [n.key, n])),
    [layout],
  );

  const hueOf = (nodeId: string): string | null => {
    const root = branchRoot(nodes, nodeId);
    return root?.color_slot != null
      ? resolveBranchColor(root.color_slot, isDark).fg
      : null;
  };

  const onPathTurn = (memberIds: string[]) =>
    memberIds.some((id) => focusPath.has(id));
  const isActiveTurn = (memberIds: string[]) =>
    activeId != null && memberIds.includes(activeId);

  const total = layout.nodes.length;
  const forks = layout.edges.filter((e) => e.isBranch).length;
  const starred = layout.nodes.filter((n) => n.starred).length;

  return (
    <aside className="flex w-[184px] shrink-0 flex-col border-r border-border bg-sunken">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-faint">
          Map
        </h2>
      </header>

      <div className="scroll-y flex-1 p-2">
        {total === 0 ? (
          <p className="px-2 py-6 text-[13px] leading-relaxed text-faint">
            Your conversation appears here as it grows — one dot per exchange.
          </p>
        ) : (
          <svg
            width={layout.width}
            height={layout.height}
            className="overflow-visible"
            role="tree"
            aria-label="Conversation map"
          >
            {layout.edges.map((e) => {
              const a = positions[e.from];
              const b = positions[e.to];
              if (!a || !b) return null;
              const onPath =
                onPathTurn(a.memberIds) && onPathTurn(b.memberIds);
              const hue = hueOf(e.to);
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={
                    e.isBranch
                      ? `M ${a.x} ${a.y} C ${a.x} ${b.y}, ${b.x} ${a.y}, ${b.x} ${b.y}`
                      : `M ${a.x} ${a.y} L ${b.x} ${b.y}`
                  }
                  fill="none"
                  stroke={hue ?? "var(--color-faint)"}
                  strokeWidth={onPath ? 2 : 1}
                  strokeDasharray={e.isBranch ? "2 2" : undefined}
                  opacity={onPath ? 1 : 0.55}
                />
              );
            })}

            {layout.nodes.map((n) => {
              const onPath = onPathTurn(n.memberIds);
              const isActive = isActiveTurn(n.memberIds);
              const hue = hueOf(n.key);
              const fill = hue ?? "var(--color-muted)";
              return (
                <g key={n.key}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={isActive ? 5.5 : onPath ? 4 : 3.25}
                    fill={onPath || isActive ? fill : "var(--color-surface)"}
                    stroke={isActive ? "var(--color-ink)" : fill}
                    strokeWidth={isActive ? 2 : 1.25}
                    opacity={onPath ? 1 : 0.85}
                    className="cursor-pointer"
                    onClick={() => onSelect(n.selectId)}
                  >
                    <title>{nodes[n.key]?.content.slice(0, 80) || "…"}</title>
                  </circle>
                  {n.starred && (
                    <circle
                      cx={n.x + 6}
                      cy={n.y - 5}
                      r={2}
                      fill="var(--color-star)"
                      className="pointer-events-none"
                    />
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <footer className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-faint">
        <div>
          {total} exchange{total === 1 ? "" : "s"}
        </div>
        <div>
          {forks} branch{forks === 1 ? "" : "es"}
        </div>
        {starred > 0 && (
          <div style={{ color: "var(--color-star)" }}>★ {starred} marked</div>
        )}
      </footer>
    </aside>
  );
}
