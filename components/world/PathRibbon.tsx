"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { PATH_CURVE } from "./path";
import { PATH_SAMPLES, TRAIL_HALF_WIDTH, sampleTerrain } from "./terrain-utils";

/**
 * The visible footpath: a flat ribbon following the curve. Each edge vertex
 * is welded to the actual terrain height at its own (x,z) so the ribbon
 * hugs the ground everywhere — no floating/disconnected strips on bends.
 */
export default function PathRibbon() {
  const geometry = useMemo(() => {
    const half = TRAIL_HALF_WIDTH * 0.55;
    const up = new THREE.Vector3(0, 1, 0);
    const positions: number[] = [];
    const indices: number[] = [];
    let prevTangent: THREE.Vector3 | null = null;
    let prevSide: THREE.Vector3 | null = null;

    for (let i = 0; i < PATH_SAMPLES.length; i++) {
      const p = PATH_SAMPLES[i];
      // The curve's own analytic tangent at this sample's arc-length
      // position, not a finite-difference between neighboring
      // PATH_SAMPLES — on the steeper climbing stretches between stations
      // (not at stations, which sit on their own flattened pads — matches
      // where this bug actually showed up) the path's horizontal (XZ)
      // displacement between two adjacent samples can shrink close to
      // zero even though the analytic curve is climbing smoothly. Once
      // `.setY(0).normalize()` amplifies that near-zero vector, the
      // width-direction `side` below can swing wildly or flip sign from
      // one sample to the next, pinching the ribbon to zero width and
      // twisting the strip into a self-intersecting sliver — it reads as
      // a small dark shard, backlit by its own flipped face normal.
      const tParam = i / (PATH_SAMPLES.length - 1);
      const rawTangent = PATH_CURVE.getTangentAt(tParam).clone().setY(0);
      const tangent: THREE.Vector3 =
        rawTangent.lengthSq() < 1e-8
          ? (prevTangent ?? new THREE.Vector3(1, 0, 0)).clone()
          : rawTangent.normalize();
      prevTangent = tangent;
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
      // Belt-and-suspenders: keep `side`'s sign continuous with the
      // previous sample so the ribbon's left/right edges never swap
      // between adjacent quads even if the tangent itself wobbles.
      if (prevSide && side.dot(prevSide) < 0) side.negate();
      prevSide = side;
      const lx = p.x + side.x * half;
      const lz = p.z + side.z * half;
      const rx = p.x - side.x * half;
      const rz = p.z - side.z * half;
      positions.push(lx, sampleTerrain(lx, lz).height + 0.05, lz);
      positions.push(rx, sampleTerrain(rx, rz).height + 0.05, rz);
      if (i > 0) {
        const a = (i - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#b08968" roughness={0.9} metalness={0} />
    </mesh>
  );
}
