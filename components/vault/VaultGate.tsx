"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useUIStore } from "@/lib/store";
import { getStationContent } from "@/components/stations/stations.data";
import { WALL_COLOR } from "./constants";
import TrailLoader from "@/components/ui/TrailLoader";

// A third WebGL canvas — must never render on the server, same as WorldCanvas/TrailMapCanvas.
// NOTE: only WALL_COLOR (a plain constants module, zero R3F/three deps) is
// imported statically here — VaultCanvas itself must stay behind this
// dynamic() import, never a static one, or its whole chunk (Canvas, drei,
// three, VaultRoom) would get pulled back into the always-mounted page
// bundle this feature was split out of.
const VaultCanvas = dynamic(() => import("./VaultCanvas"), { ssr: false });

/**
 * Safety net if the visitor clicks the chest then scrolls away before the
 * camera parks there. Has to comfortably exceed the longest click-to-travel
 * tween plus ScrollControls' own settle (see CameraRig's TRAVEL_* constants)
 * — at the old 3s it could fire while the camera was still legitimately on
 * its way, which is a real failure mode now that travel is deliberately slow.
 * It stays a bounded fallback either way: it only opens the vault if the
 * visitor did in fact end up at the vault station.
 */
const PENDING_TIMEOUT_MS = 8000;

// Module-scoped (not recreated per render) so it's a stable effect dependency.
const prefetchVaultCanvas = () => import("./VaultCanvas");

/**
 * Prefetches this feature's chunk shortly after the main scene is ready,
 * well before the visitor could plausibly have clicked the chest — so by
 * the time `vaultOpen` actually flips, the dynamic import below resolves
 * instantly instead of starting a fresh download right as the reveal
 * transition needs something to show. Deliberately a plain `setTimeout`,
 * not `requestIdleCallback`: the main world is a continuously-animating R3F
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
 * Always-mounted (regardless of vault state), mirroring `TrailMapGate.tsx`'s
 * pattern exactly: owns the `vaultPending` -> `vaultOpen` watcher (see
 * VaultStation.tsx for the click side, which also drives the chest's lid
 * tween off these same two flags), then renders the independent
 * `VaultCanvas` scene plus a thin DOM header (title + Exit). Unlike the
 * trail map, clicking an exhibit inside the vault needs a real, clickable
 * GitHub/demo link — rather than fight `<Html>`'s documented unreliability
 * in this codebase (see CLAUDE.md lessons 26-28) to render that from inside
 * the 3D scene, the 3D room only writes *which* project is selected
 * (`vaultSelectedId`) and this DOM layer renders its actual detail sheet,
 * same "write selection from inside the canvas, render real DOM outside"
 * pattern already proven by `Beacons.tsx` -> `Overlay.tsx`.
 */
export default function VaultGate() {
  const vaultOpen = useUIStore((s) => s.vaultOpen);
  const vaultPending = useUIStore((s) => s.vaultPending);
  const setVaultOpen = useUIStore((s) => s.setVaultOpen);
  const setVaultPending = useUIStore((s) => s.setVaultPending);
  const vaultSelectedId = useUIStore((s) => s.vaultSelectedId);
  const setVaultSelectedId = useUIStore((s) => s.setVaultSelectedId);
  const isParked = useUIStore((s) => s.isParked);
  const currentStationId = useUIStore((s) => s.currentStationId);
  const sceneReady = useUIStore((s) => s.sceneReady);
  const [canvasReady, setCanvasReady] = useState(false);

  usePrefetchOnIdle(sceneReady, prefetchVaultCanvas);

  // Reset so the next open waits for a real ready signal again, rather than
  // reusing a stale "ready" from the previous visit — VaultCanvas fully
  // unmounts on close (AnimatePresence removes this whole tree), so the next
  // mount's SceneReady fires fresh regardless.
  useEffect(() => {
    if (!vaultOpen) setCanvasReady(false);
  }, [vaultOpen]);

  useEffect(() => {
    if (!vaultPending) return;
    if (isParked && currentStationId === "vault") {
      setVaultOpen(true);
      setVaultPending(false);
      return;
    }
    const timeout = setTimeout(() => {
      const s = useUIStore.getState();
      if (s.currentStationId === "vault") setVaultOpen(true);
      setVaultPending(false);
    }, PENDING_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [vaultPending, isParked, currentStationId, setVaultOpen, setVaultPending]);

  useEffect(() => {
    if (!vaultOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (vaultSelectedId) setVaultSelectedId(null);
      else setVaultOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vaultOpen, vaultSelectedId, setVaultOpen, setVaultSelectedId]);

  // Start fresh next visit rather than reopening with the last selection still showing.
  useEffect(() => {
    if (!vaultOpen) setVaultSelectedId(null);
  }, [vaultOpen, setVaultSelectedId]);

  const selected = vaultSelectedId ? getStationContent(vaultSelectedId) : undefined;

  return (
    <AnimatePresence>
      {vaultOpen && (
        <motion.div
          key="vault"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-50"
          style={{ background: WALL_COLOR }}
        >
          {/* The backdrop above is the flat target color, painted instantly
              so opening never flashes the mountain world behind it. The
              actual canvas crossfades in on top only once it has something
              real to show (SceneReady, via VaultCanvas's onReady) —
              mounting a WebGL canvas isn't the same as it having painted a
              frame, and revealing it the instant it mounts is what used to
              read as an abrupt pop instead of a transition. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.985 }}
            animate={canvasReady ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <VaultCanvas onReady={() => setCanvasReady(true)} />
          </motion.div>

          <AnimatePresence>
            {!canvasReady && (
              <motion.div
                key="vault-loading"
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
              <h2 className="text-xl font-bold text-white drop-shadow-md">🗝 Vault</h2>
              <p className="mt-1 max-w-md text-xs text-white/85 drop-shadow-md">
                Side projects that don&apos;t have their own stop on the trail — with more on the
                way.
              </p>
            </div>
            <button
              onClick={() => setVaultOpen(false)}
              className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-full border border-white/30 bg-black/40 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/60 hover:bg-black/60"
              aria-label="Exit vault"
            >
              <span aria-hidden>✕</span> Exit
            </button>
          </header>

          <AnimatePresence>
            {selected && (
              <motion.div
                key={selected.id}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                className="pointer-events-auto fixed inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-2xl border border-white/10 px-6 py-5 sm:px-8"
                style={{ background: "rgba(10,8,16,0.94)" }}
                role="dialog"
                aria-label={`${selected.title} details`}
              >
                <button
                  onClick={() => setVaultSelectedId(null)}
                  className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:border-white/40 hover:text-white"
                  aria-label="Close project details"
                >
                  ✕
                </button>
                <p className="text-2xl" aria-hidden>
                  {selected.emoji}
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">{selected.title}</h3>
                <p className="text-sm font-semibold" style={{ color: selected.accent }}>
                  {selected.tagline}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-200">{selected.blurb}</p>
                {selected.projects.map((p) => (
                  <div key={p.name} className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-white">{p.name}</span>
                    {p.github && (
                      <a
                        href={p.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-sky-300 underline-offset-4 hover:underline"
                      >
                        GitHub ↗
                      </a>
                    )}
                    {p.demo && (
                      <a
                        href={p.demo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-sky-300 underline-offset-4 hover:underline"
                      >
                        Live Website ↗
                      </a>
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
