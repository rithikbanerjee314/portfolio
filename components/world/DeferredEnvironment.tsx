"use client";

import Vegetation from "./Vegetation";
import Clouds from "./Clouds";
import Beacons from "./Beacons";
import WindParticles from "./WindParticles";
import Waterfall from "./Waterfall";

/**
 * Decorative world dressing — split out of WorldCanvas's core render tree
 * into its own chunk, mounted only after the core scene's first frame (see
 * WorldCanvas.tsx's SceneReady), same tier/timing as DeferredStations. This
 * shrinks both what a real visitor's browser must parse+execute before the
 * core paints, and — just as importantly in dev mode — how much of the
 * module graph `next dev`'s on-demand compiler has to compile before that
 * first frame.
 *
 * `onReady` fires once this tier is actually FULLY built, not just mounted
 * — the page's reveal now waits for every tier (core + this + stations) to
 * finish before showing anything (see WorldCanvas.tsx), so nothing pops in
 * after the visitor can already see and interact with the page. Vegetation
 * is the one piece here with real, multi-frame construction cost (see its
 * own staging comment), so it's the thing this actually waits on — Clouds/
 * Beacons/WindParticles/Waterfall are cheap enough to be ready on the same
 * render regardless.
 */
export default function DeferredEnvironment({ onReady }: { onReady?: () => void }) {
  return (
    <>
      <Vegetation onFullyBuilt={onReady} />
      <Clouds />
      <Beacons />
      <WindParticles />
      <Waterfall />
    </>
  );
}
