"use client";

import dynamic from "next/dynamic";

const SoccerStation = dynamic(() => import("./SoccerStation"), { ssr: false });
const ChessStation = dynamic(() => import("./ChessStation"), { ssr: false });
const TokamakStation = dynamic(() => import("./TokamakStation"), { ssr: false });
const PianoStation = dynamic(() => import("./PianoStation"), { ssr: false });
const VaultStation = dynamic(() => import("./VaultStation"), { ssr: false });

/**
 * Registry of every physics-driven interactive station's real component.
 * Always mounted once this layer mounts — no proximity/placeholder swap
 * (see CLAUDE.md lesson 33: a scroll-progress-driven mount swap once got
 * corrupted by a leaking pointer-drag gesture). Device-tier gating (low
 * tier falling back to a lightweight procedural equivalent) happens inside
 * each component via `physicsEnabled`, not here.
 *
 * An earlier version of this file staggered these five onto a ~220ms-apart
 * timer to spread their chunk downloads out. That's no longer needed (the
 * thing that actually made initial load slow was three.js being eagerly
 * bundled at all — fixed at the root, see CLAUDE.md's "Initial load
 * performance" section) and it was actively counterproductive: a visitor
 * who scrolled quickly right after the page revealed could reach a station
 * before its staggered turn came up and watch it pop into existence
 * mid-scroll. All five now mount together — this layer's own mount is
 * already deferred until after the core scene's first frame AND staged
 * across its own animation-frame boundary (see WorldCanvas.tsx), which is
 * what actually matters for avoiding a load-induced hitch.
 */
const REAL_COMPONENTS: Record<string, React.ComponentType> = {
  chess: ChessStation,
  soccer: SoccerStation,
  tokamak: TokamakStation,
  piano: PianoStation,
  vault: VaultStation,
};

const STATION_IDS = Object.keys(REAL_COMPONENTS);

export default function StationsLayer() {
  return (
    <>
      {STATION_IDS.map((id) => {
        const Real = REAL_COMPONENTS[id];
        return <Real key={id} />;
      })}
    </>
  );
}
