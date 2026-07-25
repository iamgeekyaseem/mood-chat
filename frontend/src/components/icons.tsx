/**
 * Hand-rolled inline SVG icons — no icon-library dependency, matching the
 * rest of this codebase (no dagre/elkjs, no lucide/heroicons; `Minimap.tsx`'s
 * one hand-rolled `<svg>` is the existing precedent). All icons use
 * `currentColor` so they inherit the neutral ink/muted/faint text tones —
 * saturated hue stays reserved for branch identity (see colors.ts).
 *
 * Default size is left to the caller via `className`; callers should also
 * add `transition-transform hover:scale-110 active:scale-95` on icon-only
 * buttons for the subtle hover feedback used across the app.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconStop({ className, ...rest }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function IconSend({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <path d="M4 12 20 4 14 20l-2.5-6.5L4 12Z" />
    </svg>
  );
}

export function IconBranch({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="17" cy="12" r="2.4" />
      <path d="M6 8.4V15.6" />
      <path d="M8.4 6.8C12 6.8 12 11 14.7 11.4" />
    </svg>
  );
}

export function IconCompare({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <rect x="3.5" y="4.5" width="7" height="15" rx="1.5" />
      <rect x="13.5" y="4.5" width="7" height="15" rx="1.5" />
    </svg>
  );
}

export function IconThink({ className, ...rest }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <path d="M12 2c.9 3.6 1.8 4.5 5.4 5.4-3.6.9-4.5 1.8-5.4 5.4-.9-3.6-1.8-4.5-5.4-5.4C10.2 6.5 11.1 5.6 12 2Z" />
      <path d="M18.5 14c.5 2 1 2.5 3 3-2 .5-2.5 1-3 3-.5-2-1-2.5-3-3 2-.5 2.5-1 3-3Z" />
    </svg>
  );
}

export function IconFast({ className, ...rest }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}

export function IconTemplates({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
  );
}

export function IconCheck({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

export function IconClose({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <path d="M5 5 19 19" />
      <path d="M19 5 5 19" />
    </svg>
  );
}

export function IconExpand({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <path d="M9 4H4v5" />
      <path d="M4 4l6.5 6.5" />
      <path d="M15 20h5v-5" />
      <path d="M20 20l-6.5-6.5" />
    </svg>
  );
}

export function IconStar({ className, filled, ...rest }: IconProps & { filled?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d="M12 3.5l2.6 5.4 5.9.7-4.3 4.1 1 5.9-5.2-2.9-5.2 2.9 1-5.9-4.3-4.1 5.9-.7L12 3.5Z" />
    </svg>
  );
}

export function IconChevron({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

export function IconChevronDown({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <path d="M5.5 9 12 15.5 18.5 9" />
    </svg>
  );
}

export function IconOpenInChat({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

export function IconNotes({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconDiff({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M4 9h16l-3-4" />
      <path d="M20 15H4l3 4" />
    </svg>
  );
}

export function IconSearch({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20 15.2 15.2" />
    </svg>
  );
}

export function IconSettings({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.3.9a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.4a7.6 7.6 0 0 0-1.7 1l-2.3-.9-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.3-.9a7.6 7.6 0 0 0 1.7 1L11 22h4l.4-2.4a7.6 7.6 0 0 0 1.7-1l2.3.9 2-3.5-2-1.5Z" />
    </svg>
  );
}

export function IconExport({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <path d="M12 15V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

export function IconSun({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8" />
    </svg>
  );
}

export function IconMoon({ className, ...rest }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export function IconRegenerate({ className, ...rest }: IconProps) {
  return (
    <svg className={className} {...base} {...rest}>
      <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5" />
      <path d="M20 4.5v4h-4" />
      <path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5" />
      <path d="M4 19.5v-4h4" />
    </svg>
  );
}
