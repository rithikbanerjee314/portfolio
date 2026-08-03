"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useUIStore } from "@/lib/store";
import { sampleTerrain, mulberry32, TERRAIN_BOUNDS, SUMMIT_Y } from "./terrain-utils";
import { TREE_GREEN, TREE_GREEN_LIGHT, TRUNK_BROWN, ROCK_GRAY } from "./palette";

const TREE_COUNTS: Record<string, number> = { low: 60, mid: 140, high: 240 };
// Grass is by far the dominant cost here (see the staging comment below) —
// trimmed from the original {low:0, mid:500, high:1100} specifically to cut
// that cost, not for a visual-density reason. At normal scatter density,
// scattered grass blades read as "a meadow" well before four figures of
// instances; this still looks lush while meaningfully shortening the
// rejection-sampling loop that dominates Vegetation's mount cost.
const GRASS_COUNTS: Record<string, number> = { low: 0, mid: 320, high: 700 };
const ROCK_COUNTS: Record<string, number> = { low: 26, mid: 55, high: 90 };

interface Placement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  tint: number;
}

function scatter(
  count: number,
  seed: number,
  opts: {
    minTrailDist: number;
    maxTrailDist?: number;
    maxSlopeDrop: number;
    belowSnow: boolean;
  }
): Placement[] {
  const rand = mulberry32(seed);
  const out: Placement[] = [];
  let attempts = 0;
  const maxTrail = opts.maxTrailDist ?? 26;
  while (out.length < count && attempts < count * 14) {
    attempts++;
    const x = TERRAIN_BOUNDS.minX + rand() * TERRAIN_BOUNDS.width;
    const z = TERRAIN_BOUNDS.minZ + rand() * TERRAIN_BOUNDS.depth;
    const s = sampleTerrain(x, z);
    if (s.onPad || s.trailDist < opts.minTrailDist || s.trailDist > maxTrail) continue;
    if (opts.belowSnow && s.height > SUMMIT_Y - 4.5) continue;
    const dh =
      Math.abs(sampleTerrain(x + 0.8, z).height - s.height) +
      Math.abs(sampleTerrain(x, z + 0.8).height - s.height);
    if (dh > opts.maxSlopeDrop) continue;
    out.push({
      x,
      y: s.height,
      z,
      scale: 0.7 + rand() * 0.9,
      rot: rand() * Math.PI * 2,
      tint: rand(),
    });
  }
  return out;
}

/**
 * MeshStandardMaterial with a vertex-shader wind sway injected. Sway is
 * per-instance phased (gl_InstanceID) and scaled by local height so bases
 * stay planted while tops move — trees rustle, grass ripples.
 */
function makeWindMaterial(
  timeUniform: { value: number },
  strength: number,
  opts: THREE.MeshStandardMaterialParameters = {}
) {
  const m = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0.02,
    flatShading: true,
    ...opts,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uStr = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime;\nuniform float uStr;"
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          float phase = float(gl_InstanceID) * 1.731;
          float hgt = smoothstep(0.0, 1.6, transformed.y);
          transformed.x += sin(uTime * 1.7 + phase) * uStr * hgt;
          transformed.z += cos(uTime * 1.15 + phase * 0.63) * uStr * 0.65 * hgt;
        }`
      );
  };
  return m;
}

function buildInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: Placement[],
  yOffsetPerScale: number,
  colorA: string,
  colorB: string
) {
  const im = new THREE.InstancedMesh(geometry, material, placements.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const a = new THREE.Color(colorA);
  const b = new THREE.Color(colorB);
  const c = new THREE.Color();
  placements.forEach((p, i) => {
    eul.set(0, p.rot, 0);
    q.setFromEuler(eul);
    m.compose(
      new THREE.Vector3(p.x, p.y + yOffsetPerScale * p.scale, p.z),
      q,
      new THREE.Vector3(p.scale, p.scale, p.scale)
    );
    im.setMatrixAt(i, m);
    c.copy(a).lerp(b, p.tint);
    im.setColorAt(i, c);
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  return im;
}

export default function Vegetation({ onFullyBuilt }: { onFullyBuilt?: () => void }) {
  const deviceTier = useUIStore((s) => s.deviceTier);
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const treeCount = TREE_COUNTS[deviceTier] ?? 140;
  const grassCount = GRASS_COUNTS[deviceTier] ?? 500;
  const rockCount = ROCK_COUNTS[deviceTier] ?? 55;

  const timeUniform = useMemo(() => ({ value: 0 }), []);
  useFrame((state) => {
    timeUniform.value = state.clock.elapsedTime * (reducedMotion ? 0.15 : 1);
  });

  // Each category's scatter() is real rejection-sampling work — up to
  // count*14 candidate points, each costing a full sampleTerrain() call
  // (itself an O(239) scan over the path) plus up to two more for the
  // slope check. Computing all three (trees + grass + rocks) in the same
  // render was a measured multi-hundred-ms synchronous block. Staging each
  // category onto its own animation frame — cheapest first — spreads that
  // cost across a few frames instead of paying it all in one commit, which
  // matters even now that the page waits for this to finish before
  // revealing (see WorldCanvas.tsx/onFullyBuilt below) — a single huge
  // synchronous block can still make the tab appear to hang. This changes
  // nothing about WHAT gets built (same seeds, same scatter()/
  // buildInstancedMesh() logic, byte-for-byte), only when each piece's
  // one-time cost lands.
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= 3) return;
    const id = requestAnimationFrame(() => setStage((s) => s + 1));
    return () => cancelAnimationFrame(id);
  }, [stage]);

  // Vegetation is the long pole in the whole "everything is loaded" gate
  // (see WorldCanvas.tsx) — report completion once the last (heaviest)
  // category has actually been built, not just requested.
  const reportedFullyBuilt = useRef(false);
  useEffect(() => {
    if (stage === 3 && !reportedFullyBuilt.current) {
      reportedFullyBuilt.current = true;
      onFullyBuilt?.();
    }
  }, [stage, onFullyBuilt]);

  const rocks = useMemo(
    () =>
      stage >= 1
        ? scatter(rockCount, 1337, { minTrailDist: 3.4, maxSlopeDrop: 1.6, belowSnow: false })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage >= 1, rockCount]
  );
  const trees = useMemo(
    () =>
      stage >= 2
        ? scatter(treeCount, 42, { minTrailDist: 4.2, maxSlopeDrop: 0.9, belowSnow: true })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage >= 2, treeCount]
  );
  const grass = useMemo(
    () =>
      stage >= 3
        ? scatter(grassCount, 777, {
            minTrailDist: 2.4,
            maxTrailDist: 10,
            maxSlopeDrop: 0.8,
            belowSnow: true,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage >= 3, grassCount]
  );

  const rockMeshes = useMemo(() => {
    if (rocks.length === 0) return [];
    const rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      roughness: 0.95,
      metalness: 0.02,
      flatShading: true,
    });
    return [buildInstancedMesh(rockGeo, rockMat, rocks, 0.15, ROCK_GRAY, "#5c6470")];
  }, [rocks]);

  const treeMeshes = useMemo(() => {
    if (trees.length === 0) return [];
    // Pine: trunk + three stacked canopy tiers (wide → narrow)
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 0.6, 6);
    const tier1 = new THREE.ConeGeometry(0.78, 1.0, 7);
    const tier2 = new THREE.ConeGeometry(0.58, 0.9, 7);
    const tier3 = new THREE.ConeGeometry(0.38, 0.8, 7);
    const trunkMat = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true,
    });
    const canopyMat = makeWindMaterial(timeUniform, 0.05);
    return [
      buildInstancedMesh(trunkGeo, trunkMat, trees, 0.3, TRUNK_BROWN, "#8a5a2b"),
      buildInstancedMesh(tier1, canopyMat, trees, 1.0, TREE_GREEN, TREE_GREEN_LIGHT),
      buildInstancedMesh(tier2, canopyMat, trees, 1.62, "#265c43", TREE_GREEN_LIGHT),
      buildInstancedMesh(tier3, canopyMat, trees, 2.18, TREE_GREEN, "#57a773"),
    ];
  }, [trees, timeUniform]);

  const grassMeshes = useMemo(() => {
    if (grass.length === 0) return [];
    const bladeGeo = new THREE.ConeGeometry(0.035, 0.42, 5);
    const grassMat = makeWindMaterial(timeUniform, 0.09, { side: THREE.DoubleSide });
    return [buildInstancedMesh(bladeGeo, grassMat, grass, 0.18, "#5a8f3d", "#94c94b")];
  }, [grass, timeUniform]);

  const meshes = useMemo(
    () => [...rockMeshes, ...treeMeshes, ...grassMeshes],
    [rockMeshes, treeMeshes, grassMeshes]
  );

  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}
