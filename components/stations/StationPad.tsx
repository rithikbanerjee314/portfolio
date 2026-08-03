"use client";

import * as THREE from "three";
import { STONE_PAD } from "@/components/world/palette";

/** Circular stone platform that visually anchors a station beside the trail. */
export default function StationPad({
  center,
  radius = 2.6,
}: {
  center: THREE.Vector3;
  radius?: number;
}) {
  return (
    <group position={[center.x, center.y, center.z]}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[radius, radius + 0.25, 0.12, 28]} />
        <meshStandardMaterial color={STONE_PAD} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.28, radius - 0.1, 28]} />
        <meshStandardMaterial color="#8b857c" roughness={0.9} />
      </mesh>
    </group>
  );
}
