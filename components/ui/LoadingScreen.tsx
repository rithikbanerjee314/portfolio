"use client";

import { motion } from "framer-motion";
import { SITE } from "@/lib/content";
import { BG_DEEP, ACCENT_SIGNAL, ACCENT_ICE } from "@/components/world/palette";
import TrailLoader from "./TrailLoader";

/**
 * Full-screen splash shown from first paint until `sceneReady` flips true
 * (see WorldCanvas.tsx — that now waits for the core scene, decorative
 * environment, AND physics/stations to all genuinely finish, not just the
 * core, so the page never reveals into a half-built scene). Replaces the
 * old behavior of the 3D world just popping into view the instant its
 * first frame happened to be ready — this gives that moment an explicit,
 * designed hand-off instead. Exit animation is driven by the parent
 * (AnimatePresence in page.tsx); this component only renders the visual
 * itself. Uses TrailLoader (a small mountain + climbing trail animation)
 * rather than a generic spinner, on the theory that a loading state is a
 * good place to reinforce the site's own metaphor instead of a stock
 * indicator that could belong to any site.
 */
export default function LoadingScreen() {
  const initials = SITE.name
    .split(" ")
    .map((w) => w[0])
    .join("");

  return (
    <motion.div
      key="loading-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5"
      style={{ background: BG_DEEP }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{
          background: `linear-gradient(135deg, ${ACCENT_SIGNAL}, ${ACCENT_ICE})`,
          boxShadow: `0 0 40px ${ACCENT_SIGNAL}55`,
        }}
      >
        {initials}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
      >
        <TrailLoader />
      </motion.div>

      <p className="-mt-1 text-xs font-medium uppercase tracking-widest text-white/50">
        climbing the trail
      </p>

      <span className="sr-only" role="status">
        Loading site
      </span>
    </motion.div>
  );
}
