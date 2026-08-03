"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Canvas, useThree } from "@react-three/fiber";
import { ScrollControls } from "@react-three/drei";
import * as THREE from "three";
import CameraRig from "./CameraRig";
import SkyEnvironment from "./SkyEnvironment";
import Terrain from "./Terrain";
import PathRibbon from "./PathRibbon";
import SceneReady from "./SceneReady";
import IntroStation from "@/components/stations/IntroStation";
import SummitStation from "@/components/stations/SummitStation";
import { useUIStore } from "@/lib/store";

// Physics + the five heavy interactive stations (chess.js-free but still
// rapier/tone.js-sized) live in their own chunk — see DeferredStations.tsx.
const DeferredStations = dynamic(() => import("./DeferredStations"), { ssr: false });
// Decorative dressing (vegetation, clouds, beacons, wind, waterfall) — none
// of it is needed for the first frame to read as "the mountain has loaded".
// See DeferredEnvironment.tsx.
const DeferredEnvironment = dynamic(() => import("./DeferredEnvironment"), { ssr: false });

// Module-scoped so a repeated call is a cheap no-op (module cache hit)
// rather than re-triggering anything — these are plain fetch+parse, no
// mount/execution, so calling them doesn't risk causing a hitch itself.
const prefetchEnvironment = () => import("./DeferredEnvironment");
const prefetchStations = () => import("./DeferredStations");
// The five station chunks themselves, prefetched directly rather than only
// via the DeferredStations barrel — StationsLayer's `dynamic()` calls don't
// actually fetch a station's chunk until that component is first rendered,
// so prefetching only the barrel module doesn't warm these. Fetching them
// directly here means that by the time DeferredStations mounts (which only
// happens once the visitor-visible reveal is already waiting on it — see
// below), each station resolves from the browser's already-warm module
// cache instead of still being mid-fetch.
const prefetchAllStations = () =>
  Promise.all([
    import("@/components/stations/SoccerStation"),
    import("@/components/stations/ChessStation"),
    import("@/components/stations/TokamakStation"),
    import("@/components/stations/PianoStation"),
    import("@/components/stations/VaultStation"),
  ]);

const SCROLL_PAGES = 9;

// Device pixel ratio ceiling per tier. Rendering cost scales with the SQUARE
// of this, so a 1.75 cap on a machine already flagged as low-tier costs it
// ~3x the fill rate of 1.0 for a refinement that tier is least able to
// afford — and a dropped frame is far more visible than a slightly softer
// edge. High tier keeps exactly what it had before.
const DPR_BY_TIER: Record<string, [number, number]> = {
  low: [1, 1],
  mid: [1, 1.5],
  high: [1, 1.75],
};

// `fov` on a PerspectiveCamera is the VERTICAL field of view. At a narrow
// portrait aspect ratio (any phone), the resulting HORIZONTAL fov shrinks a
// lot even though nothing about the camera's position/orientation changed —
// station objects (the chess board, the tokamak) read as tightly cropped, as
// if the visitor is looking through a narrow tube instead of standing at the
// same distance a desktop visitor sees. This is the "everything is zoomed in,
// I can't see the full picture" symptom. Widening the vertical fov on narrow
// viewports keeps the horizontal field roughly matching what a desktop
// visitor sees at a normal landscape aspect, clamped so it never turns into a
// fisheye. Strictly gated to widths below the codebase's existing mobile
// breakpoint (see lib/hooks.ts's `smallScreen`) — at 768px and above this is
// a no-op and `fov` stays exactly the 55 the Canvas already starts with, so
// desktop framing is byte-for-byte unchanged.
const MOBILE_FOV_BREAKPOINT = 768;
const DESKTOP_VFOV_DEG = 55;
const DESKTOP_REFERENCE_ASPECT = 16 / 9;
const MAX_MOBILE_VFOV_DEG = 100;
const degToRad = (deg: number) => (deg * Math.PI) / 180;
const radToDeg = (rad: number) => (rad * 180) / Math.PI;

function ResponsiveCameraFov() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    if (!("fov" in persp)) return;

    let targetFov = DESKTOP_VFOV_DEG;
    if (width < MOBILE_FOV_BREAKPOINT) {
      const aspect = width / height;
      const targetHorizontalFov =
        2 * Math.atan(Math.tan(degToRad(DESKTOP_VFOV_DEG) / 2) * DESKTOP_REFERENCE_ASPECT);
      const neededVerticalFov = 2 * Math.atan(Math.tan(targetHorizontalFov / 2) / aspect);
      targetFov = THREE.MathUtils.clamp(
        radToDeg(neededVerticalFov),
        DESKTOP_VFOV_DEG,
        MAX_MOBILE_VFOV_DEG
      );
    }

    if (Math.abs(persp.fov - targetFov) > 0.05) {
      persp.fov = targetFov;
      persp.updateProjectionMatrix();
    }
  }, [camera, width, height]);

  return null;
}

export default function WorldCanvas() {
  const webglSupported = useUIStore((s) => s.webglSupported);
  const setSceneReady = useUIStore((s) => s.setSceneReady);
  const deviceTier = useUIStore((s) => s.deviceTier);

  // The page reveal (sceneReady, in the store) now waits for ALL THREE
  // tiers to genuinely finish — not just the core scene — so the visitor
  // never sees the page before vegetation/clouds/waterfall or the physics
  // stations have actually finished building. An earlier version revealed
  // as soon as the core scene painted and let everything else pop in
  // afterward; that made "loading" faster but the page itself felt
  // unfinished/glitchy right after appearing, which is exactly what was
  // reported. The trade is a longer time behind the loading screen in
  // exchange for the page only ever appearing once it's actually done.
  const [coreReady, setCoreReady] = useState(false);
  const [environmentReady, setEnvironmentReady] = useState(false);
  const [stationsReady, setStationsReady] = useState(false);
  // Deferred tiers still don't mount in the exact same tick as the core's
  // own first frame — a one-frame gap keeps this from being a single
  // enormous synchronous block that could make the tab itself appear to
  // hang, even though (unlike before) nothing here is visible to the
  // visitor yet regardless.
  const [deferredMounted, setDeferredMounted] = useState(false);

  // Kick every deferred chunk's download off immediately, in parallel with
  // the core scene compiling/rendering, rather than waiting for the core's
  // first frame to even start fetching them.
  useEffect(() => {
    void prefetchEnvironment();
    void prefetchStations();
    void prefetchAllStations();
  }, []);

  useEffect(() => {
    if (!coreReady) return;
    const id = requestAnimationFrame(() => setDeferredMounted(true));
    return () => cancelAnimationFrame(id);
  }, [coreReady]);

  useEffect(() => {
    if (coreReady && environmentReady && stationsReady) setSceneReady(true);
  }, [coreReady, environmentReady, stationsReady, setSceneReady]);

  if (!webglSupported) return null;

  return (
    // `select-none` + touch-callout:none stop iOS's long-press text-selection
    // magnifier / "Copy" callout from interrupting a touch-drag that starts
    // slow (chess king, tokamak) — there's no selectable text anywhere in the
    // canvas, so this has no effect on desktop pointer input, only on the
    // specific touch long-press gesture that was competing with dragging.
    <div className="fixed inset-0 select-none [-webkit-touch-callout:none]">
      <Canvas
        camera={{ position: [0, 1.6, 12], fov: 55 }}
        dpr={DPR_BY_TIER[deviceTier] ?? DPR_BY_TIER.mid}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        // R3F drops the render resolution to `min` x dpr whenever something
        // calls performance.regress() (its own event manager does so on
        // pointer movement) and restores it `debounce` ms after motion stops.
        // Motion is exactly when a dropped frame is most noticeable and a
        // slightly softer image least so, which is the trade being made.
        // Deliberately mild — 0.75 is ~56% of the pixels, enough to matter
        // on a heavy frame without reading as a visible quality drop while
        // the mouse moves. Raise `min` to 1 to disable this entirely.
        performance={{ min: 0.75, max: 1, debounce: 200 }}
      >
        <ScrollControls pages={SCROLL_PAGES} damping={0.3}>
          <ResponsiveCameraFov />
          <CameraRig />
          <SkyEnvironment />
          <Terrain />
          <PathRibbon />
          <IntroStation />
          <SummitStation />
          {/* Fires once the core scene above (ground/sky/camera/trailhead —
              the minimum for "the mountain has loaded" to read as true) has
              genuinely rendered a frame. */}
          <SceneReady onReady={() => setCoreReady(true)} />
          {deferredMounted && <DeferredEnvironment onReady={() => setEnvironmentReady(true)} />}
          {deferredMounted && <DeferredStations onReady={() => setStationsReady(true)} />}
        </ScrollControls>
      </Canvas>
    </div>
  );
}
