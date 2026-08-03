"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import * as THREE from "three";
import {
  getCameraPointInto,
  getLookAheadPointInto,
  getStationAnchor,
  nearestStation,
  PATH_CURVE,
  STATION_ORDER,
  STATION_ARRIVAL_EPSILON,
} from "./path";
import { sampleTerrainInto, type TerrainSample } from "./terrain-utils";
import { useUIStore } from "@/lib/store";
import {
  capturePointer,
  dragState,
  registerScrollElement,
  releasePointer,
} from "@/lib/dragState";

// Minimum clearance kept between the camera and the ground directly below
// it, checked every frame against the real terrain height at the camera's
// (x,z) — not just assumed from the hand-placed path/vista points.
const CAMERA_GROUND_CLEARANCE = 1.4;

// --- Click-to-travel tween -------------------------------------------------
// Nav clicks / station labels / beacon labels used to write `el.scrollTop`
// in a single assignment, so the ONLY thing standing between the visitor and
// the destination was ScrollControls' own damping — a fixed ~0.3s time
// constant regardless of how far the jump was. Travelling the entire
// mountain therefore took about as long as hopping to the next checkpoint,
// and both read as a snap rather than a climb. The scroll position is now
// eased to the destination over a real, distance-scaled duration instead.
/** Shortest travel (adjacent-ish checkpoints). */
const TRAVEL_MIN_MS = 1100;
/** Added on top, proportional to how much of the climb is being covered. */
const TRAVEL_PER_PROGRESS_MS = 4200;
/** Below this much progress difference, just set it — there's nothing to watch. */
const TRAVEL_NEGLIGIBLE = 0.002;

/**
 * Smootherstep (Ken Perlin's quintic): zero FIRST and SECOND derivative at
 * both ends, unlike the cubic smoothstep. That matters here because the
 * camera position is itself lerped toward this value every frame — a curve
 * that still has non-zero acceleration at t=0/t=1 hands the camera a small
 * but visible jolt at departure and arrival, which is most of what made the
 * old travel feel abrupt even before the duration was addressed.
 */
function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpTarget = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpUp = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();
const tmpPitchAxis = new THREE.Vector3();
// Reused every frame instead of reallocated — see path.ts's note on why the
// camera loop is worth keeping allocation-free.
const tmpBasePos = new THREE.Vector3();
const tmpLookAhead = new THREE.Vector3();
const tmpDollied = new THREE.Vector3();
const tmpGroundSample: TerrainSample = { height: 0, trailDist: 0, onPad: false, padWeight: 0 };

/**
 * Drives the camera along the mountain-climb path from scroll progress.
 * - Position/orientation: eased sample of the CatmullRom curve, never snapped.
 * - Zoom: ctrl/pinch-wheel dollies the camera along its forward vector,
 *   clamped so it can't pass through terrain/objects.
 * - Look-around: pointer-drag adds a bounded yaw/pitch offset, only while
 *   "parked" near a station (low scroll velocity + close to that station's t).
 */
export default function CameraRig() {
  const scroll = useScroll();
  const { camera, gl } = useThree();
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const setCameraState = useUIStore((s) => s.setCameraState);
  const setScrollHandler = useUIStore((s) => s.setScrollHandler);

  const zoomOffset = useRef(0);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const lastProgress = useRef(0);
  const progressVelocity = useRef(0);
  const storeThrottle = useRef(0);

  // Precomputed focus targets: each station's object anchor (slightly above
  // pad level so the camera frames the object, not the ground). Summit is
  // deliberately excluded — its anchor sits at nearly the same (x,z) as the
  // camera itself (no lateral offset, unlike every other station), so
  // blending toward it pitched the camera almost straight down into its own
  // cairn/flag at close range — the "clipping through the mountain" glitch.
  // The summit gets its own dedicated vista treatment below instead.
  const focusTargets = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    for (const s of STATION_ORDER) {
      if (s.id === "base" || s.id === "summit") continue;
      map.set(s.id, getStationAnchor(s).add(new THREE.Vector3(0, 0.9, 0)));
    }
    return map;
  }, []);
  // Summit finale: a moderate-height lookout beside the flag — high enough
  // to see every checkpoint laid out down the mountain (an "overlooking
  // everything below" view, not a ground-level standing shot), angled down
  // rather than straight-down so the horizon/sky still reads at the top of
  // frame. Two earlier attempts overshot in opposite directions: a 15-unit
  // drone shot left the flag out of frame entirely; a 2.4-unit standing shot
  // was too low to see the whole descent. This splits the difference.
  const { overlookPos, overlookTarget } = useMemo(() => {
    const summitPoint = PATH_CURVE.getPointAt(1);
    const endTangent = PATH_CURVE.getTangentAt(1).normalize();
    const right = new THREE.Vector3().crossVectors(endTangent, tmpUp).normalize();
    const overlookPos = summitPoint
      .clone()
      .addScaledVector(right, 5)
      .addScaledVector(endTangent, 1)
      .add(new THREE.Vector3(0, 9, 0));
    const overlookTarget = PATH_CURVE.getPointAt(0.35).add(new THREE.Vector3(0, 0.5, 0));
    return { overlookPos, overlookTarget };
  }, []);

  // Wheel with ctrl (trackpad pinch) or explicit pinch controls zoom instead
  // of scrolling the page.
  //
  // NOTE (2026-08-02): these listeners are attached to `gl.domElement` and, as
  // the codebase currently stands, NEVER FIRE. drei's ScrollControls appends
  // its own scroll `<div>` over the canvas and re-points R3F's event system at
  // it (`events.connect(el)`), so that div — not the canvas — is what every
  // pointer/wheel/touch event actually lands on, and `touch-action` set on the
  // canvas governs nothing. Look-around and ctrl/pinch zoom are therefore
  // inert; the on-screen hints for them have been removed rather than left
  // advertising behaviour that doesn't happen. Everything below is left in
  // place (and made cancel-safe) so it can be re-pointed at the real event
  // element deliberately, with the touch-gesture arbitration in
  // lib/dragState.ts to keep it from fighting the climb scroll.
  useEffect(() => {
    const el = gl.domElement;
    // Look-around is a vertical/horizontal drag on the same element
    // ScrollControls also treats as a scrollable surface — without capture,
    // a drag to look up/down leaks into the underlying scroll region and
    // nudges climb progress mid-drag, which can flip currentStationId to a
    // neighbor and swap the real station for its low-poly StationMarker
    // placeholder. touch-action:none plus preventDefault/setPointerCapture
    // on the initiating pointerdown keeps the gesture exclusively ours (same
    // pattern already used for in-station drags, e.g. ChessStation).
    el.style.touchAction = "none";
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // plain wheel scrolls the path via ScrollControls
      e.preventDefault();
      zoomOffset.current = THREE.MathUtils.clamp(zoomOffset.current - e.deltaY * 0.01, -3.5, 2.5);
    };
    let pinchStartDist: number | null = null;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinchStartDist !== null) {
        zoomOffset.current = THREE.MathUtils.clamp(
          zoomOffset.current + (dist - pinchStartDist) * 0.015,
          -3.5,
          2.5
        );
      }
      pinchStartDist = dist;
    };
    const onTouchEnd = () => (pinchStartDist = null);

    const onPointerDown = (e: PointerEvent) => {
      // A station object's own drag (chess king, tokamak) sets this before
      // the camera ever sees the gesture as "look-around" — see
      // lib/dragState.ts. Without this guard, both systems can end up
      // reacting to the same physical drag: the camera pans/zooms WHILE the
      // object is being dragged, which reads as the object's drag itself
      // being broken/unpredictable. A touch drag naturally covers more
      // physical distance than a mouse drag aimed at the same small target,
      // so this conflict — if it happens at all — is far more noticeable on
      // touch, which is exactly the reported "chess/tokamak feels broken on
      // mobile, fine on desktop."
      if (dragState.activeObject) return;
      dragging.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      capturePointer(el, e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      // Defense in depth against ordering ambiguity between this native
      // listener and the object's own onDown (see dragState.ts and the
      // onPointerDown guard above): if an object drag becomes active after
      // this one was already armed, stop applying further look-around
      // rotation rather than fighting the object for the rest of the
      // gesture.
      if (dragState.activeObject) {
        dragging.current = false;
        return;
      }
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      // Only a generous safety clamp here — the real, context-dependent
      // bound (tight at a station, wide at the summit vista) is applied
      // every frame in useFrame below, since it depends on vistaWeight.
      yaw.current = THREE.MathUtils.clamp(yaw.current - dx * 0.0025, -1.35, 1.35);
      pitch.current = THREE.MathUtils.clamp(pitch.current - dy * 0.0025, -0.6, 0.6);
    };
    // pointerup AND pointercancel: touch browsers fire pointercancel routinely
    // (the moment a gesture is reinterpreted as a scroll), and a drag that
    // only ever ends on pointerup stays latched "in progress" forever after
    // one of those — reacting to every later pointer move on the page, and
    // leaving a retired pointerId behind that throws a DOMException out of
    // releasePointerCapture on the next tap. releasePointer() is the guarded
    // form of that call; see lib/dragState.ts.
    const onPointerUp = (e: PointerEvent) => {
      dragging.current = false;
      pinchStartDist = null;
      releasePointer(el, e.pointerId);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [gl]);

  // Expose an imperative "travel to progress t" handler, used by the left-edge
  // quick-nav, every StationLabel, the summit overlook's beacon labels, the
  // trail-map/vault entry points, and hash deep-links.
  useEffect(() => {
    const el = scroll.el;
    let raf: number | null = null;

    // This is the element R3F's events are actually connected to and the one
    // the browser scrolls on a touch swipe. Handing it to the gesture arbiter
    // lets a station object's drag suppress the climb scroll for the duration
    // of its own gesture — without that, one finger movement both drags the
    // object and flies the camera up the mountain. See lib/dragState.ts.
    registerScrollElement(el);

    const cancel = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    };
    // Any real scroll input from the visitor wins immediately — the tween
    // writes scrollTop every frame, so without this a wheel nudge mid-travel
    // would be silently overwritten on the very next frame and the page
    // would feel stuck rather than merely animated.
    //
    // Taking over also abandons any pane that was queued to open on arrival
    // (see the store's `pendingPaneId`): the visitor is driving now, and is
    // no longer heading to wherever they clicked. Without this, StationPane's
    // timeout would still be holding that request open in the background,
    // and merely passing through the clicked station on the way somewhere
    // else would pop its panel up unprompted. These listeners are on the
    // ScrollControls region only, which the DOM overlay's nav buttons are not
    // inside — so clicking "travel here" can't cancel itself.
    const onUserScrollIntent = () => {
      // A touch that landed on a station object isn't scroll intent — the
      // gesture arbiter has already cancelled the native scroll for it (see
      // lib/dragState.ts), so treating it as "the visitor is driving now"
      // would abandon an in-flight travel for a tap that never moved the page.
      if (dragState.activeObject) return;
      cancel();
      const store = useUIStore.getState();
      if (store.pendingPaneId) store.setPendingPaneId(null);
    };

    setScrollHandler((t: number, opts?: { immediate?: boolean }) => {
      cancel();
      const max = el.scrollHeight - el.clientHeight;
      const to = THREE.MathUtils.clamp(t, 0, 1) * max;
      const from = el.scrollTop;
      const delta = max > 0 ? Math.abs(to - from) / max : 0;

      // Deep links restoring a saved position, reduced-motion visitors, and
      // "travel" to somewhere we're already standing all skip the animation:
      // there's no journey to show in any of those cases, only a delay.
      if (
        opts?.immediate ||
        useUIStore.getState().reducedMotion ||
        delta < TRAVEL_NEGLIGIBLE
      ) {
        el.scrollTop = to;
        return;
      }

      const duration = TRAVEL_MIN_MS + TRAVEL_PER_PROGRESS_MS * delta;
      const start = performance.now();
      const step = () => {
        const elapsed = performance.now() - start;
        const p = Math.min(elapsed / duration, 1);
        el.scrollTop = from + (to - from) * smootherstep(p);
        raf = p < 1 ? requestAnimationFrame(step) : null;
      };
      raf = requestAnimationFrame(step);
    });

    el.addEventListener("wheel", onUserScrollIntent, { passive: true });
    el.addEventListener("touchstart", onUserScrollIntent, { passive: true });
    el.addEventListener("keydown", onUserScrollIntent);
    return () => {
      cancel();
      registerScrollElement(null);
      el.removeEventListener("wheel", onUserScrollIntent);
      el.removeEventListener("touchstart", onUserScrollIntent);
      el.removeEventListener("keydown", onUserScrollIntent);
      setScrollHandler(null);
    };
  }, [scroll, setScrollHandler]);

  useFrame((_, delta) => {
    const t = scroll.offset;
    progressVelocity.current = Math.abs(t - lastProgress.current) / Math.max(delta, 0.0001);
    lastProgress.current = t;

    const station = nearestStation(t);
    const isParked =
      Math.abs(station.t - t) < STATION_ARRIVAL_EPSILON && progressVelocity.current < 0.15;
    const vistaWeight = THREE.MathUtils.smoothstep(t, 0.88, 1);

    // No forced/magnetic snapping: the visitor can stop and rest anywhere
    // along the climb, including between stations. Scroll position is only
    // ever set programmatically via the explicit "jump to station" handler
    // (nav clicks, station labels, hash deep-links) — never by an idle timer.

    const basePos = getCameraPointInto(t, tmpBasePos);
    const lookAhead = getLookAheadPointInto(t, tmpLookAhead);

    tmpForward.subVectors(lookAhead, basePos).normalize();
    tmpRight.crossVectors(tmpForward, tmpUp).normalize();

    // The look-around clamp widens toward the summit vista: these bounds
    // were tuned for standing right next to a station, where they're wide
    // enough. At the overlook the camera sits far above/back from every
    // checkpoint, and (see the direction-rotation comment below) the same
    // yaw/pitch radians sweep the same angular range regardless of
    // distance — so without widening the clamp here, a visitor still
    // couldn't pan far enough to bring every station's label into view.
    // Eased by vistaWeight rather than snapped, to match the rest of the
    // vista transition.
    const yawClamp = THREE.MathUtils.lerp(0.55, 1.35, vistaWeight);
    const pitchClamp = THREE.MathUtils.lerp(0.35, 0.6, vistaWeight);
    yaw.current = THREE.MathUtils.clamp(yaw.current, -yawClamp, yawClamp);
    pitch.current = THREE.MathUtils.clamp(pitch.current, -pitchClamp, pitchClamp);

    // Apply bounded look-around only while parked; decay smoothly otherwise
    const yawTarget = isParked ? yaw.current : yaw.current * 0.9;
    const pitchTarget = isParked ? pitch.current : pitch.current * 0.9;
    if (!isParked) {
      yaw.current = yawTarget;
      pitch.current = pitchTarget;
    }

    // The objects are the main piece, the path is the side piece: as the
    // camera nears a station, blend the look target from "down the trail"
    // onto the station's object itself.
    tmpTarget.copy(lookAhead);
    const focus = focusTargets.get(station.id);
    if (focus) {
      const closeness = 1 - Math.min(Math.abs(t - station.t) / 0.07, 1);
      const w = closeness * closeness * (3 - 2 * closeness) * 0.85;
      tmpTarget.lerp(focus, w);
    }
    // Summit finale: pull the camera itself up and back into an elevated
    // overlook — not just the look target — so the whole climb (every
    // checkpoint, every beacon) is visible from above with no risk of
    // clipping into the peak.
    if (vistaWeight > 0) {
      tmpTarget.lerp(overlookTarget, vistaWeight);
    }

    // Zoom: dolly camera position along the forward vector, decays toward 0 when leaving a station
    if (!isParked) zoomOffset.current *= 0.95;
    const dollied = tmpDollied.copy(basePos).addScaledVector(tmpForward, zoomOffset.current);
    // A straight-line lerp between the on-path position and the overlook
    // point doesn't know the mountain's actual shape in between — near the
    // summit the terrain rises steeply enough that this line can dip below
    // the surface partway through the blend, clipping the camera into the
    // peak even though both endpoints sit above ground. Same risk from a
    // hard zoom-in dolly on a steep slope. Re-clamped every frame against
    // the real terrain height at wherever the camera ends up, so it always
    // stays above ground regardless of which path got it there — the vista
    // blend still lands on the exact same overlookPos once vistaWeight
    // reaches 1, since that point is already well clear of the terrain.
    if (vistaWeight > 0) dollied.lerp(overlookPos, vistaWeight);
    const groundY = sampleTerrainInto(dollied.x, dollied.z, tmpGroundSample).height;
    if (dollied.y < groundY + CAMERA_GROUND_CLEARANCE) {
      dollied.y = groundY + CAMERA_GROUND_CLEARANCE;
    }

    // Look-around stays live through the vista (not zeroed out) so the
    // visitor can pan to find and click any checkpoint from the overlook —
    // applied as a true rotation of the camera→target direction (yaw around
    // world-up, then pitch around the yawed right axis), not a fixed-unit
    // lateral shift of the target point. A flat shift sweeps a SHRINKING
    // angle the farther the target is from the camera: fine up close at a
    // station, but from the overlook (camera far above/back, target far
    // down the mountain) the same yaw/pitch values barely panned the view
    // at all. Rotating the direction keeps the same angular sweep at any
    // distance, so look-around feels consistent everywhere.
    tmpDir.copy(tmpTarget).sub(dollied);
    const dist = tmpDir.length();
    if (dist > 0.0001) {
      tmpDir.normalize();
      tmpQuat.setFromAxisAngle(tmpUp, yawTarget);
      tmpDir.applyQuaternion(tmpQuat);
      tmpPitchAxis.copy(tmpRight).applyQuaternion(tmpQuat);
      tmpQuat.setFromAxisAngle(tmpPitchAxis, pitchTarget);
      tmpDir.applyQuaternion(tmpQuat);
      tmpTarget.copy(dollied).addScaledVector(tmpDir, dist);
    }

    const smoothing = reducedMotion ? 1 : 1 - Math.pow(0.001, delta);
    camera.position.lerp(dollied, smoothing);

    tmpMatrix.lookAt(camera.position, tmpTarget, tmpUp);
    tmpQuat.setFromRotationMatrix(tmpMatrix);
    camera.quaternion.slerp(tmpQuat, smoothing);

    // Throttle store writes (progress bar / station panes) to ~12hz.
    // Written as ONE store update rather than three separate setters: each
    // zustand `set()` notifies every subscriber synchronously, so the old
    // three-call version re-rendered the whole DOM overlay (nav list, beacon
    // label declutter pass, progress bar, station pane) up to three times per
    // tick for what is logically a single change of camera state.
    storeThrottle.current += delta;
    if (storeThrottle.current > 0.08) {
      storeThrottle.current = 0;
      setCameraState(t, station.id, isParked);
    }
  });

  return null;
}
