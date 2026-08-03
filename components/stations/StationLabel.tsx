"use client";

import { useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useUIStore } from "@/lib/store";
import { useIsSmallScreen } from "@/lib/hooks";
import { HERO_PROGRESS_END } from "@/components/world/stations-meta";

const MIN_SCALE = 0.62;
const MAX_SCALE = 1;
/** Camera distance (world units) at which the label sits at 100% size — the
 *  typical parked-at-a-station distance. */
const REFERENCE_DISTANCE = 5;

/**
 * Always-readable billboard chip above a station object. High-contrast
 * (solid dark background), never occluded, clickable to open the info pane
 * and travel the camera there.
 *
 * Scales down with camera distance (via a manual per-frame CSS transform on
 * an inner wrapper, not drei's `distanceFactor` prop) but with a hard floor
 * at `MIN_SCALE` — plain `distanceFactor` has no floor, so it shrinks
 * without limit: fine at ground level (camera always a few units from
 * whatever it's parked at) but unreadably tiny from the summit overlook,
 * where the camera can be 10x+ farther from a given station. Removing
 * distance scaling entirely was tried and swung too far the other way: with
 * every label rendering at full size regardless of distance, several
 * distant stations' labels ended up visually overlapping the near one
 * whenever multiple stations were in frame at once (common near the base),
 * and their real DOM hitboxes overlapped right along with them. A floored
 * scale keeps near labels full-size, shrinks distant ones enough to reduce
 * that crowding, and never drops below a size that's still legible/clickable.
 */
export default function StationLabel({
  stationId,
  stationT,
  title,
  accent,
  position,
  onClick,
}: {
  stationId: string;
  stationT: number;
  title: string;
  accent: string;
  position: THREE.Vector3 | [number, number, number];
  /** Overrides the default "travel here + open its pane" click behavior — used by stations (e.g. the trail map sign) that trigger something other than the normal side pane. */
  onClick?: () => void;
}) {
  const travelToStation = useUIStore((s) => s.travelToStation);
  const isActive = useUIStore((s) => s.currentStationId === stationId);
  const scaleRef = useRef<HTMLDivElement>(null);
  // Small screens drop the "click to travel" caption entirely (the title chip
  // is still tappable and does the same thing). Every station is one tap away
  // in the header nav there, and on a phone-sized viewport these captions were
  // pure clutter stacked over the scene — most visibly at the intro sign and
  // the summit, where the label IS most of what's on screen.
  const isSmallScreen = useIsSmallScreen();
  // ...and on the landing page they're hidden outright, chip included. The
  // intro sign sits at t=0.08, close enough that its label is in frame from
  // the trailhead, so on a phone it landed on top of the hero name/role block
  // before the visitor had scrolled at all. Selected as a BOOLEAN rather than
  // reading `progress` directly: the store's camera state ticks ~12hz, and a
  // boolean selector only re-renders these labels on the one transition.
  const atLanding = useUIStore((s) => s.progress < HERO_PROGRESS_END);

  const pos: [number, number, number] = useMemo(
    () => (Array.isArray(position) ? position : [position.x, position.y, position.z]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Array.isArray(position) ? position.join() : position.x + "," + position.y + "," + position.z]
  );
  // Memoized: this component re-renders whenever the store's camera state
  // ticks (~12hz), and a fresh Vector3 per label per tick is pure garbage.
  const worldPos = useMemo(() => new THREE.Vector3(...pos), [pos]);
  const lastScale = useRef(-1);

  useFrame(({ camera }) => {
    if (!scaleRef.current) return;
    const dist = camera.position.distanceTo(worldPos);
    const scale = THREE.MathUtils.clamp(
      REFERENCE_DISTANCE / Math.max(dist, 0.001),
      MIN_SCALE,
      MAX_SCALE
    );
    // Writing `style.transform` is a DOM mutation, and drei's <Html> already
    // performs one of its own per frame per label. With a label at every
    // station that is a meaningful number of style invalidations interleaved
    // with the WebGL frame, every frame, forever — and almost all of them
    // write the identical value, because the camera is usually parked or
    // moving slowly. Quantizing to ~1% steps skips the redundant ones
    // without any visible stepping in the scale itself.
    const quantized = Math.round(scale * 100) / 100;
    if (quantized === lastScale.current) return;
    lastScale.current = quantized;
    scaleRef.current.style.transform = `scale(${quantized})`;
  });

  // Hidden entirely (not just its caption) on small screens while still on
  // the landing page — the intro sign's label otherwise sat right on top of
  // the hero name/role block before the visitor had scrolled at all. Comes
  // after every hook above so the hook order never changes between renders.
  if (isSmallScreen && atLanding) return null;

  return (
    <Html
      position={pos}
      center
      zIndexRange={[25, 11]}
      // The <Html> container box is the UNSCALED content size and is
      // interactive by default, so once the label scales down with distance
      // its transparent container keeps a dead margin around the visible
      // chip that eats clicks. Making the container inert and re-enabling
      // pointer events only on the button itself means the clickable region
      // is exactly the painted button at any scale.
      style={{ pointerEvents: "none" }}
    >
      {/* The decorative stem is a SIBLING of the button, not a child of it.
          Inside the button it was part of the clickable box, which made the
          hit area roughly 24px taller than the chip it belongs to and — since
          `center` anchors the whole column — pushed the visible chip above
          the point the label actually marks. The result was a hitbox
          noticeably offset from the thing being clicked. */}
      <div ref={scaleRef} className="flex flex-col items-center">
      <button
        onClick={() => {
          if (onClick) {
            onClick();
            return;
          }
          // Travels there first, then opens the pane on arrival — see the
          // store's `travelToStation` / `pendingPaneId`.
          travelToStation(stationId, stationT);
        }}
        className="pointer-events-auto group flex select-none flex-col items-center gap-1 whitespace-nowrap"
        aria-label={`Open ${title}`}
      >
        <span
          className="rounded-full border-2 px-4 py-1.5 text-sm font-bold text-white shadow-lg transition-transform group-hover:scale-105"
          style={{
            background: "rgba(6, 14, 28, 0.92)",
            borderColor: isActive ? accent : `${accent}66`,
            boxShadow: `0 4px 18px rgba(5,11,23,0.55), 0 0 12px ${accent}33`,
          }}
        >
          {title}
        </span>
        {!isSmallScreen && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/90"
            style={{ background: "rgba(6, 14, 28, 0.75)" }}
          >
            {isActive ? "click to open" : "click to travel"}
          </span>
        )}
      </button>
      <span
        className="pointer-events-none mt-1 block h-6 w-0.5"
        style={{ background: `linear-gradient(${accent}, transparent)` }}
        aria-hidden
      />
      </div>
    </Html>
  );
}
