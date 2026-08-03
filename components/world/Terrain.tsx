"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useUIStore } from "@/lib/store";
import {
  sampleTerrainInto,
  TERRAIN_BOUNDS,
  SUMMIT_Y,
  STATION_ANCHORS,
  type TerrainSample,
} from "./terrain-utils";
import {
  GRASS_LOW,
  GRASS_HIGH,
  DIRT_TRAIL,
  DIRT_TRAIL_DARK,
  ROCK_GRAY,
  ROCK_DARK,
  SNOW,
  SNOW_SHADE,
  STONE_PAD,
} from "./palette";

/**
 * Per-station micro-biome ground tints, blended over the base grass ramp.
 * These only ever tint GRASS — never rock, snow, dirt or pad stone — so a
 * biome can shift the character of a meadow without blurring the line
 * between one terrain type and another.
 */
const BIOME_TINTS: Record<string, string> = {
  intro: "#5a8a4d", // trailhead: fresh spring green
  chess: "#3f6d3a", // dense forest floor
  soccer: "#4c9a41", // vivid mowed-pitch green
  // Sparse highland sage. Was #75808f, a blue-gray that made the grass around
  // the research station read as rock — the single biggest offender against
  // "grass and rock should be clearly different things", since it put a
  // rock-coloured patch in the middle of a grass field with no slope change
  // to justify it. Still distinctly cooler/drier than its neighbours.
  tokamak: "#6f8a6a",
  piano: "#8aa257", // warm alpine meadow
  vault: "#3e7d5f", // lush teal-green — kept even after the waterfall moved to tokamak's background (2026-07-27), reads fine as a mossy/damp tint on its own
};
const BIOME_RADIUS = 13;
// Lowered from 0.55: a strong per-station tint pulls grass away from being
// recognisably grass, which works directly against terrain-type separation.
const BIOME_STRENGTH = 0.45;

const SEGMENTS: Record<string, number> = { low: 110, mid: 150, high: 190 };

// --- Terrain band boundaries ----------------------------------------------
// Every material transition is a narrow smoothstep band rather than a hard
// `if` threshold. Hard thresholds put the boundary exactly on the triangle
// edges of whatever tessellation the device tier picked, so the grass/rock
// and snow/grass lines came out as visibly stair-stepped, tier-dependent
// zigzags. Keeping each band NARROW is what preserves (and sharpens) the
// separation between terrain types — the goal is a clean edge, not a long
// gradient that muddies two materials into each other over many metres.

/** Surface normal Y at/below which a face is fully rock, and above which it's fully not. */
const ROCK_NY_FULL = 0.72;
const ROCK_NY_NONE = 0.83;
/** Height (relative to the summit) where snow starts and where it's total. */
const SNOW_START_BELOW_SUMMIT = 4.4;
const SNOW_BAND = 1.8;
/** How far the snow LINE itself wanders, in world units of height. */
const SNOW_LINE_WANDER = 1.1;
/** Trail corridor: fully dirt within this distance of the centreline... */
const DIRT_CORE = 2.2;
/** ...fading out over this much more. */
const DIRT_BLEND = 0.6;
/**
 * Pad stone: `padWeight` at/above which the ground is fully paved, and below
 * which it isn't. Both sit high because padWeight eases off over a generous
 * 2.5 world units (it drives the GEOMETRY flatten, which wants a long, gentle
 * blend) — mapping the colour to the top sliver of that range gives the pad a
 * defined edge roughly a quarter-unit outside the flatten radius, instead of
 * a wide stone halo bleeding into the surrounding ground.
 */
const PAD_FULL = 0.98;
const PAD_NONE = 0.8;

/**
 * 0 below `edge0`, 1 above `edge1`, eased between. Deliberately NOT named
 * `smoothstep`: this takes GLSL's (edge0, edge1, x) argument order, whereas
 * `THREE.MathUtils.smoothstep` — used elsewhere in this codebase, e.g.
 * CameraRig's vista blend — takes (x, min, max). Two same-named helpers with
 * swapped arguments in one project is a bug waiting to happen.
 */
function smoothBand(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Smooth, position-derived variation — the replacement for the per-vertex
 * `Math.random()` brightness jitter and the random "embedded pebble" lerp
 * that used to live in the colour loop.
 *
 * Those two were the actual cause of the splotchy look. Vertex colours are
 * Gouraud-interpolated across each triangle, so an UNCORRELATED random value
 * at each vertex doesn't read as fine grain — it reads as a blotch the size
 * of the triangle fan around that vertex, and adjacent blotches disagree.
 * The effect was worst on the large flat-coloured expanses (snow, the trail)
 * where there's no lighting variation to hide it, which is exactly where it
 * showed up.
 *
 * This keeps ground variation but sources it from smooth, long-wavelength
 * functions of world position: neighbouring vertices now get near-identical
 * values, so the interpolation has nothing to smear and the variation lands
 * at a scale of many metres instead of one triangle. Returns roughly -1..1.
 */
function macroVariation(x: number, z: number): number {
  return (
    Math.sin(x * 0.13 + z * 0.08 + 0.9) * 0.44 +
    Math.sin(x * 0.07 - z * 0.19 + 2.7) * 0.32 +
    Math.sin((x + z) * 0.29 + 5.1) * 0.24
  );
}

/**
 * One continuous vertex-colored mountain: grass on gentle slopes, dirt on
 * the trail corridor, stone on station pads, gray rock on steep faces,
 * snow near the summit. The footpath is carved into the mesh itself
 * (see terrain-utils.sampleTerrain), so the trail reads as a real,
 * connected route from base to summit.
 */
export default function Terrain() {
  const deviceTier = useUIStore((s) => s.deviceTier);
  const segments = SEGMENTS[deviceTier] ?? 132;

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      TERRAIN_BOUNDS.width,
      TERRAIN_BOUNDS.depth,
      segments,
      segments
    );
    geo.rotateX(-Math.PI / 2);
    geo.translate(TERRAIN_BOUNDS.centerX, 0, TERRAIN_BOUNDS.centerZ);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const count = pos.count;
    const trailDists = new Float32Array(count);
    // Continuous pad influence, not a boolean — see the pad blend below.
    const padWeights = new Float32Array(count);

    const sample: TerrainSample = { height: 0, trailDist: 0, onPad: false, padWeight: 0 };
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const s = sampleTerrainInto(x, z, sample);
      pos.setY(i, s.height);
      trailDists[i] = s.trailDist;
      padWeights[i] = s.padWeight;
    }
    geo.computeVertexNormals();

    const grassLow = new THREE.Color(GRASS_LOW);
    const grassHigh = new THREE.Color(GRASS_HIGH);
    const dirt = new THREE.Color(DIRT_TRAIL);
    const dirtDark = new THREE.Color(DIRT_TRAIL_DARK);
    const rock = new THREE.Color(ROCK_GRAY);
    const rockDark = new THREE.Color(ROCK_DARK);
    const snow = new THREE.Color(SNOW);
    const snowShade = new THREE.Color(SNOW_SHADE);
    const stone = new THREE.Color(STONE_PAD);
    const biomes = STATION_ANCHORS.filter((a) => BIOME_TINTS[a.id]).map((a) => ({
      x: a.x,
      z: a.z,
      color: new THREE.Color(BIOME_TINTS[a.id]),
    }));

    const normals = geo.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    const layer = new THREE.Color();
    const snowLine = SUMMIT_Y - SNOW_START_BELOW_SUMMIT;

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ny = normals.getY(i);
      const n = macroVariation(x, z);

      // Layers are applied in strict low-to-high precedence, each as a
      // weighted blend over whatever is already there — so a point that's
      // both steep AND high AND on the trail resolves the same way every
      // time, and each boundary is a clean edge instead of an `else` branch
      // that changes the whole colour the moment a threshold is crossed.

      // 1. Base ground: grass, ramped by altitude, tinted by the single
      //    nearest station's biome (never several — adjacent stations'
      //    radii overlap, and compounding them washed out to a muddy gray).
      const altT = THREE.MathUtils.clamp((y + 2) / (SUMMIT_Y + 2), 0, 1);
      c.copy(grassLow).lerp(grassHigh, altT * altT * (3 - 2 * altT));
      let biomeColor: THREE.Color | null = null;
      let biomeW = 0;
      for (const b of biomes) {
        const bd = Math.hypot(b.x - x, b.z - z);
        if (bd < BIOME_RADIUS) {
          const w = 1 - bd / BIOME_RADIUS;
          if (w > biomeW) {
            biomeW = w;
            biomeColor = b.color;
          }
        }
      }
      if (biomeColor) {
        c.lerp(biomeColor, biomeW * biomeW * (3 - 2 * biomeW) * BIOME_STRENGTH);
      }

      // 2. Rock on steep faces. Full rock below ROCK_NY_FULL, none above
      //    ROCK_NY_NONE. The previous version smeared up to 60% rock across
      //    a 0.16-wide slope range on TOP of an already-hard rock cutoff, so
      //    a large share of the mountainside was a half-and-half grass/rock
      //    mix that read as neither — the main reason the two never looked
      //    like separate materials.
      const rockW = 1 - smoothBand(ROCK_NY_FULL, ROCK_NY_NONE, ny);
      if (rockW > 0) {
        layer.copy(rockDark).lerp(rock, 0.5 + n * 0.5);
        c.lerp(layer, rockW);
      }

      // 3. Snow near the summit. The snow LINE itself is offset by the same
      //    smooth variation, so it meanders naturally across the slope
      //    instead of tracing a perfect horizontal contour — but it stays a
      //    narrow, decisive band rather than a long fade into the rock.
      const snowW = smoothBand(snowLine, snowLine + SNOW_BAND, y + n * SNOW_LINE_WANDER);
      if (snowW > 0) {
        layer.copy(snowShade).lerp(snow, 0.55 + n * 0.45);
        c.lerp(layer, snowW);
      }

      // 4. The trail corridor. Dirt overrides snow deliberately (as it
      //    always has) — the route stays walkable and visible all the way to
      //    the summit rather than disappearing under the snow line.
      const dirtW = 1 - smoothBand(DIRT_CORE, DIRT_CORE + DIRT_BLEND, trailDists[i]);
      if (dirtW > 0) {
        layer.copy(dirtDark).lerp(dirt, 0.55 + n * 0.45);
        c.lerp(layer, dirtW);
      }

      // 5. Station pads, last — paved ground beats everything under it.
      const padW = smoothBand(PAD_NONE, PAD_FULL, padWeights[i]);
      if (padW > 0) c.lerp(stone, padW);

      // Worn shoulder: a soft darkening right where the trail meets the
      // ground beside it. Peaks in the middle of the transition band and is
      // zero at both ends, so it reads as the trail having a real edge
      // rather than being painted on — the cheapest single thing that makes
      // dirt and grass look like genuinely different surfaces.
      const shoulder = 4 * dirtW * (1 - dirtW) * (1 - padW);
      c.multiplyScalar((1 + n * 0.05) * (1 - shoulder * 0.14));

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [segments]);

  return (
    <mesh geometry={geometry} receiveShadow>
      {/* Smooth (not flat) shading is the single biggest lever for reading as
          one continuous rolling surface instead of faceted low-poly panels —
          the geometry keeps its low-poly silhouette, but lighting interpolates
          across vertex normals instead of per-triangle. */}
      <meshStandardMaterial vertexColors roughness={0.92} metalness={0.02} />
    </mesh>
  );
}
