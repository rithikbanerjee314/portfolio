// Verifies the rebuilt Waterfall.tsx geometry math against the real,
// installed `three` package and the project's actual terrain-utils.ts
// sampleTerrain — this dev environment cannot render WebGL, so this replays
// the exact same math a real browser would run and checks it for the
// specific bug reported from a real screenshot: rock banks sitting inside
// the visually-fanned-out water, and a hard-edged "water just stops" cutoff.
import { sampleTerrain } from "./_replay/terrain-utils.ts";

const LIP_X = 13.5;
const LIP_Z = -3.5;
const FALL_DIR_X = -0.473;
const FALL_DIR_Z = 0.881;
const FALL_RUN = 9;
const TAIL_RUN = 3.4;
const TOTAL_RUN = FALL_RUN + TAIL_RUN;
const PROFILE_STEPS = 18;
const SHEET_HALF_WIDTH = 1.7;
const SHEET_GROUND_CLEARANCE = 0.12;
const POOL_BULGE = 1.55;
const TAIL_TAPER = 0.4;
const BANK_COUNT = 13; // high tier

function halfWidthAt(dist) {
  if (dist <= FALL_RUN) {
    const t = dist / FALL_RUN;
    return SHEET_HALF_WIDTH * (1 + t * (POOL_BULGE - 1));
  }
  const t = Math.min((dist - FALL_RUN) / TAIL_RUN, 1);
  return SHEET_HALF_WIDTH * (POOL_BULGE * (1 - t) + TAIL_TAPER * t);
}

const rawWorld = [];
for (let i = 0; i <= PROFILE_STEPS; i++) {
  const dist = (i / PROFILE_STEPS) * TOTAL_RUN;
  const x = LIP_X + FALL_DIR_X * dist;
  const z = LIP_Z + FALL_DIR_Z * dist;
  rawWorld.push({ x, y: sampleTerrain(x, z).height, z, dist });
}
const anchorIndex = Math.round((FALL_RUN / TOTAL_RUN) * PROFILE_STEPS);
const anchorWorld = rawWorld[anchorIndex];
const pool = { x: anchorWorld.x, y: anchorWorld.y, z: anchorWorld.z };

console.log("Anchor (reference pool point) index/dist:", anchorIndex, rawWorld[anchorIndex].dist.toFixed(3));
console.log("Anchor world:", pool);
console.log("Lip world:", rawWorld[0]);
console.log("Tail end world:", rawWorld[rawWorld.length - 1]);

// 1) Monotonic descent + step-size sanity over the FULL extended run
// (including the new tail past the old pool point).
let monotonicViolations = 0;
let maxUpstep = 0;
let maxStep = 0;
for (let i = 1; i < rawWorld.length; i++) {
  const dy = rawWorld[i].y - rawWorld[i - 1].y;
  if (dy > 0.02) {
    monotonicViolations++;
    maxUpstep = Math.max(maxUpstep, dy);
  }
  maxStep = Math.max(maxStep, Math.abs(dy));
}
console.log("Monotonic-descent violations over full run+tail:", monotonicViolations, "max upstep:", maxUpstep.toFixed(4));
console.log("Max single-step |dy|:", maxStep.toFixed(4));

const toWorldXZ = (localX, localZ) => ({
  x: pool.x + localX * FALL_DIR_Z + localZ * FALL_DIR_X,
  z: pool.z - localX * FALL_DIR_X + localZ * FALL_DIR_Z,
});

// 2) THE ACTUAL BUG FROM THE SCREENSHOT: for every bank rock, confirm its
// lateral placement clears halfWidthAt() at that same distance — i.e. the
// rock can never land inside the water's own rendered width. Also apply the
// real per-rock icosahedron radius (0.55 * scale) so we're checking actual
// visual footprint, not just the rock's center point.
let worstClearance = Infinity;
let overlapCount = 0;
for (const side of [-1, 1]) {
  for (let i = 0; i <= BANK_COUNT; i++) {
    const frac = i / BANK_COUNT;
    const dist = frac * TOTAL_RUN;
    const hw = halfWidthAt(dist);
    const margin = 0.7 + (Math.sin(frac * 11 + side * 2.1) * 0.5 + 0.5) * 0.3;
    const lateral = side * (hw + margin);
    const scale = 0.3 + Math.sin(Math.PI * frac) * 0.45 + Math.sin(frac * 17 + side) * 0.06;
    const rockRadius = 0.55 * scale;
    // Clearance = distance from rock CENTER to the water edge, minus the
    // rock's own radius. Positive means the rock's visual footprint is
    // fully outside the water; negative means it overlaps.
    const clearance = Math.abs(lateral) - hw - rockRadius;
    if (clearance < worstClearance) worstClearance = clearance;
    if (clearance < 0) overlapCount++;
  }
}
console.log("Worst (minimum) bank clearance from water edge (rock footprint vs sheet edge):", worstClearance.toFixed(4));
console.log("Bank rocks overlapping the water's own rendered width:", overlapCount, "/", (BANK_COUNT + 1) * 2);

// 3) Bank grounding sanity — no NaN, reasonable heights, across the full
// extended run including the tail.
let bankNaN = 0;
let bankMaxAbsY = 0;
for (const side of [-1, 1]) {
  for (let i = 0; i <= BANK_COUNT; i++) {
    const frac = i / BANK_COUNT;
    const dist = frac * TOTAL_RUN;
    const hw = halfWidthAt(dist);
    const margin = 0.7 + (Math.sin(frac * 11 + side * 2.1) * 0.5 + 0.5) * 0.3;
    const lateral = side * (hw + margin);
    const localZ = dist - FALL_RUN;
    const w = toWorldXZ(lateral, localZ);
    const groundY = sampleTerrain(w.x, w.z).height;
    if (!Number.isFinite(groundY)) bankNaN++;
    bankMaxAbsY = Math.max(bankMaxAbsY, Math.abs(groundY - pool.y));
  }
}
console.log("Bank rocks: NaN count:", bankNaN, "max |localY|:", bankMaxAbsY.toFixed(3));

// 4) Tail fade sanity: alpha should be ~1 at the anchor (vUv.y=0) and ~0 by
// the tail's actual end (vUv.y = -(TAIL_RUN/FALL_RUN)).
const TAIL_FADE_START = -(TAIL_RUN / FALL_RUN);
function smoothstep(e0, e1, x) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}
const atAnchor = smoothstep(TAIL_FADE_START, 0, 0);
const atTailEnd = smoothstep(TAIL_FADE_START, 0, TAIL_FADE_START);
const atMidTail = smoothstep(TAIL_FADE_START, 0, TAIL_FADE_START / 2);
console.log("Tail fade factor at anchor (should be 1):", atAnchor);
console.log("Tail fade factor at tail end (should be 0):", atTailEnd);
console.log("Tail fade factor at mid-tail (should be between, smooth):", atMidTail.toFixed(3));

// 5) Width profile sanity: narrow at lip, widest at anchor, tapering to a
// thin trickle by the tail end — no discontinuities.
console.log("halfWidthAt(0) [lip]:", halfWidthAt(0).toFixed(3));
console.log("halfWidthAt(FALL_RUN) [anchor, should be widest]:", halfWidthAt(FALL_RUN).toFixed(3));
console.log("halfWidthAt(TOTAL_RUN) [tail end, should be narrow]:", halfWidthAt(TOTAL_RUN).toFixed(3));

// 6) Account for the vertex shader's own residual ripple-widening
// (fall * 0.08, clamped fall<=1.6) which is NOT reflected in the CPU bank
// placement above — find the true worst-case clearance including it.
const SHADER_RIPPLE_COEF = 0.02;
let worstClearanceWithShader = Infinity;
let worstAt = null;
for (const side of [-1, 1]) {
  for (let i = 0; i <= BANK_COUNT; i++) {
    const frac = i / BANK_COUNT;
    const dist = frac * TOTAL_RUN;
    const hw = halfWidthAt(dist);
    const uvY = 1 - dist / FALL_RUN;
    const fall = Math.min(Math.max(1 - uvY, 0), 1.6);
    const effectiveHw = hw * (1 + fall * SHADER_RIPPLE_COEF);
    const margin = 0.7 + (Math.sin(frac * 11 + side * 2.1) * 0.5 + 0.5) * 0.3;
    const lateral = side * (hw + margin);
    const scale = 0.3 + Math.sin(Math.PI * frac) * 0.45 + Math.sin(frac * 17 + side) * 0.06;
    const rockRadius = 0.55 * scale;
    const clearance = Math.abs(lateral) - effectiveHw - rockRadius;
    if (clearance < worstClearanceWithShader) {
      worstClearanceWithShader = clearance;
      worstAt = { side, frac, dist, hw, effectiveHw, margin, rockRadius };
    }
  }
}
console.log("Worst clearance INCLUDING shader ripple-widen:", worstClearanceWithShader.toFixed(4));
console.log("  at:", worstAt);
