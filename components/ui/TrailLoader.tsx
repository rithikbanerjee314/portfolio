"use client";

import {
  ACCENT_ICE,
  ACCENT_SIGNAL,
  BG_MID,
  DIRT_TRAIL,
  GRASS_HIGH,
  GRASS_LOW,
  ROCK_GRAY,
  SNOW,
} from "@/components/world/palette";
import { useUIStore } from "@/lib/store";

/**
 * The site's themed loading indicator. Two concepts, picked by size — a
 * loading state is a good place to reinforce the site's own metaphor (the
 * whole portfolio is a mountain climb) rather than run a stock spinner that
 * could belong to any site.
 *
 * - Full size (the main splash, LoadingScreen.tsx): **Wireframe Assembly**.
 *   A scan line sweeps up a low-poly peak and each facet fills in behind it
 *   using the terrain palette the real mountain is coloured with. It's the
 *   only variant that shows the visitor the same thing that is actually
 *   loading — a low-poly mountain being built out of triangles — and reusing
 *   `palette.ts` directly means the splash and the world can't drift apart.
 * - Compact (`compact`, used by the vault and trail-map open transitions):
 *   **Survey Lines**. Topographic contours draw from the base ring inward and
 *   close on a summit crosshair, like the peak being measured before it's
 *   rendered. Chosen for the small size specifically: at ~140px wide the
 *   assembly's individual facets are too small to follow, whereas concentric
 *   line work stays legible.
 *
 * Both are plain SVG + CSS keyframes (see globals.css) — no images, no
 * libraries, nothing added to the first-load bundle — and both have a real
 * static composition under reduced motion rather than simply freezing on an
 * arbitrary frame.
 */
export default function TrailLoader({ compact = false }: { compact?: boolean }) {
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const width = compact ? 140 : 230;
  const height = width * 0.625; // matches the 320x200 viewBox aspect ratio

  return (
    <svg width={width} height={height} viewBox="0 0 320 200" role="img" aria-label="Loading">
      {compact ? (
        <SurveyLines reducedMotion={reducedMotion} />
      ) : (
        <WireframeAssembly reducedMotion={reducedMotion} />
      )}
    </svg>
  );
}

/**
 * Low-poly facets of the peak, ordered bottom-left to summit so the stagger
 * below reads as the scan line building the mountain as it passes. Colours are
 * the real terrain palette: grass low on the flanks, dirt where the trail
 * would cut, rock on the upper faces, snow on the cap.
 */
const FACETS: { points: string; fill: string }[] = [
  { points: "20,170 72,118 98,170", fill: GRASS_LOW },
  { points: "72,118 112,88 98,170", fill: GRASS_HIGH },
  { points: "112,88 152,170 98,170", fill: DIRT_TRAIL },
  { points: "112,88 160,46 152,170", fill: ROCK_GRAY },
  { points: "160,46 206,170 152,170", fill: ROCK_GRAY },
  { points: "160,46 214,96 206,170", fill: GRASS_HIGH },
  { points: "214,96 256,130 206,170", fill: GRASS_LOW },
  { points: "256,130 268,170 206,170", fill: DIRT_TRAIL },
  { points: "256,130 300,170 268,170", fill: GRASS_LOW },
  { points: "138,70 160,46 182,70", fill: SNOW },
];

function WireframeAssembly({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <g>
      {FACETS.map((facet, i) => (
        <polygon
          key={facet.points}
          points={facet.points}
          fill={facet.fill}
          stroke={ACCENT_ICE}
          strokeWidth={0.9}
          strokeOpacity={0.55}
          // Reduced motion gets the finished mountain: the wireframe fully
          // filled in, which is the animation's own end state rather than an
          // arbitrary frozen frame.
          className={reducedMotion ? undefined : "tl-facet"}
          style={reducedMotion ? undefined : { animationDelay: `${i * 0.08}s` }}
        />
      ))}
      {!reducedMotion && (
        <g className="tl-scan">
          <line x1={14} y1={170} x2={306} y2={170} stroke={ACCENT_ICE} strokeWidth={1.4} />
        </g>
      )}
    </g>
  );
}

/**
 * Concentric contours of a peak. `pathLength={100}` on every ellipse is what
 * lets one CSS rule animate all of them identically — the dash math no longer
 * depends on each ellipse's real circumference.
 */
const CONTOURS = [
  { cx: 160, cy: 132, rx: 112, ry: 44 },
  { cx: 158, cy: 122, rx: 88, ry: 35 },
  { cx: 161, cy: 112, rx: 66, ry: 27 },
  { cx: 159, cy: 102, rx: 46, ry: 19 },
  { cx: 160, cy: 92, rx: 28, ry: 12 },
  { cx: 160, cy: 84, rx: 13, ry: 6 },
];

function SurveyLines({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <g>
      {/* A faint ridge behind the contours so the compact version still reads
          as terrain rather than as an abstract target. */}
      <path
        d="M0,200 L0,172 L58,132 L110,162 L160,118 L212,158 L266,128 L320,164 L320,200 Z"
        fill={BG_MID}
        opacity={0.55}
      />
      {CONTOURS.map((c, i) => (
        <ellipse
          key={`${c.rx}-${c.ry}`}
          cx={c.cx}
          cy={c.cy}
          rx={c.rx}
          ry={c.ry}
          pathLength={100}
          fill="none"
          stroke={ACCENT_ICE}
          strokeWidth={1.6}
          opacity={reducedMotion ? 0.7 : undefined}
          className={reducedMotion ? undefined : "tl-contour"}
          style={reducedMotion ? undefined : { animationDelay: `${i * 0.14}s` }}
        />
      ))}
      {/* Summit crosshair — the survey closing on its target. Present in both
          modes; reduced motion simply shows it already landed. */}
      <g className={reducedMotion ? undefined : "tl-crosshair"}>
        <circle cx={160} cy={78} r={3.4} fill={ACCENT_SIGNAL} />
        <path
          d="M160,66 V72 M160,84 V90 M148,78 H154 M166,78 H172"
          stroke={ACCENT_ICE}
          strokeWidth={1.2}
        />
      </g>
    </g>
  );
}
