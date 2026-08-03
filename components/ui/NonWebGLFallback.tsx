"use client";

import { SITE, INTRO } from "@/lib/content";
import { STATIONS } from "@/components/stations/stations.data";

/**
 * Plain document-scroll fallback when WebGL is unavailable: all station
 * content in order, no canvas, no physics.
 */
export default function NonWebGLFallback() {
  return (
    <main className="hero-fallback mx-auto min-h-screen max-w-2xl px-6 py-20">
      <h1 className="text-4xl font-bold text-white">{SITE.name}</h1>
      <p className="mt-4 text-slate-300">{INTRO.paragraphs[0]}</p>
      <div className="mt-12 space-y-10">
        {STATIONS.map((s) => (
          <section key={s.id} className="glass-panel rounded-2xl p-6">
            <div className="mb-1 text-3xl">{s.emoji}</div>
            <h2 className="text-xl font-bold text-white">{s.title}</h2>
            <p className="mb-2 text-sm font-medium" style={{ color: s.accent }}>
              {s.tagline}
            </p>
            <p className="text-sm text-slate-300">{s.blurb}</p>
            {s.projects.map((p) => (
              <div key={p.name} className="mt-3 border-t border-white/10 pt-3 text-sm">
                <p className="font-semibold text-slate-100">{p.name}</p>
                <p className="text-slate-400">{p.description}</p>
                {p.github && (
                  <a href={p.github} className="text-blue-300 hover:underline">
                    GitHub ↗
                  </a>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
      <footer className="mt-16 flex flex-wrap gap-4 text-sm">
        <a href={SITE.github} className="text-blue-300 hover:underline">GitHub</a>
        <a href={SITE.linkedin} className="text-blue-300 hover:underline">LinkedIn</a>
        <a href={`mailto:${SITE.email}`} className="text-blue-300 hover:underline">Email</a>
        <a href={SITE.resumeHref} className="text-blue-300 hover:underline">Resume</a>
      </footer>
    </main>
  );
}
