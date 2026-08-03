"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import {
  beginObjectGesture,
  capturePointer,
  endObjectGesture,
  isGesturePointer,
  releasePointer,
} from "./dragState";

export interface ObjectDragEnd {
  /**
   * True when the gesture was taken away rather than finished by the visitor
   * lifting their finger/mouse — a `pointercancel`, a second finger landing
   * (pinch attempt), the tab being hidden, or the component unmounting. A
   * cancelled gesture should always be treated as "put it back / do nothing",
   * never as a completed throw.
   */
  cancelled: boolean;
  /**
   * How far the pointer physically travelled, in CSS pixels. This is the
   * right unit for a tap-vs-drag decision: the same finger movement covers a
   * different WORLD-space distance depending on camera FOV, zoom and distance
   * to the object, so a world-space threshold silently means something
   * different on every screen (which is how ordinary mobile finger jitter
   * during an intended tap started registering as a throw).
   */
  movedPx: number;
}

/**
 * One consistent pointer-gesture lifecycle for every draggable station object.
 *
 * Everything here exists because of how the pointer plumbing in this project
 * actually works — see `lib/dragState.ts` for the full explanation. The short
 * version: R3F's events are connected to ScrollControls' scroll `<div>`, not
 * the canvas; its `pointerdown` listener is passive, so a mesh handler cannot
 * `preventDefault()`; and a touch that starts on an object would otherwise
 * scroll the climb at the same time as dragging the object.
 *
 * What this guarantees for a caller:
 *
 * - The climb scroll is suppressed for the gesture's duration (touch only —
 *   a mouse never scrolled anything to begin with), so the object drag and
 *   the camera can't both act on one gesture.
 * - Exactly one pointer drives the drag. Moves from a second finger, or from
 *   a stale pointer left over from a previous gesture, are ignored.
 * - `onEnd` ALWAYS runs exactly once per `start`, including on
 *   `pointercancel`, a pinch attempt, tab-hide, and unmount. Before this,
 *   `pointercancel` (which touch browsers fire routinely) left the drag
 *   permanently "in progress": the object kept following every later pointer
 *   move anywhere on the page, and the stale pointerId went on to throw a
 *   DOMException out of `releasePointerCapture` on the next tap.
 * - Pointer capture is set and released defensively, so it can never throw.
 */
export function useObjectDrag(handlers: {
  onStart?: (e: ThreeEvent<PointerEvent>) => void;
  onMove?: (e: PointerEvent) => void;
  onEnd?: (info: ObjectDragEnd) => void;
}) {
  // Handlers are re-read through a ref so the window listeners below can be
  // installed once and never need re-binding as the station re-renders.
  const latest = useRef(handlers);
  latest.current = handlers;

  const active = useRef(false);
  const pointerId = useRef<number | null>(null);
  const captureTarget = useRef<Element | null>(null);
  const startClient = useRef({ x: 0, y: 0 });
  const lastClient = useRef({ x: 0, y: 0 });
  const prevUserSelect = useRef("");

  const stop = useCallback((cancelled: boolean) => {
    if (!active.current) return;
    active.current = false;
    if (pointerId.current !== null) {
      releasePointer(captureTarget.current, pointerId.current);
      pointerId.current = null;
    }
    captureTarget.current = null;
    endObjectGesture();
    document.body.style.userSelect = prevUserSelect.current;
    latest.current.onEnd?.({
      cancelled,
      movedPx: Math.hypot(
        lastClient.current.x - startClient.current.x,
        lastClient.current.y - startClient.current.y
      ),
    });
  }, []);

  /** Wire this to the object's `onPointerDown`. */
  const start = useCallback((e: ThreeEvent<PointerEvent>) => {
    // Stops R3F from also dispatching this hit to meshes behind the object.
    // Note it does NOT stop the native event — R3F's stopPropagation only
    // sets a flag on its own raycast iteration — which is exactly why the
    // scroll suppression in dragState.ts is needed on top of it.
    e.stopPropagation();
    if (active.current) return;
    active.current = true;
    pointerId.current = e.pointerId;
    // Capture on the element the event was actually dispatched to (the
    // ScrollControls div), not on the canvas: the canvas is covered and never
    // in the event path, so capturing there pinned the gesture to an element
    // that receives nothing.
    captureTarget.current = (e.nativeEvent.target as Element | null) ?? null;
    capturePointer(captureTarget.current, e.pointerId);
    beginObjectGesture(e.pointerId);
    startClient.current = { x: e.clientX, y: e.clientY };
    lastClient.current = { x: e.clientX, y: e.clientY };
    prevUserSelect.current = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    latest.current.onStart?.(e);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!active.current || !isGesturePointer(e.pointerId)) return;
      lastClient.current = { x: e.clientX, y: e.clientY };
      latest.current.onMove?.(e);
    };
    const onUp = (e: PointerEvent) => {
      if (!active.current || !isGesturePointer(e.pointerId)) return;
      stop(false);
    };
    const onCancel = (e: PointerEvent) => {
      if (!active.current || !isGesturePointer(e.pointerId)) return;
      stop(true);
    };
    // A second pointer going down mid-drag is a pinch/zoom attempt, not a
    // continuation of this drag. Ending here means the object stops where it
    // is instead of lurching toward whichever finger happens to move next.
    // The gesture's OWN pointerdown also reaches this listener (it bubbles to
    // window after R3F handles it) and is filtered out by the id check.
    const onOtherPointerDown = (e: PointerEvent) => {
      if (!active.current || isGesturePointer(e.pointerId)) return;
      stop(true);
    };
    const onInterrupt = () => {
      if (active.current) stop(true);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("pointerdown", onOtherPointerDown);
    window.addEventListener("blur", onInterrupt);
    document.addEventListener("visibilitychange", onInterrupt);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("pointerdown", onOtherPointerDown);
      window.removeEventListener("blur", onInterrupt);
      document.removeEventListener("visibilitychange", onInterrupt);
      // Unmounting mid-drag must not leave the global gesture flag latched —
      // that would suppress touch scrolling for the rest of the session.
      if (active.current) stop(true);
    };
  }, [stop]);

  return { start, isDragging: () => active.current };
}
