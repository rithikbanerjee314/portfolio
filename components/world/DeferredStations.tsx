"use client";

import { Physics } from "@react-three/rapier";
import StationsLayer from "@/components/stations/StationsLayer";
import SceneReady from "./SceneReady";
import { useUIStore } from "@/lib/store";

/**
 * Everything that needs live Rapier physics (soccer/chess/tokamak/piano) or
 * is otherwise not needed for the very first paint (vault). Split into its
 * own module and mounted only after the core scene's first frame (see
 * WorldCanvas.tsx) so `@react-three/rapier`'s WASM payload — and the five
 * heavy per-station chunks StationsLayer lazy-imports — start downloading
 * only once the visitor already has something to look at, instead of
 * competing with the terrain/sky/hero bundle for bandwidth on first load.
 *
 * `onReady` fires on this subtree's first rendered frame — WorldCanvas.tsx
 * now waits for this (alongside the core scene and DeferredEnvironment)
 * before revealing the page at all, so the five stations don't pop in
 * after the visitor can already see/interact with the page. This relies on
 * all five station chunks already being prefetched directly (not just this
 * module) before DeferredStations ever mounts — see WorldCanvas.tsx's
 * `prefetchAllStations` — so that by the time this renders, `next/dynamic`
 * resolves each station from the already-warm module cache instead of
 * still being mid-fetch; the actual Rapier WASM instantiation stays
 * async/background regardless (harmless — objects render at their initial
 * pose immediately, physics only affects subsequent movement).
 */
export default function DeferredStations({ onReady }: { onReady?: () => void }) {
  const physicsEnabled = useUIStore((s) => s.physicsEnabled);

  return physicsEnabled ? (
    <Physics gravity={[0, -9.8, 0]}>
      <StationsLayer />
      {onReady && <SceneReady onReady={onReady} />}
    </Physics>
  ) : (
    <>
      <StationsLayer />
      {onReady && <SceneReady onReady={onReady} />}
    </>
  );
}
