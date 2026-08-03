"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * Fires `onReady` exactly once, on the first frame this component's Canvas
 * actually renders — used as the handoff signal between a loading/splash
 * screen and the real scene. Mounting a component is not the same as having
 * pixels on screen (geometry still has to build, materials compile, first
 * draw call issue); waiting for the first real `useFrame` tick means the
 * splash only clears once there's genuinely something to look at underneath
 * it, instead of a fixed guess-timer that can either cut away too early
 * (a flash of nothing) or leave a finished scene sitting behind a splash
 * for longer than necessary.
 */
export default function SceneReady({ onReady }: { onReady: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    onReady();
  });
  return null;
}
