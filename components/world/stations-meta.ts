/**
 * Pure station metadata — deliberately ZERO dependency on "three". Split out
 * of path.ts (which needs three.js to build the actual 3D climb curve)
 * because Overlay.tsx / StationPane.tsx / lib/hooks.ts all need just
 * `STATION_ORDER` (id/title/t for nav labels, hash-sync, pane content) and
 * are part of the page's always-eager tree, never behind a next/dynamic
 * boundary. Before this split they imported STATION_ORDER from path.ts,
 * which — since path.ts does `import * as THREE from "three"` at module
 * scope to build `PATH_CURVE` — silently pulled the entire three.js package
 * into the eager, first-load bundle. Confirmed directly against a
 * production build's served HTML: a ~680KB three.js chunk was being fetched
 * via an unconditional `<script async>` tag on every page load, before the
 * visitor had scrolled or any dynamic import had even fired. Anything that
 * doesn't need real 3D geometry (just which stations exist, in what order,
 * at what progress) belongs in this file, not path.ts.
 */

export interface StationDef {
  id: string;
  title: string;
  /**
   * One-to-two word label for the top-right nav bar. The full `title` is what
   * each pane's heading and the pane's own reopen tab use; the nav sits inline
   * with the Resume/Contact buttons in the header, where seven full titles
   * ("Chess Engine Development", "Fusion Energy Research"…) would not fit and
   * would dominate the top of the page. Kept as its own field rather than
   * shortening `title` so the two can't drift: the panes still read in full.
   */
  short: string;
  /** normalized position along the curve, 0-1 */
  t: number;
  /** lateral offset (world units) from the curve point where the object/panel sit; 0 = centered */
  side: 1 | -1 | 0;
  distance: number;
}

export const STATION_ORDER: StationDef[] = [
  { id: "base", title: "Base Camp", short: "Base", t: 0, side: 1, distance: 0 },
  // The trail map used to be a separate station here (id "trailmap", its own
  // t/side/distance and its own sign) — merged into this single intro sign
  // 2026-07-27 at the user's explicit request ("one sign that combines both
  // of these two functionalities"). IntroStation.tsx now renders one
  // signboard with both the welcome text AND a "View Trail Map" clickable
  // element on it; there's no separate "trailmap" station id anymore, so
  // TrailMapGate.tsx's arrival check keys off currentStationId === "intro".
  { id: "intro", title: "About Me", short: "About", t: 0.08, side: -1, distance: 2.4 },
  { id: "chess", title: "Chess Engine Development", short: "Chess", t: 0.2, side: 1, distance: 2.8 },
  {
    id: "soccer",
    title: "Automation Engineering",
    short: "Automation",
    t: 0.36,
    side: -1,
    distance: 3.2,
  },
  { id: "tokamak", title: "Fusion Energy Research", short: "Fusion", t: 0.52, side: 1, distance: 3.0 },
  { id: "piano", title: "Music", short: "Music", t: 0.68, side: -1, distance: 2.8 },
  { id: "vault", title: "Additional Projects", short: "Projects", t: 0.84, side: 1, distance: 3.0 },
  // "Summit" rather than "Contact" in the nav: the header already has a
  // Contact button right beside it, and the two do different things (this
  // travels the camera; that opens the contact pane in place).
  { id: "summit", title: "Contact Me", short: "Summit", t: 1, side: 0, distance: 0 },
];

export function nearestStation(t: number): StationDef {
  let best = STATION_ORDER[0];
  let bestDist = Infinity;
  for (const s of STATION_ORDER) {
    const d = Math.abs(s.t - t);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

export const STATION_ARRIVAL_EPSILON = 0.035;

/**
 * Progress below which the visitor is still on the landing page — the hero
 * name/role block is up and the climb hasn't really started. Shared between
 * `Overlay` (which shows the hero) and `StationLabel` (which hides itself
 * entirely on small screens while the hero is up), so the two can't drift
 * apart and leave a label floating over the landing view on a phone.
 */
export const HERO_PROGRESS_END = 0.05;
