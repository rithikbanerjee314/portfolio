"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useUIStore } from "@/lib/store";
import { TRAILMAP } from "@/lib/content";
import { BOARD_BACKGROUND } from "./constants";
import TrailLoader from "@/components/ui/TrailLoader";

// A second WebGL canvas — must never render on the server, same as WorldCanvas.
// NOTE: only BOARD_BACKGROUND (a plain constants module, zero R3F/three
// deps) is imported statically here — TrailMapCanvas itself must stay
// behind this dynamic() import, never a static one, or its whole chunk
// (Canvas, drei, three, TrailMapBoard) would get pulled back into the
// always-mounted page bundle this feature was split out of.
const TrailMapCanvas = dynamic(() => import("./TrailMapCanvas"), { ssr: false });

/**
 * Safety net if the visitor clicks the sign then scrolls away before the
 * camera parks there. Has to comfortably exceed the longest click-to-travel
 * tween plus ScrollControls' own settle (see CameraRig's TRAVEL_* constants)
 * — at the old 3s it could fire while the camera was still legitimately on
 * its way, which is a real failure mode now that travel is deliberately slow.
 * It stays a bounded fallback either way: it only opens the map if the
 * visitor did in fact end up at the intro station.
 */
const PENDING_TIMEOUT_MS = 8000;

// Module-scoped (not recreated per render) so it's a stable effect dependency.
const prefetchTrailMapCanvas = () => import("./TrailMapCanvas");

/**
 * Prefetches this feature's chunk shortly after the main scene is ready,
 * well before the visitor could plausibly have clicked the sign — so by the
 * time `mapOpen` actually flips, the dynamic import below resolves instantly
 * instead of starting a fresh download right as the reveal transition needs
 * something to show. Deliberately a plain `setTimeout`, not
 * `requestIdleCallback`: the main world is a continuously-animating R3F
 * canvas (its own `requestAnimationFrame` loop runs indefinitely), so the
 * browser may rarely — or never — consider it truly idle, which left this
 * prefetch pending far longer than intended (in practice, often not firing
 * before the visitor's first click at all, defeating the point). A fixed
 * delay after `sceneReady` is deterministic regardless of how "busy" the
 * page looks to the browser's idle heuristic.
 */
function usePrefetchOnIdle(sceneReady: boolean, importer: () => Promise<unknown>) {
  useEffect(() => {
    if (!sceneReady) return;
    const timer = setTimeout(() => void importer(), 1200);
    return () => clearTimeout(timer);
  }, [sceneReady, importer]);
}

/**
 * Always-mounted (regardless of map state) so its watcher effect can run
 * the moment the trail map sign is clicked. Owns the mapPending -> mapOpen
 * sequencing (see TrailMapStation.tsx for the click side) and, once open,
 * renders the independent `TrailMapCanvas` scene plus a thin DOM header
 * (title + Exit) — the only DOM chrome for this feature, everything else
 * inside the map is real WebGL content.
 */
export default function TrailMapGate() {
  const mapOpen = useUIStore((s) => s.mapOpen);
  const mapPending = useUIStore((s) => s.mapPending);
  const setMapOpen = useUIStore((s) => s.setMapOpen);
  const setMapPending = useUIStore((s) => s.setMapPending);
  const isParked = useUIStore((s) => s.isParked);
  const currentStationId = useUIStore((s) => s.currentStationId);
  const sceneReady = useUIStore((s) => s.sceneReady);
  const [canvasReady, setCanvasReady] = useState(false);

  usePrefetchOnIdle(sceneReady, prefetchTrailMapCanvas);

  // Reset so the next open waits for a real ready signal again, rather than
  // reusing a stale "ready" from the previous visit — TrailMapCanvas fully
  // unmounts on close (AnimatePresence removes this whole tree), so the next
  // mount's SceneReady fires fresh regardless.
  useEffect(() => {
    if (!mapOpen) setCanvasReady(false);
  }, [mapOpen]);

  // The trail map's sign lives on the intro station's own board now (see
  // IntroStation.tsx / stations-meta.ts) — there's no separate "trailmap"
  // station id to arrive at anymore, so "arrived" means parked at "intro".
  useEffect(() => {
    if (!mapPending) return;
    if (isParked && currentStationId === "intro") {
      setMapOpen(true);
      setMapPending(false);
      return;
    }
    const timeout = setTimeout(() => {
      const s = useUIStore.getState();
      if (s.currentStationId === "intro") setMapOpen(true);
      setMapPending(false);
    }, PENDING_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [mapPending, isParked, currentStationId, setMapOpen, setMapPending]);

  useEffect(() => {
    if (!mapOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapOpen, setMapOpen]);

  return (
    <AnimatePresence>
      {mapOpen && (
        <motion.div
          key="trailmap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-50"
          style={{ background: BOARD_BACKGROUND }}
        >
          {/* The backdrop above is the flat target color, painted instantly
              so opening never flashes the mountain world behind it. The
              actual canvas crossfades in on top only once it has something
              real to show (SceneReady, via TrailMapCanvas's onReady) —
              mounting a WebGL canvas isn't the same as it having painted a
              frame, and revealing it the instant it mounts is what used to
              read as an abrupt pop instead of a transition. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.985 }}
            animate={canvasReady ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <TrailMapCanvas onReady={() => setCanvasReady(true)} />
          </motion.div>

          <AnimatePresence>
            {!canvasReady && (
              <motion.div
                key="trailmap-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 flex items-center justify-center"
                aria-hidden
              >
                <TrailLoader compact />
              </motion.div>
            )}
          </AnimatePresence>

          <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-6 py-5 sm:px-10">
            <div>
              <h2 className="text-xl font-bold text-white drop-shadow-md">🗺 Trail Map</h2>
              <p className="mt-1 max-w-md text-xs text-white/85 drop-shadow-md">
                {TRAILMAP.overlayIntro}
              </p>
            </div>
            <button
              onClick={() => setMapOpen(false)}
              className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-full border border-white/30 bg-black/40 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/60 hover:bg-black/60"
              aria-label="Exit trail map"
            >
              <span aria-hidden>✕</span> Exit
            </button>
          </header>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
