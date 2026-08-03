import * as THREE from "three";
import { PATH_CURVE, STATION_ORDER, getStationAnchor } from "./path";

/**
 * Shared terrain shaping logic. The mountain is built AROUND the footpath:
 * the ground along the path is flattened to the path's own height (a walkable
 * trail bed), station pads are flattened discs at their anchor height, and
 * everything else rises away from the trail into flanking slopes/peaks.
 * Terrain.tsx (mesh), PathRibbon.tsx and Vegetation.tsx all sample these.
 */

export const PATH_SAMPLES = PATH_CURVE.getSpacedPoints(240);

/**
 * Terrain-flatten radius per station. Each must EXCEED that station's visual
 * `StationPad` radius (so the disc always sits on flat ground) while staying
 * small enough that no two flatten discs overlap.
 *
 * That second constraint is not cosmetic. Two overlapping discs are two
 * regions each demanding to be flat at a DIFFERENT height, which is
 * unsatisfiable — whatever the blend does in the overlap, it cannot be flat
 * at both. Measured against the real anchor positions, `base`/`intro`
 * overlapped by 0.03 units and `intro`/`chess` by 0.27, which is what let a
 * neighbouring pad drag the ground 1.6 units up through the middle of
 * chess's own platform. base 2.6→2.4, intro 2.6→2.2 and chess 2.6→2.4
 * separate every pair (smallest remaining gap: intro/chess at 0.33 units)
 * while still clearing their visual radii of 0, 1.65 and 2.0.
 */
const PAD_RADII: Record<string, number> = {
  base: 2.4,
  intro: 2.2,
  chess: 2.4,
  soccer: 3.6,
  summit: 4.6,
};
const PADS = STATION_ORDER.map((s) => {
  const pos = getStationAnchor(s);
  return { x: pos.x, y: pos.y, z: pos.z, r: PAD_RADII[s.id] ?? 2.6 };
});

export const TRAIL_HALF_WIDTH = 2.2;
const TRAIL_BLEND = 5.5;
const PAD_BLEND = 2.5;
/**
 * Distance past the corridor edge over which the reference height hands off
 * from the exact nearest-point height to the smooth field (see
 * `smoothPathHeight`). Must complete well before the nearest-leg argmin can
 * flip — measured at ~5 units out for this path's switchback spacing.
 */
const REF_BLEND_END = 1.5;

/** Deterministic PRNG so scatter placement is stable across renders. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Low-frequency, low-amplitude rolling terrain: the previous version mixed
// in a high-frequency term (0.83/0.47 coefficients) whose short wavelength
// produced sharp local bumps right next to smoothly-blended pads/trail,
// reading as disconnected "jutting" panels. This keeps only long, gentle
// wavelengths so the mountainside reads as continuous rolling ground.
function noise2(x: number, z: number): number {
  return (
    Math.sin(x * 0.11 + 1.7) * 0.4 +
    Math.sin(z * 0.09 + 4.2) * 0.4 +
    Math.sin((x + z) * 0.06 + 2.3) * 0.5
  );
}

export interface PathInfo {
  /** horizontal distance to the nearest path point */
  d: number;
  /** path height at that nearest point */
  y: number;
}

/**
 * Flat, allocation-free copy of PATH_SAMPLES' x/y/z. The distance scan below
 * is the single hottest function in the whole project (see the chunk comment),
 * and reading `Vector3` object fields through the array-of-objects indirection
 * is measurably slower than a packed Float64Array in a tight loop.
 */
const SAMPLE_XYZ = (() => {
  const arr = new Float64Array(PATH_SAMPLES.length * 3);
  for (let i = 0; i < PATH_SAMPLES.length; i++) {
    arr[i * 3] = PATH_SAMPLES[i].x;
    arr[i * 3 + 1] = PATH_SAMPLES[i].y;
    arr[i * 3 + 2] = PATH_SAMPLES[i].z;
  }
  return arr;
})();
const SEGMENT_COUNT = PATH_SAMPLES.length - 1;

/**
 * Consecutive runs of segments, each with its XZ bounding box. The distance
 * from a query point to a chunk's box is a lower bound on its distance to
 * every segment inside that chunk, so a chunk whose box is already farther
 * than the best distance found so far can be skipped entirely — exact same
 * answer, a fraction of the work.
 *
 * This matters because sampleTerrain() is called on the order of 40,000
 * times synchronously while the world builds (one per terrain vertex, plus
 * every Vegetation rejection-sampling candidate, plus every PathRibbon edge
 * vertex) AND once per frame forever after, by CameraRig's ground-clearance
 * clamp. Before this, each of those calls walked all 240 segments
 * unconditionally.
 */
const CHUNK_SIZE = 8;
const CHUNK_COUNT = Math.ceil(SEGMENT_COUNT / CHUNK_SIZE);
const CHUNK_BOUNDS = (() => {
  // [minX, maxX, minZ, maxZ] per chunk, packed.
  const arr = new Float64Array(CHUNK_COUNT * 4);
  for (let c = 0; c < CHUNK_COUNT; c++) {
    const start = c * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, SEGMENT_COUNT);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    // A chunk covers segments [start, end), i.e. sample points [start, end].
    for (let i = start; i <= end; i++) {
      const x = SAMPLE_XYZ[i * 3];
      const z = SAMPLE_XYZ[i * 3 + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    arr[c * 4] = minX;
    arr[c * 4 + 1] = maxX;
    arr[c * 4 + 2] = minZ;
    arr[c * 4 + 3] = maxZ;
  }
  return arr;
})();

/** Scratch results for the hot path, so the ~40k build-time calls don't each allocate. */
const scratchPath: PathInfo = { d: 0, y: 0 };

/** Squared XZ distance from a point to a chunk's bounding box (0 when inside). */
function chunkBoxDistSq(c: number, x: number, z: number): number {
  const minX = CHUNK_BOUNDS[c * 4];
  const maxX = CHUNK_BOUNDS[c * 4 + 1];
  const minZ = CHUNK_BOUNDS[c * 4 + 2];
  const maxZ = CHUNK_BOUNDS[c * 4 + 3];
  const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
  const dz = z < minZ ? minZ - z : z > maxZ ? z - maxZ : 0;
  return dx * dx + dz * dz;
}

/** Scan one chunk's segments, tightening `scratchPath` in place. */
function scanChunk(c: number, x: number, z: number, bestSq: number): number {
  const start = c * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, SEGMENT_COUNT);
  for (let i = start; i < end; i++) {
    const ax = SAMPLE_XYZ[i * 3];
    const ay = SAMPLE_XYZ[i * 3 + 1];
    const az = SAMPLE_XYZ[i * 3 + 2];
    const abx = SAMPLE_XYZ[(i + 1) * 3] - ax;
    const aby = SAMPLE_XYZ[(i + 1) * 3 + 1] - ay;
    const abz = SAMPLE_XYZ[(i + 1) * 3 + 2] - az;
    const abLenSq = abx * abx + abz * abz;
    let t = abLenSq > 0 ? ((x - ax) * abx + (z - az) * abz) / abLenSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = ax + abx * t - x;
    const dz = az + abz * t - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestSq) {
      bestSq = d2;
      scratchPath.y = ay + aby * t;
    }
  }
  return bestSq;
}

/**
 * Point-to-POLYLINE distance (projects onto the nearest segment, not just
 * the nearest sample point). A previous version found the nearest of 240
 * discrete PATH_SAMPLES and used that sample's own height directly — since
 * the trail climbs continuously, each sample's height differs slightly from
 * its neighbors, so the Voronoi boundary between two samples was a real
 * (if small) height discontinuity running the FULL WIDTH of the terrain,
 * at every sample interval along the entire trail. That's what showed up
 * as thin crack lines cutting across the ground near every station.
 * Segment projection with linearly-interpolated height is continuous.
 *
 * Verified bit-identical to the original unpruned scan across 160k probe
 * points spanning the full terrain footprint — the chunk test below is a
 * lower bound on the distance to every segment in that chunk, so it can only
 * ever skip chunks that provably cannot contain the winner.
 *
 * Writes into `scratchPath` rather than allocating, so callers must read
 * `d`/`y` before the next call. Private for exactly that reason — the
 * exported `nearestPathInfo` below hands back a fresh object.
 */
function nearestPathInfoScratch(x: number, z: number): PathInfo {
  // Seed `best` from the closest chunk first so the pruning test below has a
  // tight bound to work with straight away — starting from Infinity would
  // force the first chunk in index order to always be scanned in full, and
  // would prune far less for the rest.
  let nearestChunk = 0;
  let nearestChunkDistSq = Infinity;
  for (let c = 0; c < CHUNK_COUNT; c++) {
    const d2 = chunkBoxDistSq(c, x, z);
    if (d2 < nearestChunkDistSq) {
      nearestChunkDistSq = d2;
      nearestChunk = c;
    }
  }

  scratchPath.y = 0;
  let bestSq = scanChunk(nearestChunk, x, z, Infinity);
  for (let c = 0; c < CHUNK_COUNT; c++) {
    if (c === nearestChunk) continue;
    if (chunkBoxDistSq(c, x, z) >= bestSq) continue;
    bestSq = scanChunk(c, x, z, bestSq);
  }

  scratchPath.d = Math.sqrt(bestSq);
  return scratchPath;
}

/** Allocating public wrapper — safe to hold on to the returned object. */
export function nearestPathInfo(x: number, z: number): PathInfo {
  const s = nearestPathInfoScratch(x, z);
  return { d: s.d, y: s.y };
}

// --- Smooth reference-height field ----------------------------------------
// `nearestPathInfo().y` — the height of the nearest point ON the path — is
// the natural reference height to raise the mountain from, and it is also
// GENUINELY DISCONTINUOUS. It's an argmin: at any point equidistant from two
// non-adjacent stretches of the trail, the winner flips and `y` steps by the
// full height difference between those two stretches. The climb switchbacks,
// so consecutive legs run ~10 units apart in XZ while sitting ~5-10 units
// apart in altitude, and the set of equidistant points is a line running the
// length of every switchback. Measured on a 400x400 grid over the real
// curve: 1,684 such flip lines, a worst-case step of 10.24 units ACROSS A
// SINGLE GRID CELL, and 338 of them falling inside the trail-blend zone
// where this term still carries most of the weight. That is a vertical wall
// of terrain — the "panels jutting out" of the mountainside.
//
// The fix is a reference height that has no argmin in it at all: inverse-
// distance weighting over a decimated set of path nodes. Every node
// contributes at every point, weighted ~1/d^4, so the field is smooth
// everywhere by construction. The sharp falloff still makes the nearest leg
// dominate — within a few units of the trail the next leg is ~10 units off
// and contributes on the order of 1/200th — so this tracks the true path
// height closely where that matters, and degrades into a gentle local
// average of the surrounding climb further out, which is exactly what a
// mountainside should do.
//
// Decimated (every 6th sample, ~2.2 units apart) purely for cost: the field
// is smooth regardless of node density, and the density only affects how
// tightly it hugs the path — which the blend below makes irrelevant, since
// the true height is used outright in the corridor.
const SMOOTH_NODE_STRIDE = 6;
const SMOOTH_NODES = (() => {
  const out: number[] = [];
  for (let i = 0; i < PATH_SAMPLES.length; i += SMOOTH_NODE_STRIDE) {
    out.push(PATH_SAMPLES[i].x, PATH_SAMPLES[i].y, PATH_SAMPLES[i].z);
  }
  // Always include the summit end, whatever the stride lands on.
  const last = PATH_SAMPLES[PATH_SAMPLES.length - 1];
  if (out[out.length - 3] !== last.x || out[out.length - 1] !== last.z) {
    out.push(last.x, last.y, last.z);
  }
  return new Float64Array(out);
})();
const SMOOTH_NODE_COUNT = SMOOTH_NODES.length / 3;
/**
 * Softening term in the weight's denominator. Without it a query landing
 * exactly on a node divides by zero; with it, weight peaks at a large but
 * finite value, so the field stays smooth right through the node.
 */
const SMOOTH_EPS = 0.35;

/** Smooth (argmin-free) reference height of the trail near a given point. */
function smoothPathHeight(x: number, z: number): number {
  let weightSum = 0;
  let heightSum = 0;
  for (let i = 0; i < SMOOTH_NODE_COUNT; i++) {
    const dx = SMOOTH_NODES[i * 3] - x;
    const dz = SMOOTH_NODES[i * 3 + 2] - z;
    const d2 = dx * dx + dz * dz + SMOOTH_EPS;
    const w = 1 / (d2 * d2);
    weightSum += w;
    heightSum += w * SMOOTH_NODES[i * 3 + 1];
  }
  return heightSum / weightSum;
}

/**
 * C1 stand-in for `Math.max(x, 0)`, rounded over +/-k.
 *
 * `Math.max(x, 0)` is continuous but has a hard kink in its DERIVATIVE at
 * x=0, and the terrain applies exactly that to `d - TRAIL_HALF_WIDTH`. A
 * derivative kink in a heightfield is a crease — a hard fold line running
 * the entire length of the trail on both sides, at a constant distance from
 * it, which reads as a machined edge rather than ground. Same story for the
 * `Math.min(..., cap)` ceilings, which fold along their own contour lines.
 */
function softRamp(x: number, k: number): number {
  if (x <= -k) return 0;
  if (x >= k) return x;
  const s = x + k;
  return (s * s) / (4 * k);
}

/** C1 stand-in for `Math.min(x, cap)`, rounded over +/-k. */
function softCap(x: number, cap: number, k: number): number {
  return cap - softRamp(cap - x, k);
}

export interface TerrainSample {
  height: number;
  /** distance to trail centerline */
  trailDist: number;
  /** true when inside a station pad disc */
  onPad: boolean;
  /**
   * How strongly the nearest station pad flattens this point: 1 inside the
   * disc, easing to 0 across PAD_BLEND outside it, 0 beyond that. `onPad` is
   * just `padWeight === 1`, kept as its own field because Vegetation only
   * ever wants the hard in/out test. Terrain.tsx uses the continuous version
   * so the stone pad colour fades into the surrounding ground over the same
   * distance the geometry flattens over, instead of stopping at a hard ring.
   */
  padWeight: number;
}

function smooth01(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

/**
 * Fills `out` instead of allocating. Used by the two hot call sites — the
 * per-vertex terrain build loop and CameraRig's per-frame ground clamp.
 * Everywhere else uses `sampleTerrain` below, which allocates a fresh object
 * (some callers legitimately hold on to several samples at once, e.g.
 * Vegetation's slope check compares three neighbouring samples).
 */
export function sampleTerrainInto(x: number, z: number, out: TerrainSample): TerrainSample {
  const info = nearestPathInfoScratch(x, z);
  const d = info.d;
  const y = info.y;

  // Reference height the mountainside rises FROM. Inside the corridor this
  // is the true nearest-point height, so the trail bed sits exactly on the
  // real path; by REF_BLEND_END it has handed over entirely to the smooth
  // field, well before the distance at which the nearest-leg argmin can flip
  // (~5 units out, given ~10-unit switchback spacing). The handover happens
  // where the two agree to within centimetres anyway — at 2-4 units from the
  // trail the next leg is ~8+ units away and contributes ~1/200th of the
  // weight — so it costs nothing visually and removes the cliff entirely.
  const refBlend = smooth01((d - TRAIL_HALF_WIDTH) / REF_BLEND_END);
  const yRef = refBlend > 0 ? y * (1 - refBlend) + smoothPathHeight(x, z) * refBlend : y;

  // Mountainside rising away from the trail. Both ramps are the C1 soft
  // forms — see softRamp/softCap for why the plain min/max versions creased.
  const n = noise2(x, z);
  const above = softRamp(d - TRAIL_HALF_WIDTH, 1.2);
  const rise = softCap(above * 0.42, 14, 1.6);
  const roughness = n * softCap(above * 0.09, 1.1, 0.35);
  const mountain = yRef + rise + roughness;

  // Trail corridor: flatten to path height
  let height: number;
  if (d <= TRAIL_HALF_WIDTH) {
    height = y - 0.04;
  } else if (d < TRAIL_HALF_WIDTH + TRAIL_BLEND) {
    const t = (d - TRAIL_HALF_WIDTH) / TRAIL_BLEND;
    const s = t * t * (3 - 2 * t);
    // `yRef`, not the raw `y`: this blend runs out to 7.7 units, and the
    // nearest-leg flips start around 5, so using the raw value here would
    // leave a third of the original cliff standing inside the corridor
    // blend even with the mountain term fixed. `yRef` equals `y` exactly at
    // the corridor edge, so the trail bed is unaffected.
    height = (yRef - 0.04) * (1 - s) + mountain * s;
  } else {
    height = mountain;
  }

  // Station pads: flatten discs at anchor height (takes priority over slope).
  //
  // Two things have to be true at once here, and an earlier pair of versions
  // each got one of them and broke the other:
  //
  //  - Overlapping pads must not COMPOUND. The original applied every pad's
  //    blend sequentially in array order, which stacked wherever two
  //    stations' blend zones met (easy, since pads sit ~6-10 units apart with
  //    blend radii summing to ~11), producing bulges that buried objects and
  //    brought the ground close enough to clip the camera.
  //  - The result must be CONTINUOUS. The fix for the above took a single
  //    max-weight winner, which removed the bulges but made the pad HEIGHT an
  //    argmin/argmax: where two pads' weights cross, the winner flips and the
  //    flatten target jumps between two stations' anchor heights. Those sit
  //    several units apart vertically, so this cut a step of up to ~7 units
  //    into the ground in a ring around the overlap — measured as every one
  //    of the worst remaining cliffs in the terrain, all of them within ~1.3
  //    units of a pad edge.
  //
  // Both, together: blend the flatten TARGET as a normalized weighted average
  // (smooth — as weights shift the target slides between the two anchor
  // heights instead of snapping), while taking the flatten STRENGTH as the
  // plain maximum (so overlapping pads still never flatten harder than a
  // single pad would, which is what actually prevented the bulges).
  let padStrength = 0;
  let weightSum = 0;
  let targetSum = 0;
  let insideY = 0;
  let bestInside = false;
  for (const pad of PADS) {
    const dx = pad.x - x;
    const dz = pad.z - z;
    const dp = Math.sqrt(dx * dx + dz * dz);
    let weight = 0;
    if (dp < pad.r) {
      weight = 1;
      // PAD_RADII guarantees discs never overlap, so at most one pad can
      // ever claim this — no argmax, no tie to break.
      bestInside = true;
      insideY = pad.y - 0.04;
    } else if (dp < pad.r + PAD_BLEND) {
      weight = 1 - smooth01((dp - pad.r) / PAD_BLEND);
    }
    if (weight <= 0) continue;
    if (weight > padStrength) padStrength = weight;
    const w = weight * weight * weight * weight;
    weightSum += w;
    targetSum += w * (pad.y - 0.04);
  }
  if (padStrength > 0) {
    // INSIDE a disc the flatten target is that pad's own height and nothing
    // else's. This is not a nicety — `StationPad` renders a cylinder whose
    // underside clears the flattened ground by 0.01 units, so a disc that
    // isn't exactly flat pushes terrain up THROUGH the platform mesh. A
    // weighted average here (which is what a previous version did) let a
    // neighbouring pad lift the surface by up to 1.6 units in the middle of
    // chess's platform, 160x the clearance, which read as plates of terrain
    // erupting through every station base.
    //
    // OUTSIDE every disc there is no flatness to preserve and the smooth
    // weighted average is what avoids a hard step between neighbouring pads
    // at different altitudes. The handover between the two is continuous
    // because the discs are separated (see PAD_RADII).
    const padY = bestInside ? insideY : targetSum / weightSum;
    height = height * (1 - padStrength) + padY * padStrength;
  }

  // Edge skirt: fold the mesh boundary down so the silhouette closes into
  // rolling hills instead of showing a floating plane rim at grazing angles.
  const edge = Math.min(
    x - TERRAIN_BOUNDS.minX,
    TERRAIN_BOUNDS.maxX - x,
    z - TERRAIN_BOUNDS.minZ,
    TERRAIN_BOUNDS.maxZ - z
  );
  height -= (1 - smooth01(edge / 14)) * 11;

  out.height = height;
  out.trailDist = d;
  out.onPad = bestInside;
  out.padWeight = padStrength;
  return out;
}

/** Allocating convenience wrapper around `sampleTerrainInto`. */
export function sampleTerrain(x: number, z: number): TerrainSample {
  return sampleTerrainInto(x, z, { height: 0, trailDist: 0, onPad: false, padWeight: 0 });
}

export const SUMMIT_Y = PATH_SAMPLES[PATH_SAMPLES.length - 1].y;

/** Station anchor positions with ids, for biome tinting / focus targeting. */
export const STATION_ANCHORS = STATION_ORDER.map((s) => {
  const p = getStationAnchor(s);
  return { id: s.id, x: p.x, y: p.y, z: p.z };
});

/** World-space bounds that comfortably contain the whole path plus flanks. */
export const TERRAIN_BOUNDS = (() => {
  const box = new THREE.Box3();
  for (const p of PATH_SAMPLES) box.expandByPoint(p);
  box.expandByScalar(34);
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minZ: box.min.z,
    maxZ: box.max.z,
    centerX: (box.min.x + box.max.x) / 2,
    centerZ: (box.min.z + box.max.z) / 2,
    width: box.max.x - box.min.x,
    depth: box.max.z - box.min.z,
  };
})();
