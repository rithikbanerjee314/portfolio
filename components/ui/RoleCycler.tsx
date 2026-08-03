"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ROLES } from "@/lib/content";
import { useUIStore } from "@/lib/store";

export default function RoleCycler() {
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(
      () => setIndex((i) => (i + 1) % ROLES.length),
      reducedMotion ? 5000 : 2600
    );
    return () => clearInterval(interval);
  }, [reducedMotion]);

  return (
    <div className="flex h-9 items-center justify-center overflow-hidden text-base sm:text-xl">
      <span className="mr-2 text-slate-400">I&apos;m a</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={ROLES[index]}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="text-gradient font-semibold"
        >
          {ROLES[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
