/**
 * Branch identity colors.
 *
 * Validated all-pairs in both light and dark against this app's surfaces
 * (#FBFAF8 / #171614) with the dataviz validator. Two results constrain use:
 *
 *   light — yellow (2.08:1) and magenta (2.58:1) fall below 3:1 contrast,
 *           so "relief" is required: a visible label must accompany the color
 *   dark  — green vs yellow sits at CVD ΔE 6.9, inside the 6–8 warn band,
 *           which is legal ONLY with secondary encoding
 *
 * Both are discharged by the same rule, enforced in the components:
 * A BRANCH IS NEVER RENDERED AS COLOR ALONE. Its anchor text always shows.
 *
 * Hue is reserved for identity. Structural state (active path, selection) uses
 * neutral ink and stroke weight instead — an earlier teal accent had to go
 * because it measured ΔE 14.2 from the green slot, below the 15 floor, so an
 * active edge and a green branch were not reliably distinguishable.
 */

export interface BranchColor {
  name: string;
  light: string;
  dark: string;
  /** Low-alpha wash for card backgrounds; hue at fill strength is too loud. */
  softLight: string;
  softDark: string;
}

export const BRANCH_COLORS: BranchColor[] = [
  {
    name: "blue",
    light: "#2a78d6",
    dark: "#3987e5",
    softLight: "rgba(42,120,214,0.10)",
    softDark: "rgba(57,135,229,0.16)",
  },
  {
    name: "yellow",
    light: "#eda100",
    dark: "#c98500",
    softLight: "rgba(237,161,0,0.12)",
    softDark: "rgba(201,133,0,0.18)",
  },
  {
    name: "magenta",
    light: "#e87ba4",
    dark: "#d55181",
    softLight: "rgba(232,123,164,0.12)",
    softDark: "rgba(213,81,129,0.18)",
  },
  {
    name: "green",
    light: "#008300",
    dark: "#008300",
    softLight: "rgba(0,131,0,0.10)",
    softDark: "rgba(0,131,0,0.22)",
  },
];

/**
 * Past the fourth branch, colour stops carrying identity and the label does all
 * the work. Generating a fifth hue would break the validated set — the rule is
 * fixed order, never cycled.
 */
export const OVERFLOW_COLOR: BranchColor = {
  name: "neutral",
  light: "#6b6660",
  dark: "#9a948b",
  softLight: "rgba(107,102,96,0.10)",
  softDark: "rgba(154,148,139,0.14)",
};

/**
 * Stable slot assignment: branches are indexed by creation order, so a branch
 * keeps its colour as siblings are added or pruned. Colour follows the entity,
 * never its current rank in a filtered list.
 */
export function branchColor(index: number): BranchColor {
  return index < BRANCH_COLORS.length ? BRANCH_COLORS[index] : OVERFLOW_COLOR;
}

export interface ResolvedColor {
  fg: string;
  soft: string;
  name: string;
  /** True when the label is the only reliable identifier. */
  labelOnly: boolean;
}

export function resolveBranchColor(
  index: number,
  isDark: boolean,
): ResolvedColor {
  const c = branchColor(index);
  return {
    fg: isDark ? c.dark : c.light,
    soft: isDark ? c.softDark : c.softLight,
    name: c.name,
    labelOnly: index >= BRANCH_COLORS.length,
  };
}

/** Role colors for chat messages -- neutral, deliberately not branch hues. */
export const ROLE_STYLE = {
  user: {
    label: "You",
    surface: "var(--color-user-surface)",
    border: "var(--color-user-border)",
  },
  assistant: {
    label: "Assistant",
    surface: "var(--color-assistant-surface)",
    border: "var(--color-assistant-border)",
  },
} as const;
