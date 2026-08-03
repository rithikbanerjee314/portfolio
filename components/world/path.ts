import * as THREE from "three";
import type { StationDef } from "./stations-meta";

/**
 * The single continuous mountain-climb path. Every station is a control
 * point on this curve; the camera rig samples it by normalized progress
 * (0 = base/hero, 1 = summit/contact). Climbing in Y with gentle
 * switchback curl in X/Z rather than a straight line.
 *
 * Pure station data (STATION_ORDER, nearestStation, StationDef, etc.) lives
 * in ./stations-meta.ts, not here — this module needs "three" to build the
 * actual curve/anchor geometry, and re-exporting that metadata through this
 * file would drag three.js along with it into anything that only wanted the
 * plain data (see stations-meta.ts's own doc comment for why that mattered
 * enough to split). Existing imports of STATION_ORDER etc. from this file
 * keep working via the re-export below; new eager/DOM-only code should
 * import directly from ./stations-meta instead.
 */

export type { StationDef };
export { STATION_ORDER, nearestStation, STATION_ARRIVAL_EPSILON } from "./stations-meta";

const RAW_POINTS: [number, number, number][] = [
  [0, 0, 12], // base
  [5, 4, 7], // chess ledge
  [-4, 8.5, 2], // soccer plateau
  [4.5, 13.5, -4], // tokamak research station
  [-5, 18.5, -10], // piano overlook
  [3, 23.5, -17], // fish / waterfall pool
  [0, 28, -24], // summit
];

export const PATH_CURVE = new THREE.CatmullRomCurve3(
  RAW_POINTS.map((p) => new THREE.Vector3(...p)),
  false,
  "catmullrom",
  0.4
);

const UP = new THREE.Vector3(0, 1, 0);

/** World anchor for a station's physics object + content panel. */
export function getStationAnchor(station: StationDef): THREE.Vector3 {
  const point = PATH_CURVE.getPointAt(station.t);
  if (station.side === 0) return point.clone();
  const tangent = PATH_CURVE.getTangentAt(station.t).normalize();
  const lateral = new THREE.Vector3().crossVectors(tangent, UP).normalize();
  return point.clone().addScaledVector(lateral, station.side * station.distance);
}

// These two are called once per frame each, forever, by CameraRig. The
// previous versions returned a fresh Vector3 built from
// `getPointAt().clone().add(new Vector3(...))` — three allocations per call,
// so ~360 short-lived objects a second between them, which is exactly the
// kind of steady young-generation garbage that surfaces as a periodic hitch
// rather than a constant slowdown. They now write into a caller-owned
// vector. (`getPointAt` still allocates its own internal temporaries; only
// the ones this file controls are gone.)
const scratchPoint = new THREE.Vector3();

/** Camera eye position: on the path, lifted slightly for a natural eye-line. */
export function getCameraPointInto(t: number, out: THREE.Vector3): THREE.Vector3 {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  PATH_CURVE.getPointAt(clamped, scratchPoint);
  return out.set(scratchPoint.x, scratchPoint.y + 1.6, scratchPoint.z);
}

/** A point slightly ahead on the curve, used as the base look-at target. */
export function getLookAheadPointInto(t: number, out: THREE.Vector3): THREE.Vector3 {
  const ahead = THREE.MathUtils.clamp(t + 0.025, 0, 1);
  PATH_CURVE.getPointAt(ahead, scratchPoint);
  return out.set(scratchPoint.x, scratchPoint.y + 1.4, scratchPoint.z);
}
