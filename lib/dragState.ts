"use client";

/**
 * Gesture arbitration between a station object's own pointer drag (chess
 * king, tokamak) and the page's climb scroll.
 *
 * ## Why this exists at all
 *
 * drei's `ScrollControls` does NOT scroll the canvas. It creates its own
 * `<div>`, appends it to the canvas's PARENT (so it's a sibling that fully
 * covers the canvas), makes it the page's real scroll container, and then
 * re-points R3F's whole event system at it:
 *
 *     requestAnimationFrame(() => events.connect?.(el))
 *
 * Two consequences that every pointer interaction in this project has to be
 * written around:
 *
 *  1. **That div — not `gl.domElement` — is what pointer/touch events
 *     actually land on.** A listener added to the canvas never fires,
 *     and `touch-action` set on the canvas governs nothing.
 *  2. **A touch that starts on a 3D object still starts a native scroll of
 *     that div**, because as far as the browser is concerned the finger went
 *     down inside a scrollable element. On desktop this is invisible (a mouse
 *     drag doesn't scroll anything); on touch it means dragging the chess
 *     piece or the tokamak ALSO flies the camera up the mountain, and once
 *     the browser claims the gesture for scrolling it fires `pointercancel`
 *     and the object's drag dies mid-gesture. That is the "tap/hold is
 *     glitching and fighting the camera" bug, and it is touch-only by
 *     construction.
 *
 * The usual fix — `preventDefault()` on the pointerdown — cannot work here:
 * R3F registers its `pointerdown` listener as `{ passive: true }` (see
 * `DOM_EVENTS` in @react-three/fiber's events module), so a
 * `preventDefault()` from inside a mesh's `onPointerDown` is ignored by the
 * browser and only produces an "Unable to preventDefault inside passive event
 * listener invocation" console error.
 *
 * So scroll suppression is done where it can actually take effect: a pair of
 * document-level, **capture-phase, non-passive** `touchstart`/`touchmove`
 * listeners that call `preventDefault()` only while an object gesture owns
 * the pointer. Touch input dispatches `pointerdown` BEFORE `touchstart`, so by
 * the time these run the object has already claimed the gesture and the native
 * scroll can be cancelled before it ever starts. `touch-action: none` is
 * applied to the scroll element for the gesture's duration as a second,
 * independent layer.
 *
 * Plain module state rather than zustand: this is read synchronously from
 * inside pointer handlers, never rendered.
 */

/**
 * True while a station object owns the current pointer gesture. Read by
 * `CameraRig` before arming its own look-around drag, and by the touch
 * blockers below.
 */
export const dragState = {
  activeObject: false,
};

/** pointerId that owns the current object gesture; null when idle. */
let activePointerId: number | null = null;

/** ScrollControls' scroll `<div>` — see the doc comment above. */
let scrollEl: HTMLElement | null = null;
/** Non-null only while we've overridden the scroll element's touch-action. */
let savedTouchAction: string | null = null;

/**
 * Registered by `CameraRig` (the one component with a `useScroll()` handle)
 * so this module can suppress the climb scroll for the duration of an object
 * gesture without every station needing its own reference to it.
 */
export function registerScrollElement(el: HTMLElement | null): void {
  scrollEl = el;
}

const blockTouchScroll = (e: TouchEvent) => {
  if (!dragState.activeObject) return;
  if (e.cancelable) e.preventDefault();
};

let blockersInstalled = false;
function installTouchBlockers(): void {
  if (blockersInstalled || typeof document === "undefined") return;
  blockersInstalled = true;
  // Capture phase so this runs before the scroll container's own handling,
  // non-passive so preventDefault is actually honoured. Both listeners
  // early-return unless a gesture is live, so leaving them installed for the
  // page's lifetime costs nothing.
  document.addEventListener("touchstart", blockTouchScroll, { capture: true, passive: false });
  document.addEventListener("touchmove", blockTouchScroll, { capture: true, passive: false });
}

export function beginObjectGesture(pointerId: number): void {
  installTouchBlockers();
  activePointerId = pointerId;
  dragState.activeObject = true;
  if (scrollEl && savedTouchAction === null) {
    savedTouchAction = scrollEl.style.touchAction;
    scrollEl.style.touchAction = "none";
  }
}

export function endObjectGesture(): void {
  activePointerId = null;
  dragState.activeObject = false;
  if (scrollEl && savedTouchAction !== null) {
    scrollEl.style.touchAction = savedTouchAction;
    savedTouchAction = null;
  }
}

/** True if this pointerId is the one that started the active object gesture. */
export function isGesturePointer(pointerId: number): boolean {
  return activePointerId !== null && activePointerId === pointerId;
}

/**
 * `setPointerCapture` / `releasePointerCapture` both throw a DOMException
 * (`NotFoundError` / "InvalidPointerId") when the pointerId no longer matches
 * an active pointer — which is routine on touch, where a pointer is retired
 * the moment the finger lifts or the gesture is cancelled. Unguarded, those
 * throws escaped from window-level listeners and surfaced as the on-screen
 * error overlay. `hasPointerCapture` handles the common case; the try/catch
 * covers the rest (and browsers that disagree about exactly when a touch
 * pointer stops being "active").
 */
export function capturePointer(el: Element | null, pointerId: number): void {
  if (!el?.setPointerCapture) return;
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* pointer already gone — nothing to capture, and nothing to report */
  }
}

export function releasePointer(el: Element | null, pointerId: number): void {
  if (!el?.releasePointerCapture) return;
  try {
    if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
  } catch {
    /* pointer already retired — implicit release already happened */
  }
}
