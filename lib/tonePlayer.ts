/**
 * Tone.js synth singleton, shared between `useAudioPrewarm` (lib/hooks.ts —
 * fires on the page's first user gesture, anywhere) and PianoStation.tsx's
 * note-playing calls.
 *
 * ## Three things this file has to get right, all of which were wrong before
 *
 * **1. The state must be genuinely shared.** `useAudioPrewarm` used to reach
 * this module via `import("@/lib/tonePlayer")` while `PianoStation` imports it
 * statically, and the bundler emitted two separate chunks for it (confirmed in
 * a running dev build: two distinct `lib_tonePlayer_ts_*` chunks and two
 * distinct `node_modules_tone_build_esm_index_*` chunks). If those evaluate as
 * two module instances then prewarm builds a synth in one copy while the piano
 * reads `synth === null` from the other, and EVERY first note pays the full
 * cold cost no matter how well prewarming works. Two defences: the hook now
 * imports this module statically (cheap — nothing heavy is imported at module
 * scope here; `tone` itself stays behind a dynamic import), and the state
 * below lives on `globalThis` so even a duplicated module evaluation shares
 * one synth.
 *
 * **2. The unlock must happen synchronously inside the gesture.** The hook
 * used to do `import(...).then((m) => m.prewarmSynth())`, so the actual
 * `Tone.start()` landed one or more microtasks/network round-trips after the
 * gesture had ended. Chrome's sticky activation forgives that; Safari's
 * transient activation does not. `prewarmSynth()` is now synchronous and the
 * module is already in hand when it runs.
 *
 * **3. Never cache "audio is ready" as a promise.** An older version kept a
 * single `synthPromise` guarded by `if (!synthPromise)`. `Tone.start()` called
 * without user activation returns a promise that stays PENDING INDEFINITELY
 * rather than rejecting — so one mistimed call (a mount effect, before any
 * gesture) poisoned the cache forever, every later note awaited it, and the
 * one call that would have worked was skipped by the guard. Cache the loaded
 * MODULE and the built SYNTH — real, settled values — and re-check
 * `getContext().state` every time, which also recovers a context the browser
 * suspends later (backgrounded tab).
 *
 * ## Why this uses a fixed pool of `Synth` and NOT `PolySynth`
 *
 * `PolySynth` cannot be pre-warmed — it actively undoes it. Two behaviours
 * combine, both measured in a real browser against Tone 15.1.22:
 *
 *  - It allocates voices **lazily**. `new PolySynth(...)` builds ZERO voices,
 *    so the first `triggerAttackRelease` must construct a whole `Synth`
 *    (oscillator, envelope, gain) before it can sound — 21ms for four voices,
 *    versus ~2ms to trigger an already-warm one.
 *  - It **garbage-collects idle voices** on a timer. Triggering a silent
 *    warmup chord does create four voices, and then Tone disposes them again
 *    while the page sits idle. Measured voice count after a silent 4-note
 *    warmup: 4 at +5s, 4 at +10s, 3 at +15s, 3 at +25s, 2 at +30s, still
 *    falling. A visitor scrolls for far longer than that before reaching the
 *    piano, so by the time they press a key the warmup has been entirely
 *    reclaimed and the first note pays full allocation cost — which is
 *    exactly the "first note is late, then collides with the second" symptom,
 *    and why warming a PolySynth appeared to change nothing.
 *
 * So: build a fixed pool of plain `Synth` voices once, hold references to
 * them forever, and round-robin through them. Nothing allocates lazily,
 * nothing is garbage-collected, and every note — first included — is a
 * trigger on an object that already exists.
 *
 * Tone's default 0.1s `lookAhead` adds a further flat 100ms between press and
 * sound, which is right for sequenced playback and wrong for an instrument
 * someone is clicking — lowered, not zeroed, since too low risks dropouts.
 *
 * ## iOS Safari: reported silent piano (hardened 2026-08-04)
 *
 * Everything traced above (the shared-state fix, the synchronous-unlock fix,
 * the never-cache-a-promise fix) was already in place and, on inspection,
 * every call site that resumes the context already does so synchronously,
 * directly inside a real gesture handler — including `playNote()`'s cold
 * path, which calls `prewarmSynth()` as its first statement, before any
 * `.then()`. So this wasn't a case of finding one broken line; it's a case
 * of iOS Safari being measurably less forgiving than every other engine
 * about audio unlock, in ways this project has no device to reproduce or
 * confirm against (see "Development environment quirks" in CLAUDE.md — this
 * sandbox cannot even mount the Canvas tree the piano lives in, let alone
 * test WebKit-specific audio behaviour). Two real, independently-documented
 * WebKit gaps this hardens against, on top of the already-correct logic:
 *
 * 1. **iOS Safari can suspend an AudioContext that's been open, resumed, and
 *    completely silent for a while — not just on tab-backgrounding** (which
 *    `visibilitychange` already covers), but as an idle/power-saving measure
 *    on a fully visible, foregrounded tab. A visitor exploring five other
 *    stations before ever pressing a key produces exactly that: minutes of
 *    an unlocked-but-silent context. The existing `contextRunning` check and
 *    re-resume-on-every-gesture design already recover from this on the
 *    NEXT gesture — but the piano key press itself dispatches through R3F's
 *    synthetic pointer-event system (see lesson 47 on the ScrollControls
 *    event-target indirection), and this project has no way to confirm from
 *    here whether every WebKit version treats that dispatch chain as
 *    equally "real" for activation purposes as a direct native listener.
 * 2. `nativeAudioUnlock()` below adds the classic, library-independent iOS
 *    unlock: create a throwaway native `AudioContext` and play a
 *    near-zero-length silent buffer through it, synchronously, inside a
 *    gesture. This predates every autoplay-policy API and doesn't depend on
 *    Tone's or `standardized-audio-context`'s resume() semantics at all —
 *    WebKit tracks audio-unlock as a per-DOCUMENT flag, set the moment ANY
 *    AudioContext on the page successfully plays through a real gesture,
 *    which is what lets Tone's own (separately created) context play later
 *    without a fresh gesture of its own. Belt-and-suspenders alongside
 *    Tone's own unlock, not a replacement for it — and it runs on every
 *    event `useAudioPrewarm` already listens for, which now also includes
 *    `touchend` and `click` (older WebKit's gesture-validity tracking has
 *    historically been pickier about which native event types "count" than
 *    Chrome's; touchstart/pointerdown alone may not be the full set on every
 *    iOS version still in the wild).
 *
 * Not fixable from here at all: iOS's physical mute/ring switch silences Web
 * Audio API output outright, with no JS-visible signal and no API to
 * override it from a web page (only native apps can set an AVAudioSession
 * category that bypasses it). If sound is still missing after this on a real
 * device, that switch is the next thing to check — it's a very common false
 * alarm for "the website's audio doesn't work on my phone," and this file
 * has no way to detect or report it.
 */

type ToneModule = typeof import("tone");
type SynthLike = {
  triggerAttackRelease: (
    note: string,
    duration: string | number,
    time?: number,
    velocity?: number
  ) => void;
  volume: { value: number };
};

/** Seconds of scheduling lookahead. Tone's default is 0.1 — see above. */
const INTERACTIVE_LOOKAHEAD = 0.02;
/**
 * Size of the permanent voice pool. The keyboard has 13 keys; this is enough
 * for any realistic chord or fast run without a voice being retriggered while
 * it is still ringing (each `Synth` is monophonic, so reusing one cuts its
 * previous note short). Twelve idle oscillator/envelope chains is a trivial
 * cost to hold open.
 */
const VOICE_COUNT = 12;

interface AudioState {
  tonePromise: Promise<ToneModule> | null;
  tone: ToneModule | null;
  /** Permanent, never disposed — see the PolySynth note above. */
  voices: SynthLike[];
  nextVoice: number;
}

// On globalThis, not module scope — see point 1 above.
const STATE_KEY = "__portfolioTonePlayerState";
const globalScope = globalThis as unknown as Record<string, AudioState | undefined>;
const state: AudioState =
  globalScope[STATE_KEY] ??
  (globalScope[STATE_KEY] = { tonePromise: null, tone: null, voices: [], nextVoice: 0 });

function contextRunning(T: ToneModule): boolean {
  try {
    return T.getContext().state === "running";
  } catch {
    return false;
  }
}

/**
 * The classic, library-independent iOS Safari Web Audio unlock — see the
 * "iOS Safari: reported silent piano" section of this file's doc comment for
 * why this exists alongside (not instead of) Tone's own resume path. Runs at
 * most once per page load; every call after the first is a no-op.
 */
let nativeUnlockAttempted = false;
function nativeAudioUnlock() {
  if (nativeUnlockAttempted || typeof window === "undefined") return;
  nativeUnlockAttempted = true;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    // This throwaway context has done its one job (setting WebKit's
    // per-document audio-unlock flag) — close it rather than holding a
    // second open AudioContext for the rest of the page's life.
    setTimeout(() => void ctx.close().catch(() => {}), 1000);
  } catch {
    /* best-effort only — Tone's own unlock path still runs regardless */
  }
}

/** The dynamic import IS safe to cache — it settles regardless of gestures. */
function loadTone(): Promise<ToneModule> {
  if (!state.tonePromise) {
    state.tonePromise = import("tone").then((m) => {
      state.tone = m;
      // If activation already happened (common: the module finishes loading
      // just after the gesture that requested it), take the opportunity.
      if (contextRunning(m)) buildSynth(m);
      return m;
    });
  }
  return state.tonePromise;
}

function buildSynth(T: ToneModule) {
  if (state.voices.length) return;
  // Optional refinement, wrapped so a failure can never stop the voices being
  // built — an earlier version had this inline in a path whose only caller
  // swallowed exceptions, which would have silently killed all audio.
  try {
    T.getContext().lookAhead = INTERACTIVE_LOOKAHEAD;
  } catch {
    /* keep Tone's default lookahead */
  }
  const built: SynthLike[] = [];
  for (let i = 0; i < VOICE_COUNT; i++) {
    const voice = new T.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.004, decay: 0.35, sustain: 0.2, release: 1 },
    }).toDestination();
    voice.volume.value = -8;
    built.push(voice as unknown as SynthLike);
  }
  // Assigned synchronously, so concurrent callers can't build two pools.
  state.voices = built;
  // One silent pass (velocity 0) so every voice's oscillator/envelope path
  // has actually run once before the visitor hears anything. Unlike the old
  // PolySynth warmup this can't be undone later — these voices are held for
  // the lifetime of the page and nothing disposes them.
  try {
    const now = T.now();
    for (const voice of built) voice.triggerAttackRelease("C4", 0.01, now, 0);
  } catch {
    /* harmless — the voices exist either way */
  }
}

/** Starts fetching Tone. No user gesture required — it's just a download. */
export function preloadTone() {
  void loadTone().catch(() => {});
}

/** True once a note would play immediately, with no setup left to do. */
export function isAudioReady(): boolean {
  return !!(state.tone && state.voices.length && contextRunning(state.tone));
}

/** Round-robin so a voice is never retriggered while it's still ringing. */
function takeVoice(): SynthLike {
  const voice = state.voices[state.nextVoice % state.voices.length];
  state.nextVoice = (state.nextVoice + 1) % state.voices.length;
  return voice;
}

/**
 * Unlocks audio and builds the synth. MUST be called SYNCHRONOUSLY from a
 * real user-gesture handler — never from an effect, a timer, or a `.then()`.
 * Safe to call repeatedly; callers should keep calling on each gesture until
 * `isAudioReady()` returns true, since the first attempt can land before the
 * Tone module has finished downloading.
 */
export function prewarmSynth() {
  // Independent of everything below — see this file's "iOS Safari" doc
  // comment. Cheap after the first call (a stored flag short-circuits it).
  nativeAudioUnlock();
  const T = state.tone;
  if (!T) {
    preloadTone();
    return;
  }
  if (contextRunning(T)) {
    buildSynth(T);
    return;
  }
  // Called synchronously here, inside the gesture. Building the synth needs
  // no activation of its own, so it can wait for the resume to settle.
  void T.start()
    .then(() => buildSynth(T))
    .catch(() => {});
}

export function playNote(note: string) {
  const T = state.tone;
  // Fast path: nothing between the key press and the sound, not even an await
  // — and the voice already exists, so there is no allocation either.
  if (T && state.voices.length && contextRunning(T)) {
    try {
      takeVoice().triggerAttackRelease(note, "8n", T.now());
    } catch {
      /* audio unavailable — caller still animates the key */
    }
    return;
  }
  // Cold path: only reached if prewarm never got a usable gesture, or the
  // context was suspended since. This press is itself a gesture, so unlock
  // from it directly, then play once there's something to play on.
  prewarmSynth();
  void loadTone()
    .then(async (T2) => {
      if (!contextRunning(T2)) await T2.start();
      buildSynth(T2);
      if (state.voices.length) takeVoice().triggerAttackRelease(note, "8n", T2.now());
    })
    .catch(() => {});
}
