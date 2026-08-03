"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import Overlay from "@/components/ui/Overlay";
import NonWebGLFallback from "@/components/ui/NonWebGLFallback";
import LoadingScreen from "@/components/ui/LoadingScreen";
import TrailMapGate from "@/components/trailmap/TrailMapGate";
import VaultGate from "@/components/vault/VaultGate";
import { useEnvironmentDetection, useStationHashSync, useAudioPrewarm } from "@/lib/hooks";
import { useUIStore } from "@/lib/store";

// The WebGL world must never render on the server
const WorldCanvas = dynamic(() => import("@/components/world/WorldCanvas"), { ssr: false });

// Floor so the splash never flashes for a single frame on an already-warm
// cache — but this is a floor, not a target: real load time is driven
// entirely by `sceneReady` (see WorldCanvas.tsx's SceneReady signal), not by
// this timer, so a slow load is never masked or made to look artificially ok.
const MIN_SPLASH_MS = 400;

export default function Home() {
  useEnvironmentDetection();
  useStationHashSync();
  useAudioPrewarm();
  const webglSupported = useUIStore((s) => s.webglSupported);
  const sceneReady = useUIStore((s) => s.sceneReady);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  // No WebGL means WorldCanvas renders nothing at all, so sceneReady would
  // never fire — reveal immediately and let NonWebGLFallback take over.
  const revealed = !webglSupported || (sceneReady && minTimeElapsed);

  return (
    <main className="h-screen w-screen overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: revealed ? 1 : 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <WorldCanvas />
        <Overlay />
        {/* Independent scenes/state from WorldCanvas — see TrailMapGate/TrailMapCanvas and VaultGate/VaultCanvas. */}
        <TrailMapGate />
        <VaultGate />
        {!webglSupported && <NonWebGLFallback />}
      </motion.div>
      <AnimatePresence>{!revealed && <LoadingScreen />}</AnimatePresence>
    </main>
  );
}
