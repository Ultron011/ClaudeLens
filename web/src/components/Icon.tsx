import type { SVGProps } from 'react';

/** Authored icon set — one geometry, one weight.
 *
 * Every glyph is drawn on a 16×16 box with stroke 1.5, round caps and round joins, and inherits
 * `currentColor`. This exists because Unicode glyphs (◑ ▸ ★ ⨯ ⚡) are not an icon system: they
 * carry each font's own weight, baseline and metrics, so they never align with each other or with
 * adjacent text. No icon dependency — `web` keeps its 4-runtime-dep budget (docs/frontend.md).
 *
 * Adding one: draw it on the same 16×16 box at stroke 1.5, and let fill stay `none` unless the
 * shape is genuinely solid (only `star` is, and only when `filled`). */

export type IconName =
  | 'lens'
  | 'grid'
  | 'chart'
  | 'people'
  | 'person'
  | 'folder'
  | 'message'
  | 'star'
  | 'close'
  | 'trash'
  | 'chevronRight'
  | 'chevronDown'
  | 'caretUp'
  | 'caretDown'
  | 'bolt'
  | 'clock'
  | 'coin'
  | 'layers'
  | 'cpu'
  | 'branch'
  | 'home'
  | 'arrowUpRight'
  | 'sun'
  | 'moon'
  | 'calendar'
  | 'check'
  | 'dot'
  | 'search'
  | 'link'
  | 'copy'
  | 'eye'
  | 'eyeOff'
  | 'arrowUp'
  | 'arrowDown';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** Only meaningful for `star` — renders it solid rather than outlined. */
  filled?: boolean;
}

const PATHS: Record<IconName, JSX.Element> = {
  // Monochrome fallback of the brand mark. Prefer <Logo/> below, which is two-tone.
  lens: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 3.4A4.6 4.6 0 0 1 12.6 8H8z" fill="currentColor" stroke="none" />
    </>
  ),
  grid: (
    <>
      <rect x="1.75" y="1.75" width="5.5" height="5.5" rx="1.25" />
      <rect x="8.75" y="1.75" width="5.5" height="5.5" rx="1.25" />
      <rect x="1.75" y="8.75" width="5.5" height="5.5" rx="1.25" />
      <rect x="8.75" y="8.75" width="5.5" height="5.5" rx="1.25" />
    </>
  ),
  chart: (
    <>
      <path d="M2 14h12" />
      <path d="M4.25 14V9.5" />
      <path d="M8 14V4.5" />
      <path d="M11.75 14v-6.5" />
    </>
  ),
  people: (
    <>
      <circle cx="6" cy="5.75" r="2.5" />
      <path d="M1.75 13.5a4.25 4.25 0 0 1 8.5 0" />
      <path d="M10.75 3.6a2.5 2.5 0 0 1 0 4.3" />
      <path d="M12 9.75a4.25 4.25 0 0 1 2.25 3.75" />
    </>
  ),
  person: (
    <>
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M2.75 13.75a5.25 5.25 0 0 1 10.5 0" />
    </>
  ),
  folder: (
    <path d="M1.75 4.25c0-.83.67-1.5 1.5-1.5h2.4c.5 0 .96.25 1.24.66l.57.84h5.29c.83 0 1.5.67 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H3.25a1.5 1.5 0 0 1-1.5-1.5z" />
  ),
  message: (
    <path d="M14.25 9.5a1.75 1.75 0 0 1-1.75 1.75H5.5L2.25 14V4a1.75 1.75 0 0 1 1.75-1.75h8.5A1.75 1.75 0 0 1 14.25 4z" />
  ),
  star: (
    <path d="m8 1.9 1.9 3.86 4.26.62-3.08 3 .73 4.24L8 11.62l-3.81 2 .73-4.24-3.08-3 4.26-.62z" />
  ),
  close: (
    <>
      <path d="M4 4l8 8" />
      <path d="M12 4l-8 8" />
    </>
  ),
  trash: (
    <>
      <path d="M2.5 4.25h11" />
      <path d="M6.25 4.25v-1a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v1" />
      <path d="M12.25 4.25v8.5a1.5 1.5 0 0 1-1.5 1.5h-5.5a1.5 1.5 0 0 1-1.5-1.5v-8.5" />
      <path d="M6.75 7v4" />
      <path d="M9.25 7v4" />
    </>
  ),
  chevronRight: <path d="m6 3.5 5 4.5-5 4.5" />,
  chevronDown: <path d="m3.5 6 4.5 5 4.5-5" />,
  // Solid carets for the table sort indicator — at 9px a stroked chevron turns to mush.
  caretUp: <path d="M8 5.5 12.5 11h-9z" fill="currentColor" stroke="none" />,
  caretDown: <path d="M8 11 3.5 5.5h9z" fill="currentColor" stroke="none" />,
  bolt: <path d="M8.75 1.75 3.5 9.25h3.75l-.5 5 5.25-7.5H8.25z" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.5V8l2.5 1.75" />
    </>
  ),
  coin: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.25v7.5" />
      <path d="M9.9 6.1a2 2 0 0 0-1.9-.85c-1.1 0-2 .62-2 1.5S6.9 8.2 8 8.2s2 .62 2 1.5-.9 1.5-2 1.5a2 2 0 0 1-1.9-.85" />
    </>
  ),
  layers: (
    <>
      <path d="M8 1.9 1.9 5 8 8.1 14.1 5z" />
      <path d="m1.9 8 6.1 3.1L14.1 8" />
      <path d="m1.9 11 6.1 3.1L14.1 11" />
    </>
  ),
  cpu: (
    <>
      <rect x="4.25" y="4.25" width="7.5" height="7.5" rx="1.5" />
      <path d="M6.5 1.75v2.5M9.5 1.75v2.5M6.5 11.75v2.5M9.5 11.75v2.5" />
      <path d="M14.25 6.5h-2.5M14.25 9.5h-2.5M4.25 6.5h-2.5M4.25 9.5h-2.5" />
    </>
  ),
  branch: (
    <>
      <circle cx="4.5" cy="3.75" r="1.75" />
      <circle cx="4.5" cy="12.25" r="1.75" />
      <circle cx="11.5" cy="3.75" r="1.75" />
      <path d="M4.5 5.5v5" />
      <path d="M11.5 5.5v1.25a2.5 2.5 0 0 1-2.5 2.5H6.75" />
    </>
  ),
  home: <path d="M2.25 6.75 8 2.25l5.75 4.5v6a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1z" />,
  arrowUpRight: (
    <>
      <path d="M4.75 11.25 11.25 4.75" />
      <path d="M5.75 4.75h5.5v5.5" />
    </>
  ),
  /* All eight rays run on the same two radii — inner 4.8, outer 6.5 from centre — so the four
   * diagonals sit on true 45° lines. Getting a diagonal even slightly off-axis makes the whole
   * sun look lopsided, which is exactly what the first attempt here did (two rays ran 3:1.4). */
  sun: (
    <>
      <circle cx="8" cy="8" r="3.4" />
      <path d="M8 1.5v1.7M8 12.8v1.7M1.5 8h1.7M12.8 8h1.7" />
      <path d="M3.4 3.4l1.2 1.2M12.6 3.4l-1.2 1.2M11.4 11.4l1.2 1.2M4.6 11.4l-1.2 1.2" />
    </>
  ),
  moon: <path d="M13.5 9.35A5.75 5.75 0 0 1 6.65 2.5a5.75 5.75 0 1 0 6.85 6.85z" />,
  calendar: (
    <>
      <rect x="2.5" y="3.25" width="11" height="10.5" rx="1.5" />
      <path d="M2.5 6.75h11" />
      <path d="M5.5 1.75v3" />
      <path d="M10.5 1.75v3" />
    </>
  ),
  check: <path d="m3 8.5 3.25 3.25L13 5" />,
  dot: <circle cx="8" cy="8" r="2.25" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3.5 3.5" />
    </>
  ),
  link: (
    <>
      <path d="M6.75 9.25a2.75 2.75 0 0 0 3.9 0l2-2a2.75 2.75 0 0 0-3.9-3.9l-.75.75" />
      <path d="M9.25 6.75a2.75 2.75 0 0 0-3.9 0l-2 2a2.75 2.75 0 0 0 3.9 3.9l.75-.75" />
    </>
  ),
  copy: (
    <>
      <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.5" />
      <path d="M10.75 5.25V3.75a1.5 1.5 0 0 0-1.5-1.5h-5.5a1.5 1.5 0 0 0-1.5 1.5v5.5a1.5 1.5 0 0 0 1.5 1.5h1.5" />
    </>
  ),
  eye: (
    <>
      <path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M6.3 4.05A6.4 6.4 0 0 1 8 3.75C12 3.75 14.25 8 14.25 8a11 11 0 0 1-1.6 2.1M4.3 5.3A10.6 10.6 0 0 0 1.75 8S4 12.25 8 12.25a6.3 6.3 0 0 0 3.1-.8" />
      <path d="m2.5 2.5 11 11" />
    </>
  ),
  arrowUp: <path d="M8 13V3.5M4 7.25 8 3.25l4 4" />,
  arrowDown: <path d="M8 3v9.5M4 8.75l4 4 4-4" />,
};

/** The ClaudeLens brand mark.
 *
 * A lens ring with one filled quadrant. It reads two ways on purpose: as an aperture (the
 * product is a *lens* on the team's sessions) and as a single slice of a ring chart (what the
 * dashboard actually shows). Two-tone — the ring takes the surrounding text colour, the segment
 * takes the accent — so it sits correctly in the rail, on a solid accent fill, and in the
 * favicon without a second asset.
 *
 * Drawn on the same 16×16 / stroke-1.5 grid as the icon set, so it aligns with the nav glyphs
 * beneath it. Keep the inner segment's radius at 4.6 — smaller and it disappears at 16px, larger
 * and the ring reads as a pie rather than a lens. */
export function Logo({ size = 18, ...rest }: Omit<SVGProps<SVGSVGElement>, 'name'> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth={1.5} />
      <path d="M8 3.4A4.6 4.6 0 0 1 12.6 8H8z" fill="var(--accent)" />
      <circle cx="8" cy="8" r="1.15" fill="var(--accent)" />
    </svg>
  );
}

export function Icon({ name, size = 16, filled = false, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled && name === 'star' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
