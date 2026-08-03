"use client";

import { useEffect, useRef, useState } from "react";
import { useUIStore, type DeviceTier } from "./store";
import { STATION_ORDER } from "@/components/world/stations-meta";
// Static, but deliberately cheap: tonePlayer imports nothing heavy at module
// scope (`tone` itself is behind a dynamic import inside it), so this does NOT
// pull Tone.js into the eager first-load bundle. Verified against the
// production build's First Load JS after the change.
import { preloadTone, prewarmSynth } from "@/lib/tonePlayer";

function detectDeviceTier(): DeviceTier {
  if (typeof window === "undefined") return "mid";
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const smallScreen = window.innerWidth < 768;
  const touchPrimary = window.matchMedia("(pointer: coarse)").matches;
  if (cores <= 2 || memory <= 2) return "low";
  if ((smallScreen && touchPrimary) || cores <= 4 || memory <= 4) return "mid";
  return "high";
}

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

/**
 * One-time environment detection, run at app mount.
 * Populates device tier, WebGL support and reduced-motion (kept live).
 */
export function useEnvironmentDetection() {
  const setDeviceTier = useUIStore((s) => s.setDeviceTier);
  const setWebglSupported = useUIStore((s) => s.setWebglSupported);
  const setReducedMotion = useUIStore((s) => s.setReducedMotion);

  useEffect(() => {
    setDeviceTier(detectDeviceTier());
    setWebglSupported(detectWebGL());

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setDeviceTier, setWebglSupported, setReducedMotion]);
}

/**
 * Sync the current station with the URL hash so reload, back/forward and
 * shared deep links restore the same point on the climb.
 * Hash format: #station-<id>
 */
/** `#station-<id>` -> that station's progress along the climb, or null. */
function stationTFromHash(hash: string): number | null {
  const match = hash.match(/^#station-(.+)$/);
  if (!match) return null;
  const station = STATION_ORDER.find((s) => s.id === decodeURIComponent(match[1]));
  return station ? station.t : null;
}

export function useStationHashSync() {
  const currentStationId = useUIStore((s) => s.currentStationId);
  const requestScrollTo = useUIStore((s) => s.requestScrollTo);
  const webglSupported = useUIStore((s) => s.webglSupported);

  // Captured in a lazy state initialiser — i.e. during the first client
  // render, BEFORE any effect runs. Both halves of that timing matter:
  //
  //  - It must be read before the hash-mirror effect below, which fires on
  //    mount with `currentStationId` still at its "base" default and would
  //    `replaceState` the visitor's deep link away before anything had a
  //    chance to act on it.
  //  - It must not be read during SSR (no `window` there), and a lazy
  //    initialiser on a client component runs fresh in the browser on the
  //    hydration render, so it sees the real URL.
  const [deepLinkT] = useState<number | null>(() =>
    typeof window === "undefined" ? null : stationTFromHash(window.location.hash)
  );

  // Nothing pending if there was no deep link to begin with.
  const deepLinkApplied = useRef(deepLinkT === null);

  // The scroll rig lives inside WorldCanvas, which is a `next/dynamic`
  // import — so on a cold load `requestScrollTo` is still null for a while
  // after this hook first runs, and calling it once on mount (as this used
  // to) silently did nothing. Subscribing to it means this re-runs the
  // moment the rig registers its handler.
  //
  // Waiting for `sceneReady` on top of that is NOT belt-and-braces, it is
  // required. drei's ScrollControls swallows scroll events during its own
  // first animation frame:
  //
  //     let firstRun = true;
  //     const onScroll = () => { if (!enabled || firstRun) return; ... }
  //     requestAnimationFrame(() => firstRun = false);
  //
  // (it sets `el.scrollTop = 1` on mount and doesn't want that to register).
  // Crucially `state.offset` — the thing the camera actually reads — only
  // ever damps toward a value written inside that handler. So a programmatic
  // `el.scrollTop` write landing in that window sets the DOM scroll position
  // and is never seen by ScrollControls: the camera stays at the trailhead,
  // and the position only "takes" once the visitor scrolls, because THAT
  // event reads the already-offset scrollTop and jumps. Exactly the reported
  // "it doesn't go back at first, then scrolls from that position onward".
  // `sceneReady` is many frames past that window, so the write registers.
  const sceneReady = useUIStore((s) => s.sceneReady);
  useEffect(() => {
    if (deepLinkApplied.current || deepLinkT === null) return;
    if (requestScrollTo && sceneReady) {
      deepLinkApplied.current = true;
      // Deliberately the ANIMATED travel, not an instant jump. It reads as a
      // deliberate journey to the linked station rather than a teleport, and
      // it's also structurally safer here: the tween writes scrollTop on
      // every frame for a second or more, so it cannot be lost to a single
      // mistimed event the way one write can.
      requestScrollTo(deepLinkT);
    } else if (!webglSupported) {
      // No canvas will ever mount, so there's no rig coming and no scroll
      // position to restore — NonWebGLFallback renders every station's
      // content in document order regardless. Release the mirror below.
      deepLinkApplied.current = true;
    }
  }, [requestScrollTo, webglSupported, sceneReady, deepLinkT]);

  // Back/forward between deep links, once the page is already running.
  useEffect(() => {
    const onHashChange = () => {
      const t = stationTFromHash(window.location.hash);
      if (t !== null) useUIStore.getState().requestScrollTo?.(t, { immediate: true });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // On station change: mirror to the hash without spamming history. Held off
  // until any incoming deep link has been consumed, so this can't overwrite
  // the URL the visitor arrived on. Once consumed, the rig moves to that
  // station, `currentStationId` changes, and this runs normally from then on.
  useEffect(() => {
    if (!deepLinkApplied.current) return;
    const desired = `#station-${encodeURIComponent(currentStationId)}`;
    if (window.location.hash === desired) return;
    window.history.replaceState(null, "", desired);
  }, [currentStationId]);

  return requestScrollTo;
}

/** True when this station is the visitor's current station (for panel fade-in etc). */
export function useIsStationActive(stationId: string): boolean {
  return useUIStore((s) => s.currentStationId === stationId);
}

/**
 * Same 768px threshold as `detectDeviceTier`'s `smallScreen` and
 * `WorldCanvas.tsx`'s `ResponsiveCameraFov` breakpoint — kept as one shared
 * number so "small screen" means the same viewport width everywhere in the
 * app, rather than three components each drawing their own line. Used by
 * `StationPane` to switch between the desktop side-panel and the mobile
 * bottom-sheet layout (different enough — slide axis, size, auto-open
 * behavior — that they're two separate render branches, not one CSS-only
 * component). Tracked live via matchMedia's own change event, not just read
 * once, so rotating a phone or resizing a resizable window updates it.
 */
const SMALL_SCREEN_QUERY = "(max-width: 767px)";

export function useIsSmallScreen(): boolean {
  const [isSmall, setIsSmall] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(SMALL_SCREEN_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(SMALL_SCREEN_QUERY);
    setIsSmall(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsSmall(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isSmall;
}

/**
 * Builds the piano's Tone.js synth on the page's very first real user
 * gesture, anywhere — not scoped to the piano station, and not waiting for
 * the visitor to actually reach it (t=0.68, a long scroll away). Browsers
 * require `Tone.start()` (unlocking the AudioContext) to happen inside a
 * real gesture handler, and that call plus constructing the synth is
 * genuinely slow enough (tens–hundreds of ms) that doing it lazily on the
 * first key press caused the first couple of notes to audibly overlap —
 * see lib/tonePlayer.ts's doc comment for the full story. A visitor
 * scrolling, clicking, or dragging to look around — all things that happen
 * immediately, before they could possibly reach the piano — satisfies this,
 * so by the time they do reach it the synth is already built.
 *
 * Deliberately never fully unsubscribes, and also listens for
 * `visibilitychange` — see that handler below for why: this used to stop
 * listening for good the first time `isAudioReady()` came back true, which
 * meant nothing here could ever recover from a LATER suspension. That's
 * exactly what browsers do to a background tab's AudioContext.
 */
export function useAudioPrewarm() {
  useEffect(() => {
    // Downloading Tone needs no gesture, so start it immediately — that way
    // the module is already in hand when the first gesture arrives and the
    // unlock below can run synchronously.
    preloadTone();

    // touchend and click are here specifically for older/pickier WebKit
    // versions — see tonePlayer.ts's "iOS Safari" doc comment. Costs nothing
    // to listen for extra event types since prewarmSynth() is a cheap no-op
    // once audio is already unlocked and running.
    const events = ["pointerdown", "touchstart", "touchend", "click", "keydown", "wheel"] as const;
    const trigger = () => {
      // Synchronous, inside the gesture. This used to be
      // `import("@/lib/tonePlayer").then((m) => m.prewarmSynth())`, which put
      // a dynamic import (and on a cold load, a network fetch of Tone itself)
      // between the gesture and the actual AudioContext unlock. Chrome's
      // sticky activation tolerates that; Safari's transient activation does
      // not. The static import above also guarantees the piano and this hook
      // share ONE module instance — see tonePlayer.ts, point 1.
      //
      // Always called, never gated on `isAudioReady()` — see the doc comment
      // above. Once the pool is built, `prewarmSynth()`'s own `contextRunning`
      // check makes every later call here a cheap no-op, so leaving this
      // attached for the page's whole lifetime costs nothing.
      prewarmSynth();
    };
    events.forEach((e) => window.addEventListener(e, trigger, { passive: true }));

    // Chrome (confirmed) automatically suspends a page's AudioContext while
    // its tab is hidden/backgrounded, to save power — and does NOT resume it
    // automatically when the tab becomes visible again; the page has to call
    // resume() itself. Sticky activation from the original gesture already
    // covers that resume call, so this can fire directly off visibility
    // returning rather than waiting for the visitor's next click/keypress.
    // Without this, the first piano press after switching back to the tab
    // pays tonePlayer.ts's full async cold-path delay — exactly the "works
    // on the first press, then delays again after reload/revisiting" report.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") prewarmSynth();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      events.forEach((e) => window.removeEventListener(e, trigger));
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
