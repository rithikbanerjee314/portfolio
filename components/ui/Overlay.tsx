"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SITE } from "@/lib/content";
import { STATION_ORDER, HERO_PROGRESS_END } from "@/components/world/stations-meta";
import { useUIStore } from "@/lib/store";
import { useIsSmallScreen } from "@/lib/hooks";
import { ACCENT_SIGNAL } from "@/components/world/palette";
import RoleCycler from "./RoleCycler";
import StationPane from "./StationPane";

// base is excluded (the hero/landing point, not a real content stop).
// vault behaves like any other station in the nav/pane system (it has a
// normal StationContent entry) — only clicking the chest OBJECT itself (not
// its label/quick-nav) triggers the fullscreen vault room, the same "object
// click does something extra" pattern as the soccer ball or chess king. The
// trail map used to be its own excluded station here (its only entry point
// was clicking its own sign directly, not the quick-nav) — it now lives on
// intro's own board (see IntroStation.tsx) and intro is a completely normal
// nav entry, so there's nothing special left to exclude for it.
// Left in climb order: the nav is a horizontal row in the header now (it used
// to be a vertical column on the LEFT edge, where reversing it made the
// trailhead sit at the bottom to mirror the mountain). Reading left-to-right
// as trailhead → summit is the equivalent for a top bar.
const NAV_STATIONS = STATION_ORDER.filter((s) => s.id !== "base");
// Summit doesn't get a "click to travel" beacon label at the overlook — the
// visitor is already standing there, and the reopen tab on the right edge
// (see StationPane) already covers reopening its own pane on demand.
const BEACON_LABEL_STATIONS = NAV_STATIONS.filter((s) => s.id !== "summit");

// Beacon labels project to their beacon's true screen position — from the
// overlook, several beacons (e.g. chess/tokamak/intro, all early on the
// climb) can land close enough together on screen that their chips overlap
// and become unreadable. This nudges colliding labels apart in screen
// space, purely for layout; it doesn't touch the underlying projection.
const LABEL_W = 170;
const LABEL_H = 60;
function resolveLabelOverlaps<T extends { x: number; y: number }>(items: T[]): T[] {
  const pos = items.map((it) => ({ ...it }));
  for (let iter = 0; iter < 8; iter++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i];
        const b = pos[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = LABEL_W - Math.abs(dx);
        const overlapY = LABEL_H - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          // Push apart along whichever axis has the smaller overlap — the
          // standard AABB-separation heuristic, so a mostly-vertical
          // cluster nudges apart vertically and a mostly-horizontal one
          // nudges apart sideways, instead of always picking one axis.
          if (overlapX < overlapY) {
            const push = overlapX / 2 + 1;
            const dir = dx === 0 ? 1 : Math.sign(dx);
            a.x -= push * dir;
            b.x += push * dir;
          } else {
            const push = overlapY / 2 + 1;
            const dir = dy === 0 ? 1 : Math.sign(dy);
            a.y -= push * dir;
            b.y += push * dir;
          }
        }
      }
    }
    if (!moved) break;
  }
  return pos;
}

/**
 * The controls hint's wording ("ctrl+scroll to zoom", "click objects") only
 * makes sense for a mouse/trackpad visitor — a phone visitor swipes to climb,
 * pinches to zoom, and taps rather than clicks. `(pointer: coarse)` is the
 * standard signal for "primary input is touch," kept live via the media
 * query's own change event so it still updates if a hybrid device (e.g. a
 * tablet with a plugged-in mouse) switches input mid-session.
 */
function useIsTouchPrimary(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setTouch(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return touch;
}

/** Shadow stack that keeps light text readable against the bright sky. */
const TEXT_SHADOW = {
  textShadow: "0 1px 3px rgba(5,11,23,0.85), 0 2px 14px rgba(5,11,23,0.6)",
} as const;

export default function Overlay() {
  const progress = useUIStore((s) => s.progress);
  const currentStationId = useUIStore((s) => s.currentStationId);
  const travelToStation = useUIStore((s) => s.travelToStation);
  const setOpenPaneId = useUIStore((s) => s.setOpenPaneId);
  const beaconLabels = useUIStore((s) => s.beaconLabels);
  const showHero = progress < HERO_PROGRESS_END;
  const isTouchPrimary = useIsTouchPrimary();
  const isSmallScreen = useIsSmallScreen();

  const declutteredBeaconLabels = useMemo(() => {
    const visible = BEACON_LABEL_STATIONS.filter((s) => beaconLabels[s.id]?.visible).map((s) => ({
      id: s.id,
      x: beaconLabels[s.id].x,
      y: beaconLabels[s.id].y,
    }));
    const resolved = resolveLabelOverlaps(visible);
    return Object.fromEntries(resolved.map((l) => [l.id, l]));
  }, [beaconLabels]);

  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {/* Top scrim so header chrome always reads against the sky. Taller on
          small screens, where the header wraps onto two rows (station nav
          below the Resume/Contact pair) instead of one. */}
      <div
        className="absolute inset-x-0 top-0 h-20 max-md:h-32"
        style={{ background: "linear-gradient(rgba(5,11,23,0.55), transparent)" }}
        aria-hidden
      />

      {/* Top chrome */}
      {/* pointer-events-none on the BAR, auto on the individual controls.
          This bar is a flex row with content only at the far left and far
          right — the wide empty space between them was previously live and
          swallowing clicks. That matters because it sits at z-30 while the
          in-world station labels are drei <Html> elements capped at z-25, so
          anything the bar covers is unreachable even though it's plainly
          visible underneath. The Research Station label is mounted higher
          than any other (anchor.y + 3.6 vs 2.1-2.6), so viewed from lower on
          the trail it lands right under this bar and its "click to travel"
          became completely dead. Keep new header chrome pointer-events-auto
          on the control itself, never on the bar. */}
      <header className="pointer-events-none relative flex items-start justify-between gap-3 px-4 py-4 sm:px-8">
        <span
          className="shrink-0 pt-1.5 text-sm font-bold tracking-widest text-white"
          style={TEXT_SHADOW}
        >
          {SITE.name
            .split(" ")
            .map((w) => w[0])
            .join("")}
        </span>
        {/* Station nav + Resume/Contact share the top-right corner. On a wide
            screen they're one row (nav first, then the two buttons — the nav
            reads as "a couple extra buttons along the top right", same pill
            styling). Below 768px there isn't room for nine pills in a row, so
            this becomes a column: Resume/Contact stay on top and the nav wraps
            to a second row that scrolls horizontally if it overflows. */}
        <div className="flex min-w-0 flex-col items-end gap-2 md:flex-row md:items-center md:gap-3">
          {/* The nav CONTAINER stays pointer-events-none with only the buttons
              live — see the header comment above. It spans a wide strip of the
              top of the screen, and in-world StationLabels are drei <Html>
              capped at z-25 beneath this z-30 overlay, so a live container
              here would silently eat their clicks. */}
          <nav
            aria-label="Stations"
            className="no-scrollbar pointer-events-none order-2 flex max-w-full items-center gap-1.5 overflow-x-auto md:order-1 md:gap-2 md:overflow-x-visible"
          >
            {NAV_STATIONS.map((s) => {
              const active = s.id === currentStationId;
              return (
                <button
                  key={s.id}
                  onClick={() => travelToStation(s.id, s.t)}
                  className={`pointer-events-auto shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium text-white transition-colors max-md:min-h-[36px] ${
                    active
                      ? "border-sky-300/60"
                      : "border-transparent hover:border-white/25 hover:bg-white/10"
                  }`}
                  style={{
                    background: active ? "rgba(47,107,255,0.35)" : "rgba(6,14,28,0.6)",
                    ...TEXT_SHADOW,
                  }}
                  aria-current={active ? "true" : undefined}
                  title={`Travel to ${s.title}`}
                >
                  {s.short}
                </button>
              );
            })}
          </nav>
          <div className="pointer-events-auto order-1 flex shrink-0 items-center gap-3 text-sm md:order-2">
            <a
              href={SITE.resumeHref}
              className="rounded-full px-3 py-1.5 font-medium text-white transition-colors hover:bg-white/10"
              style={{ background: "rgba(6,14,28,0.6)", ...TEXT_SHADOW }}
            >
              Resume
            </a>
            <a
              href="#station-summit"
              onClick={(e) => {
                e.preventDefault();
                // Opens contact info in place — deliberately does NOT jump the
                // camera to the summit, so this can't be used to skip the climb.
                setOpenPaneId("summit");
              }}
              className="rounded-full border border-sky-300/50 px-4 py-1.5 font-medium text-white transition-colors hover:bg-sky-500/30"
              style={{ background: "rgba(47,107,255,0.35)", ...TEXT_SHADOW }}
            >
              Contact
            </a>
          </div>
        </div>
      </header>

      {/* Hero name/role, visible only at the base of the climb */}
      <AnimatePresence>
        {showHero && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="pointer-events-none absolute inset-x-0 top-[26%] flex flex-col items-center px-4 text-center"
          >
            <h1
              className="text-5xl font-bold tracking-tight text-white sm:text-7xl"
              style={{
                textShadow:
                  "0 2px 6px rgba(5,11,23,0.9), 0 6px 28px rgba(5,11,23,0.65), 0 0 60px rgba(47,107,255,0.35)",
              }}
            >
              {SITE.name}
            </h1>
            <div
              className="mt-5 rounded-full px-5 py-1.5"
              style={{ background: "rgba(6,14,28,0.55)" }}
            >
              <RoleCycler />
            </div>
            <p
              className="mt-8 animate-bounce rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white"
              style={{ background: "rgba(6,14,28,0.65)" }}
            >
              {isTouchPrimary ? "swipe to begin the climb ↓" : "scroll to begin the climb ↓"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls hint (fades once the visitor starts moving) */}
      <AnimatePresence>
        {progress > 0.02 && progress < 0.97 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // On small screens the bottom edge now belongs to StationPane's
            // mobile open-tab (and, once tapped, its bottom sheet) — this
            // hint used to sit at bottom-5 too and got hidden underneath
            // them. Moved up under the header instead of just hidden, since
            // the hint is still useful; desktop keeps the original bottom-5
            // placement untouched.
            className="absolute bottom-5 left-4 rounded-full px-3.5 py-1.5 text-[11px] font-medium text-white/90 sm:left-8 max-md:inset-x-4 max-md:bottom-auto max-md:top-28 max-md:text-center"
            style={{ background: "rgba(6,14,28,0.65)" }}
          >
            {/* Look-around and zoom used to be listed here. They are dropped
                deliberately: neither is reachable — CameraRig's listeners for
                them sit on the canvas, which ScrollControls' scroll div covers
                entirely (see the note in CameraRig.tsx) — so the hint was
                advertising controls that do nothing. */}
            {isTouchPrimary
              ? "swipe to walk · tap objects to explore"
              : "scroll to walk · click objects to explore"}
          </motion.p>
        )}
      </AnimatePresence>

      {/* The station quick-nav used to live here, as a vertical column on the
          LEFT edge. It's now a row of pills in the header (top right, beside
          Resume/Contact) — see the <header> above. */}

      {/* "Click to travel" labels next to each beacon, visible from the
          summit overlook. Positioned via a manual world->screen projection
          computed in Beacons.tsx and written to `beaconLabels` (plain DOM,
          not drei's `<Html>` — see the comment in Beacons.tsx for why).
          Small screens get none of these: on a phone-sized viewport they
          crowd the whole summit view, and the header nav now reaches every
          station from anywhere on the climb, so they have nothing left to
          offer there. */}
      {!isSmallScreen &&
        progress > 0.86 &&
        BEACON_LABEL_STATIONS.map((s) => {
          const label = declutteredBeaconLabels[s.id];
          if (!label) return null;
          const active = s.id === currentStationId;
          return (
            <button
              key={`${s.id}-beacon-label`}
              onClick={() => travelToStation(s.id, s.t)}
              className="group pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 select-none flex-col items-center gap-1 whitespace-nowrap"
              style={{ left: label.x, top: label.y }}
              aria-label={`Open ${s.title}`}
            >
              <span
                className="rounded-full border-2 px-3 py-1 text-xs font-bold text-white shadow-lg transition-transform group-hover:scale-105"
                style={{
                  background: "rgba(6,14,28,0.92)",
                  borderColor: active ? ACCENT_SIGNAL : `${ACCENT_SIGNAL}66`,
                  boxShadow: `0 4px 18px rgba(5,11,23,0.55), 0 0 12px ${ACCENT_SIGNAL}33`,
                }}
              >
                {s.title}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-white/90"
                style={{ background: "rgba(6,14,28,0.75)" }}
              >
                {active ? "click to open" : "click to travel"}
              </span>
            </button>
          );
        })}

      {/* Bottom progress bar */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-sky-300 to-white transition-[width] duration-150"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Station info pane (DOM layer, high-contrast, holds all real content) */}
      <StationPane />
    </div>
  );
}
