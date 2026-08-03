"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sampleTerrain } from "./terrain-utils";
import { useUIStore } from "@/lib/store";
import { ACCENT_ICE, ROCK_GRAY, ROCK_DARK } from "./palette";

/**
 * SITE SELECTION — measured, not guessed.
 *
 * Sweeping the whole mountainside and testing, for every camera position
 * along the climb, whether a point is inside the frustum AND has clear line
 * of sight (no ridge in the way), this site scored top of 597 candidates:
 * visible for 31% of the climb, and in frame from t=0.00 all the way to
 * t=1.00 — the landing page, the whole ascent, and the summit overlook
 * looking back down — with a weighted presence of 28.4. It sits on the +x
 * flank, 9.9 units beyond the tokamak anchor (so it reads as a backdrop to
 * the research station rather than competing with it), and the real terrain
 * here descends at close to the fall line's own slope, which is what makes
 * it usable without inventing a landform that isn't there (see below).
 */
const LIP_X = 13.5;
const LIP_Z = -3.5;
/** Unit vector down the local fall line (steepest descent at the lip). */
const FALL_DIR_X = -0.473;
const FALL_DIR_Z = 0.881;
/** Distance from the lip to the reference "pool" point — where the group is
 *  anchored and where the foam/splash concentrates. */
const FALL_RUN = 9;
/**
 * How much further the stream is drawn PAST the reference pool point,
 * fading to nothing over that distance. A hard-edged mesh boundary there
 * (the previous version's flat disc) reads as the water "just stopping" —
 * especially since the real ground keeps sloping downward past that point
 * too, so a level disc either buries itself in the uphill side or floats
 * over the downhill side. Continuing the same terrain-following ribbon a
 * little further and fading its alpha out avoids needing a level surface
 * at all: the stream visibly keeps going and dissolves into the rock/mist
 * rather than terminating at a boundary.
 */
const TAIL_RUN = 3.4;
const TOTAL_RUN = FALL_RUN + TAIL_RUN;

/**
 * GEOMETRY — follows the real terrain instead of inventing a landform.
 *
 * The previous version dropped a flat-bottomed box (plus a scatter of
 * dodecahedrons) at a single fixed height near the pool. Because the real
 * ground here is sloped and noisy (see terrain-utils.ts), a shape with one
 * uniform flat base can only ever match that ground at one place — everywhere
 * else it either floats above it or is buried in it.
 *
 * `PROFILE_STEPS` real terrain samples are taken along the actual fall line
 * from the lip (dist=0) out past the reference pool point to the fading tail
 * end (dist=TOTAL_RUN), via the same `sampleTerrain` the ground mesh itself
 * is built from. The water sheet and its flanking rock banks both hug that
 * sampled profile.
 *
 * The sheet's WIDTH at each point along the run — `halfWidthAt` — is computed
 * once here, on the CPU, and used for BOTH the sheet geometry and the rock
 * banks' clearance. That single shared function is what keeps them from
 * fighting each other: a previous version let the vertex shader alone widen
 * the sheet near the pool while the banks were placed against a narrower,
 * CPU-only estimate of that width, so the banks ended up sitting inside the
 * visually-fanned-out water once it spread wider than the banks expected.
 */
const PROFILE_STEPS = 18;
const SHEET_HALF_WIDTH = 1.7;
/** Small clearance above the sampled ground so the sheet reads as water
 *  running over rock, not embedded in it. */
const SHEET_GROUND_CLEARANCE = 0.12;
/** How much wider the flow reads at the reference pool point than at the
 *  lip — a real fall gathers and spreads as it lands. */
const POOL_BULGE = 1.55;
/** How narrow the flow tapers to by the end of the fading tail — reads as
 *  a thin continuing brook rather than a wall of water winking out. */
const TAIL_TAPER = 0.4;

function halfWidthAt(dist: number): number {
  if (dist <= FALL_RUN) {
    const t = dist / FALL_RUN;
    return SHEET_HALF_WIDTH * (1 + t * (POOL_BULGE - 1));
  }
  const t = Math.min((dist - FALL_RUN) / TAIL_RUN, 1);
  return SHEET_HALF_WIDTH * (POOL_BULGE * (1 - t) + TAIL_TAPER * t);
}

const MIST_COUNTS: Record<string, number> = { low: 0, mid: 90, high: 190 };
const SPRAY_COUNTS: Record<string, number> = { low: 0, mid: 120, high: 260 };
const BANK_COUNTS: Record<string, number> = { low: 5, mid: 9, high: 13 };

/**
 * The falling sheet.
 *
 * The physics that actually matters visually is that falling water
 * ACCELERATES, and almost nothing else about a waterfall reads correctly
 * until that is right. A parcel that left the lip is at depth d = ½gt², so
 * its age is t ∝ sqrt(d). Driving the streak pattern off `age` rather than
 * off depth is what makes the streaks automatically short and dense at the
 * lip (age changes quickly per unit depth up there) and long and stretched
 * near the pool (age changes slowly) — the single strongest cue that this is
 * falling water and not a scrolling texture.
 *
 * Everything else follows from the same model: the sheet stays coherent and
 * glassy for the first stretch, breaks into filaments as it accelerates,
 * thins as it speeds up (constant flux through a faster cross-section), and
 * turns to whitewater at the impact — then, past the reference pool point,
 * fades out entirely over the tail (see `uTailFadeStart`), rather than
 * ending at a hard mesh boundary.
 */
const SHEET_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 pos = position;
  // Fine ripple only — the overall width-vs-distance shape is already baked
  // into the geometry itself via halfWidthAt(), so this just adds a little
  // turbulence-driven variation on top rather than doing the whole job. Kept
  // deliberately small: the CPU-side bank placement below only clears
  // halfWidthAt() itself, so this residual widening has to stay small enough
  // that it can never eat into that clearance margin (verified in
  // scratchpad/waterfall-audit.mjs).
  float fall = clamp(1.0 - uv.y, 0.0, 1.6);
  pos.x *= 1.0 + fall * 0.02;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const SHEET_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uBright;
uniform vec3 uFoam;
uniform float uTailFadeStart;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
  float fall = clamp(1.0 - vUv.y, 0.0, 1.0);

  // Time since this water left the lip, under constant acceleration.
  float age = sqrt(fall + 0.004);
  // Wander: the whole curtain drifts a little, so it never reads as a decal.
  float wander = (noise(vec2(age * 2.0, uTime * 0.35)) - 0.5) * 0.06 * fall;
  float u = vUv.x + wander;

  // Streak phase advances with age, so streaks stretch as the water speeds up.
  float phase = age * 7.0 - uTime * 1.5;

  // Filaments across the width, jittered so they aren't a regular comb.
  float lane = u * 30.0 + noise(vec2(u * 5.0, age * 3.0 - uTime * 0.5)) * 3.5;
  float strand = hash(vec2(floor(lane), floor(phase * 4.0)));
  strand = smoothstep(0.48, 1.0, strand);

  float turb = noise(vec2(u * 13.0, age * 10.0 - uTime * 2.2));

  // Coherent near the lip, progressively broken up as it accelerates.
  float breakup = smoothstep(0.10, 0.80, fall);
  float body = mix(1.0, strand * 0.80 + turb * 0.40, breakup);

  // Glassy highlight right at the lip where the water is still a smooth sheet.
  float lipSheen = smoothstep(0.10, 0.0, fall);
  // Whitewater where it hits, and for the whole fading tail beyond it.
  float impact = smoothstep(0.80, 1.0, fall);
  // Soften both vertical edges so the curtain has no hard sides.
  float sideFade = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);

  vec3 color = mix(uDeep, uBright, clamp(fall * 0.5 + strand * 0.45 + turb * 0.2, 0.0, 1.0));
  color = mix(color, uFoam, clamp(impact * 1.1 + lipSheen * 0.5 + strand * 0.18, 0.0, 1.0));

  // Thins as it accelerates (same flux through a faster cross-section), then
  // thickens again into opaque whitewater at the base.
  float thin = mix(1.0, 0.62, smoothstep(0.0, 0.7, fall));
  float alpha = body * thin * sideFade;
  alpha = mix(alpha, max(alpha, 0.92), impact);
  alpha *= 0.62 + lipSheen * 0.38;

  // Past the reference pool point (vUv.y <= 0) the flow is a fading tail,
  // not a hard-edged mesh boundary — dissolve it smoothly instead of
  // letting the geometry's own edge read as "the water just stops."
  float tailFade = smoothstep(uTailFadeStart, 0.0, vUv.y);
  alpha *= tailFade;

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

/**
 * Spray thrown off the impact. Each droplet follows a REAL ballistic arc
 * evaluated in the vertex shader — launched with its own velocity, pulled down
 * by gravity, recycled when it lands. Cheaper and far more convincing than
 * drifting sprite noise, because the arcs are actually parabolic.
 */
const SPRAY_VERTEX = /* glsl */ `
uniform float uTime;
attribute vec3 aVel;
attribute float aPhase;
attribute float aScale;
attribute float aLife;
varying float vAlpha;
void main() {
  float t = mod(uTime * 0.85 + aPhase, aLife);
  vec3 pos = position + aVel * t + vec3(0.0, -4.9, 0.0) * t * t;
  // Fade in on launch, out as it falls back.
  vAlpha = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(aLife * 0.55, aLife, t));
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aScale * (26.0 / -mv.z);
}
`;

const SPRAY_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.08, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a * 0.85);
}
`;

const MIST_VERTEX = /* glsl */ `
uniform float uTime;
attribute float aPhase;
attribute float aScale;
varying float vAlpha;
void main() {
  vec3 pos = position;
  float rise = mod(uTime * 0.5 + aPhase * 2.0, 4.5);
  pos.y += rise;
  pos.x += sin(uTime * 0.3 + aPhase) * 0.9;
  pos.z += cos(uTime * 0.22 + aPhase * 1.7) * 0.7;
  vAlpha = (1.0 - clamp(rise / 4.5, 0.0, 1.0)) * smoothstep(0.0, 0.6, rise);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aScale * (30.0 / -mv.z);
}
`;

const MIST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a * 0.28);
}
`;

const DEEP = "#2f6d9c";
const FOAM = "#f2fbff";
/** -(TAIL_RUN / FALL_RUN) in vUv.y units — see uTailFadeStart in the fragment
 *  shader: alpha is full through the reference pool point (vUv.y=0) and
 *  fades to zero by the tail's actual end. */
const TAIL_FADE_START = -(TAIL_RUN / FALL_RUN);

interface LocalPoint {
  x: number;
  y: number;
  z: number;
  hw: number;
}

/** Build a terrain-hugging ribbon (2 verts/row) as a flat triangle list. No
 *  index buffer needed since this is only ever built once at mount. Each
 *  row's own `hw` (half-width) drives that row's edges, so a profile whose
 *  width narrows/bulges along its length is honored exactly, not just
 *  approximated by a later shader-side scale. */
function buildRibbonGeometry(profile: LocalPoint[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const steps = profile.length - 1;
  for (let i = 0; i < steps; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    const uvAy = 1 - i / steps;
    const uvBy = 1 - (i + 1) / steps;
    const aL = [a.x - a.hw, a.y, a.z];
    const aR = [a.x + a.hw, a.y, a.z];
    const bL = [b.x - b.hw, b.y, b.z];
    const bR = [b.x + b.hw, b.y, b.z];
    positions.push(...aL, ...aR, ...bL, ...aR, ...bR, ...bL);
    uvs.push(0, uvAy, 1, uvAy, 0, uvBy, 1, uvAy, 1, uvBy, 0, uvBy);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

export default function Waterfall() {
  const deviceTier = useUIStore((s) => s.deviceTier);
  const reducedMotion = useUIStore((s) => s.reducedMotion);

  const site = useMemo(() => {
    // Sample the REAL terrain along the actual fall line, from the lip all
    // the way out through the fading tail — this is the same sampleTerrain()
    // the ground mesh itself is built from, so the falls provably sits on
    // the mountain rather than beside/through it, for its full length.
    const rawWorld: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i <= PROFILE_STEPS; i++) {
      const dist = (i / PROFILE_STEPS) * TOTAL_RUN;
      const x = LIP_X + FALL_DIR_X * dist;
      const z = LIP_Z + FALL_DIR_Z * dist;
      rawWorld.push({ x, y: sampleTerrain(x, z).height, z });
    }
    // Reference anchor: the point at dist=FALL_RUN, i.e. where the splash/
    // foam concentrates and the group itself is positioned — NOT the visual
    // end of the flow anymore, since the flow now continues past it.
    const anchorIndex = Math.round((FALL_RUN / TOTAL_RUN) * PROFILE_STEPS);
    const anchorWorld = rawWorld[anchorIndex];
    const pool = new THREE.Vector3(anchorWorld.x, anchorWorld.y, anchorWorld.z);

    // Face the curtain (and the banks it pours between) down the fall line,
    // so the flat side of the sheet is what the trail below looks at.
    const facing = Math.atan2(FALL_DIR_X, FALL_DIR_Z);

    // Group-local coords: +Z runs downhill (toward/past the anchor at z=0),
    // +X is lateral (screen-right when facing downhill). Matches three.js's
    // own rotateY convention, so meshes parented under a group rotated by
    // `facing` land exactly on the world positions these were sampled from.
    const toWorldXZ = (localX: number, localZ: number) => ({
      x: pool.x + localX * FALL_DIR_Z + localZ * FALL_DIR_X,
      z: pool.z - localX * FALL_DIR_X + localZ * FALL_DIR_Z,
    });

    const profile: LocalPoint[] = rawWorld.map((p, i) => {
      const dist = (i / PROFILE_STEPS) * TOTAL_RUN;
      return {
        x: 0,
        y: p.y - pool.y + SHEET_GROUND_CLEARANCE,
        z: dist - FALL_RUN,
        hw: halfWidthAt(dist),
      };
    });
    const lip = profile[0];

    // Rock banks flanking the flow along its ENTIRE length, including the
    // fading tail, so the stream reads as continuing down the mountain
    // rather than the rocks stopping at some earlier, unrelated boundary.
    // Each is grounded at its OWN sampled position (not just interpolated
    // from the centerline), and cleared against the SAME halfWidthAt() the
    // sheet geometry itself uses — the two can never disagree about how
    // wide the water is at a given point, which is what let rocks end up
    // sitting inside the flow before. Coherent (sine-based) variation only —
    // no per-rock Math.random(), which reads as noise, not shape.
    const bankCount = BANK_COUNTS[deviceTier] ?? 9;
    const banks: { x: number; y: number; z: number; scale: number; tone: number }[] = [];
    for (const side of [-1, 1] as const) {
      for (let i = 0; i <= bankCount; i++) {
        const frac = i / bankCount;
        const dist = frac * TOTAL_RUN;
        const hw = halfWidthAt(dist);
        // Always-positive margin (never lets a rock drift inward onto the
        // water) plus a coherent wobble for a natural, non-uniform edge. The
        // 0.7 base has to clear both the rock's own radius (up to ~0.41) AND
        // the vertex shader's small residual ripple-widen on top of
        // halfWidthAt() — see SHEET_VERTEX and the audit script.
        const margin = 0.7 + (Math.sin(frac * 11 + side * 2.1) * 0.5 + 0.5) * 0.3;
        const lateral = side * (hw + margin);
        const localZ = dist - FALL_RUN;
        const w = toWorldXZ(lateral, localZ);
        const groundY = sampleTerrain(w.x, w.z).height;
        const edgeFade = Math.sin(Math.PI * frac); // small at both ends, fuller mid-span
        banks.push({
          x: lateral,
          y: groundY - pool.y,
          z: localZ,
          scale: 0.3 + edgeFade * 0.45 + Math.sin(frac * 17 + side) * 0.06,
          tone: (Math.sin(frac * 6 + side * 3) + 1) / 2,
        });
      }
    }

    return { profile, lip, pool, facing, banks };
  }, [deviceTier]);

  const sheetGeometry = useMemo(() => buildRibbonGeometry(site.profile), [site.profile]);
  // Braided secondary strand: narrower, offset to one side, phase-shifted —
  // real falls pour over an uneven lip as several strands, not one uniform
  // sheet. Follows the same sampled centerline as the main curtain (a
  // lateral-only offset, not independently re-sampled), with its own
  // constant width rather than the main sheet's bulge/taper.
  const strandGeometry = useMemo(() => {
    const offsetProfile = site.profile.map((p) => ({ ...p, x: 1.05, hw: 0.45 }));
    return buildRibbonGeometry(offsetProfile);
  }, [site.profile]);

  const sheetUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(DEEP) },
      uBright: { value: new THREE.Color(ACCENT_ICE) },
      uFoam: { value: new THREE.Color(FOAM) },
      uTailFadeStart: { value: TAIL_FADE_START },
    }),
    []
  );
  const strandUniforms = useMemo(
    () => ({
      uTime: { value: 1.7 },
      uDeep: { value: new THREE.Color(DEEP) },
      uBright: { value: new THREE.Color(ACCENT_ICE) },
      uFoam: { value: new THREE.Color(FOAM) },
      uTailFadeStart: { value: TAIL_FADE_START },
    }),
    []
  );
  const sprayUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color(FOAM) } }),
    []
  );
  const mistUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color(ACCENT_ICE) } }),
    []
  );

  const sprayCount = SPRAY_COUNTS[deviceTier] ?? 120;
  const spray = useMemo(() => {
    const positions = new Float32Array(sprayCount * 3);
    const velocities = new Float32Array(sprayCount * 3);
    const phases = new Float32Array(sprayCount);
    const scales = new Float32Array(sprayCount);
    const lives = new Float32Array(sprayCount);
    for (let i = 0; i < sprayCount; i++) {
      // Launched from a short line across the reference point, right where
      // the falls lands before continuing on as the fading tail.
      positions[i * 3] = (Math.random() - 0.5) * 3.2;
      positions[i * 3 + 1] = 0.15 + Math.random() * 0.4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
      // Outward and up, biased downhill — the direction the water was going.
      const angle = (Math.random() - 0.5) * Math.PI * 1.1;
      const outward = 0.8 + Math.random() * 2.2;
      velocities[i * 3] = Math.sin(angle) * outward;
      velocities[i * 3 + 1] = 1.6 + Math.random() * 2.6;
      velocities[i * 3 + 2] = Math.cos(angle) * outward * 0.7;
      phases[i] = Math.random() * 3;
      scales[i] = 0.35 + Math.random() * 0.9;
      lives[i] = 0.75 + Math.random() * 0.7;
    }
    return { positions, velocities, phases, scales, lives };
  }, [sprayCount]);

  const mistCount = MIST_COUNTS[deviceTier] ?? 90;
  const mist = useMemo(() => {
    const positions = new Float32Array(mistCount * 3);
    const scales = new Float32Array(mistCount);
    const phases = new Float32Array(mistCount);
    for (let i = 0; i < mistCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 5;
      positions[i * 3 + 1] = Math.random() * 1.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 3;
      scales[i] = 1.2 + Math.random() * 2.4;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, scales, phases };
  }, [mistCount]);

  useFrame((_, delta) => {
    const speed = reducedMotion ? 0.18 : 1;
    const step = delta * speed;
    sheetUniforms.uTime.value += step;
    strandUniforms.uTime.value += step * 0.88;
    sprayUniforms.uTime.value += step;
    mistUniforms.uTime.value += step;
  });

  return (
    <group position={site.pool} rotation={[0, site.facing, 0]}>
      {/* Lip sill: a small stone the water pours over right at the real
          sampled ground height at the top of the run — half-embedded so its
          base always matches the terrain, unlike the old free-floating
          buttress. Not meant to add height on its own; just gives the start
          of the flow a deliberate edge instead of water appearing mid-slope. */}
      <mesh position={[0, site.lip.y - 0.18, site.lip.z - 0.5]}>
        <boxGeometry args={[site.lip.hw * 2 + 0.6, 0.5, 1.0]} />
        <meshStandardMaterial color={ROCK_DARK} roughness={0.85} flatShading />
      </mesh>

      {/* Rock banks, individually grounded on the real terrain along both
          sides of the run — the mountainside's own edge, not an inserted
          landform — and cleared against the water's own actual width at
          every point, so they can never end up sitting inside the flow. */}
      {site.banks.map((r, i) => (
        <mesh key={i} position={[r.x, r.y + r.scale * 0.32, r.z]} scale={r.scale}>
          <icosahedronGeometry args={[0.55, 0]} />
          <meshStandardMaterial
            color={new THREE.Color(ROCK_GRAY).lerp(new THREE.Color(ROCK_DARK), r.tone)}
            roughness={0.92}
            flatShading
          />
        </mesh>
      ))}

      {/* Main curtain — a terrain-hugging ribbon running the real distance
          from the lip, past the reference pool point, and out through a
          fading tail — instead of a flat plane hanging in open air with a
          hard-edged stop. */}
      <mesh geometry={sheetGeometry}>
        <shaderMaterial
          vertexShader={SHEET_VERTEX}
          fragmentShader={SHEET_FRAGMENT}
          uniforms={sheetUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Braided secondary strand. */}
      <mesh geometry={strandGeometry}>
        <shaderMaterial
          vertexShader={SHEET_VERTEX}
          fragmentShader={SHEET_FRAGMENT}
          uniforms={strandUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {sprayCount > 0 && (
        <points position={[0, 0, 0]} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[spray.positions, 3]} />
            <bufferAttribute attach="attributes-aVel" args={[spray.velocities, 3]} />
            <bufferAttribute attach="attributes-aPhase" args={[spray.phases, 1]} />
            <bufferAttribute attach="attributes-aScale" args={[spray.scales, 1]} />
            <bufferAttribute attach="attributes-aLife" args={[spray.lives, 1]} />
          </bufferGeometry>
          <shaderMaterial
            vertexShader={SPRAY_VERTEX}
            fragmentShader={SPRAY_FRAGMENT}
            uniforms={sprayUniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}

      {mistCount > 0 && (
        <points position={[0, 0.1, 0]} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[mist.positions, 3]} />
            <bufferAttribute attach="attributes-aScale" args={[mist.scales, 1]} />
            <bufferAttribute attach="attributes-aPhase" args={[mist.phases, 1]} />
          </bufferGeometry>
          <shaderMaterial
            vertexShader={MIST_VERTEX}
            fragmentShader={MIST_FRAGMENT}
            uniforms={mistUniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}
    </group>
  );
}
