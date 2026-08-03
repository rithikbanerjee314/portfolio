"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUIStore } from "@/lib/store";
import { useIsSmallScreen } from "@/lib/hooks";
import { getStationContent } from "@/components/stations/stations.data";
import { STATION_ORDER } from "@/components/world/stations-meta";
import { SITE, INTRO, SKILLS, RESEARCH } from "@/lib/content";

function getStationTitle(id: string): string {
  return STATION_ORDER.find((s) => s.id === id)?.title ?? id;
}

/**
 * Give-up window for a requested pane whose camera travel never completes —
 * the visitor clicked a station in the nav and then scrolled somewhere else
 * mid-journey. Must comfortably exceed the longest travel tween (see
 * CameraRig's TRAVEL_* constants); same bounded-fallback shape as
 * TrailMapGate/VaultGate's PENDING_TIMEOUT_MS, and just as harmless if it
 * fires early, since the pane only opens on a real arrival either way.
 */
const PANE_ARRIVAL_TIMEOUT_MS = 8000;

/**
 * The readable info layer. On desktop: a solid, high-contrast DOM panel that
 * slides in from the right and auto-opens once when the visitor arrives at a
 * station; closing it (✕ or Escape) reveals a small reopen tab on the right
 * edge until they leave and come back. On small screens this is a
 * deliberately different layout (see `isSmallScreen` below), not just a
 * scaled-down copy of the desktop one. All project/skills/contact content
 * lives here — never in-canvas.
 */
export default function StationPane() {
  const openPaneId = useUIStore((s) => s.openPaneId);
  const setOpenPaneId = useUIStore((s) => s.setOpenPaneId);
  const pendingPaneId = useUIStore((s) => s.pendingPaneId);
  const setPendingPaneId = useUIStore((s) => s.setPendingPaneId);
  const currentStationId = useUIStore((s) => s.currentStationId);
  const isParked = useUIStore((s) => s.isParked);
  const lastAutoOpened = useRef<string | null>(null);
  // Drives two structurally different render branches below (slide-from-
  // bottom half-height sheet vs. slide-from-right full-height panel), not
  // just a couple of responsive classes — see lib/hooks.ts's doc comment.
  const isSmallScreen = useIsSmallScreen();

  // A pane explicitly requested by a "travel here" control opens when the
  // camera ARRIVES, not when the button was clicked (see the store's
  // `pendingPaneId`). This is separate from the auto-open below because the
  // two answer different questions: auto-open is "you've reached somewhere
  // new, here's what's here", and fires at most once per visit; this is "you
  // asked for this specific panel", which must honour the request even at a
  // station whose pane the visitor already opened and closed once.
  //
  // On small screens, NEITHER of these opens the pane automatically — the
  // panel now covers real screen space (a bottom sheet, not a slim side
  // strip) and popping it up unprompted was the exact thing reported as
  // "takes up the entire screen ... I don't like this view at all". The
  // camera still travels to the station either way; only the actual panel
  // reveal now waits for an explicit tap on the bottom tab (see
  // `showOpenTab` below). `pendingPaneId` is still cleared here so it can't
  // linger and pop the pane open later on a delayed arrival.
  useEffect(() => {
    if (!pendingPaneId) return;
    if (isParked && currentStationId === pendingPaneId) {
      if (!isSmallScreen) setOpenPaneId(pendingPaneId);
      // Claim the auto-open latch too, so arriving doesn't count as a fresh
      // visit that would re-open this same pane again if it's closed quickly.
      lastAutoOpened.current = pendingPaneId;
      setPendingPaneId(null);
      return;
    }
    const timeout = setTimeout(() => setPendingPaneId(null), PANE_ARRIVAL_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [pendingPaneId, isParked, currentStationId, isSmallScreen, setOpenPaneId, setPendingPaneId]);

  // Auto-open on arrival at a station (once per visit; closing won't re-open
  // until the visitor leaves and comes back). Small screens skip the actual
  // open (see comment above) but still claim the latch, so a visitor who
  // taps the bottom tab open, closes it, and lingers at the same station
  // doesn't have it pop back open on its own.
  useEffect(() => {
    if (!isParked) return;
    // vault DOES have a normal pane (its own StationContent entry) — only clicking
    // the chest object itself opens the fullscreen vault room. The trail map used
    // to be its own station excluded here the same way; it now lives on intro's
    // own board (see IntroStation.tsx), so intro keeps its normal pane behavior
    // and there's no separate "trailmap" id to exclude anymore.
    if (currentStationId === "base") return;
    if (lastAutoOpened.current === currentStationId) return;
    lastAutoOpened.current = currentStationId;
    if (!isSmallScreen) setOpenPaneId(currentStationId);
  }, [isParked, currentStationId, isSmallScreen, setOpenPaneId]);

  // Reset the auto-open latch once the visitor moves to a different station
  useEffect(() => {
    if (lastAutoOpened.current && lastAutoOpened.current !== currentStationId) {
      lastAutoOpened.current = null;
    }
  }, [currentStationId]);

  // Escape closes
  useEffect(() => {
    if (!openPaneId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPaneId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPaneId, setOpenPaneId]);

  // Whether a pane exists to open/reopen: parked at a real station whose
  // pane isn't currently showing (closed via the ✕, a station the visitor
  // already left without ever opening, or — on small screens — ANY station,
  // since the pane never opens itself there). On desktop this is the "come
  // back in" tab; on small screens it's the ONLY way the pane ever opens.
  const showOpenTab = isParked && currentStationId !== "base" && openPaneId !== currentStationId;

  return (
    <>
      {/* --- Desktop: side panel + right-edge reopen tab ------------------
          Untouched from before the mobile layout existed — same markup,
          same classes, same animation. Gated on !isSmallScreen so nothing
          here can ever affect what a small-screen visitor sees. */}
      <AnimatePresence>
        {!isSmallScreen && showOpenTab && (
          <motion.button
            key={`tab-${currentStationId}`}
            initial={{ x: 44, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 44, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={() => setOpenPaneId(currentStationId)}
            className="pointer-events-auto fixed right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-sky-300/30 px-3 py-4 text-white shadow-xl transition-colors hover:border-sky-300/60 sm:right-4"
            style={{ background: "rgba(6, 14, 28, 0.9)" }}
            aria-label={`Reopen ${getStationTitle(currentStationId)} panel`}
          >
            <span aria-hidden className="text-sm leading-none">
              ‹
            </span>
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ writingMode: "vertical-rl" }}
            >
              {getStationTitle(currentStationId)}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!isSmallScreen && openPaneId && (
          <motion.aside
            key={openPaneId}
            initial={{ x: "105%" }}
            animate={{ x: 0 }}
            exit={{ x: "105%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            // Top edge sits BELOW the header (initials + station nav +
            // Resume/Contact), not at inset-y-0. The panel used to start at
            // the very top of the viewport and cover the whole right end of
            // the header, so opening any pane made Resume/Contact — and now
            // the station nav that moved up there — unreachable until it was
            // closed again. 4.75rem clears the header's real height
            // (py-4 + a ~34px button row) with a little margin.
            className="pointer-events-auto fixed bottom-4 right-4 top-[4.75rem] z-40 flex w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-sky-300/25 shadow-2xl"
            style={{ background: "rgba(6, 14, 28, 0.96)" }}
            role="dialog"
            aria-label="Station details"
          >
            <button
              onClick={() => setOpenPaneId(null)}
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600 bg-slate-900/80 text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
              aria-label="Close panel"
            >
              ✕
            </button>
            <div className="p-6 sm:p-7">
              <PaneContent id={openPaneId} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* --- Small screen: bottom sheet, roughly two-thirds height --------
          Explicitly NOT a shrunk copy of the desktop panel: it slides up
          from the bottom (not in from the side), covers only part of the
          screen so the mountain stays visible above it, never opens itself
          (see the two effects above), and only ever opens from a deliberate
          tap on the bottom tab below. Internal content scrolls within its
          own fixed height rather than the sheet growing to fit. */}
      <AnimatePresence>
        {isSmallScreen && showOpenTab && (
          <motion.button
            key={`mobile-tab-${currentStationId}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={() => setOpenPaneId(currentStationId)}
            className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-2 rounded-t-2xl border-t border-sky-300/30 px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3 text-white shadow-xl transition-colors active:border-sky-300/60"
            style={{ background: "rgba(6, 14, 28, 0.92)" }}
            aria-label={`Open ${getStationTitle(currentStationId)} panel`}
          >
            <span aria-hidden className="text-sm leading-none">
              ▲
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              {getStationTitle(currentStationId)}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isSmallScreen && openPaneId && (
          <motion.aside
            key={`mobile-${openPaneId}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex h-[65vh] max-h-[65vh] flex-col overflow-hidden rounded-t-2xl border-t border-sky-300/25 shadow-2xl"
            style={{ background: "rgba(6, 14, 28, 0.97)" }}
            role="dialog"
            aria-label="Station details"
          >
            {/* Grab-handle affordance — signals "this is a sheet, more is
                below" the way a native bottom sheet would. */}
            <div className="flex shrink-0 justify-center pb-1 pt-2.5" aria-hidden>
              <div className="h-1.5 w-10 rounded-full bg-slate-500/60" />
            </div>
            <button
              onClick={() => setOpenPaneId(null)}
              className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-600 bg-slate-900/80 text-slate-300 transition-colors active:border-slate-400 active:text-white"
              aria-label="Close panel"
            >
              ✕
            </button>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
              <PaneContent id={openPaneId} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function PaneContent({ id }: { id: string }) {
  if (id === "intro") return <IntroPane />;
  if (id === "summit") return <SummitPane />;
  return <ProjectPane id={id} />;
}

function IntroPane() {
  return (
    <>
      <p className="text-3xl max-md:text-2xl" aria-hidden>
        👋
      </p>
      <h2 className="mt-2 text-2xl max-md:text-xl font-bold text-white">{INTRO.heading}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-200">
        {INTRO.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <h3 className="mb-3 mt-7 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
        Skills
      </h3>
      <div className="space-y-4">
        {SKILLS.map((group) => (
          <div key={group.category}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400">
              {group.category}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-xs text-slate-100"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SummitPane() {
  const links = [
    { label: "Email", href: `mailto:${SITE.email}`, desc: SITE.email },
    { label: "GitHub", href: SITE.github, desc: "rithikbanerjee314" },
    { label: "LinkedIn", href: SITE.linkedin, desc: "Connect with me" },
    { label: "Resume", href: SITE.resumeHref, desc: "Download PDF" },
  ];
  return (
    <>
      <p className="text-3xl max-md:text-2xl" aria-hidden>
        🏔
      </p>
      <h2 className="mt-2 text-2xl max-md:text-xl font-bold text-white">Contact Me</h2>
      <p className="mt-3 text-sm leading-relaxed text-slate-200">
        Thanks for climbing with me! I&apos;m always happy to talk about AI engineering,
        systems programming, or fusion research. The fastest way to reach me is email.
      </p>
      <div className="mt-6 space-y-3">
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target={l.href.startsWith("mailto:") ? undefined : "_blank"}
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-sky-400/25 bg-sky-500/10 px-5 py-4 transition-colors hover:border-sky-300/60 hover:bg-sky-500/20"
          >
            <span className="font-semibold text-white">{l.label}</span>
            <span className="text-xs text-slate-300">{l.desc}</span>
          </a>
        ))}
      </div>
    </>
  );
}

function ProjectPane({ id }: { id: string }) {
  const content = getStationContent(id);
  if (!content) return null;
  return (
    <>
      <p className="text-3xl max-md:text-2xl" aria-hidden>
        {content.emoji}
      </p>
      <h2 className="mt-2 text-2xl max-md:text-xl font-bold text-white">{content.title}</h2>
      <p className="mt-1 text-sm font-semibold" style={{ color: content.accent }}>
        {content.tagline}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-slate-200">{content.blurb}</p>
      <p className="mt-3 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs italic text-slate-300">
        ▶ {content.interactionHint}
      </p>

      {id === "tokamak" && (
        <div className="mt-5 space-y-3 text-sm leading-relaxed text-slate-200">
          {RESEARCH.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {content.projects.length > 0 && (
        <>
          <h3 className="mb-3 mt-7 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
            Projects
          </h3>
          <div className="space-y-4">
            {content.projects.map((p) => (
              <div key={p.name} className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 max-md:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold text-white">{p.name}</h4>
                  {p.highlight && (
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                      style={{ background: `${content.accent}26`, color: content.accent }}
                    >
                      {p.highlight}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.stack.map((s) => (
                    <span
                      key={s}
                      className="rounded-md bg-slate-700/70 px-2 py-0.5 text-xs text-slate-200"
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{p.description}</p>
                <div className="mt-3 flex gap-4 text-sm">
                  {p.github && (
                    <a
                      href={p.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-sky-300 underline-offset-4 hover:text-sky-200 hover:underline"
                    >
                      GitHub ↗
                    </a>
                  )}
                  {p.demo && (
                    <a
                      href={p.demo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-sky-300 underline-offset-4 hover:text-sky-200 hover:underline"
                    >
                      Live Website ↗
                    </a>
                  )}
                  {p.paper && (
                    <a
                      href={p.paper}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-sky-300 underline-offset-4 hover:text-sky-200 hover:underline"
                    >
                      Paper ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
