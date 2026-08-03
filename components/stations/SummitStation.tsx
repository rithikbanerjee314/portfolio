"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PATH_CURVE } from "@/components/world/path";
import StationPad from "./StationPad";
import StationLabel from "./StationLabel";
import { useUIStore } from "@/lib/store";
import { ACCENT_SIGNAL } from "@/components/world/palette";

/**
 * Summit: a flag on a stone cairn marking the end of the climb.
 * The contact pane opens on arrival, or via its label/tab.
 */
export default function SummitStation() {
  const anchor = useMemo(() => PATH_CURVE.getPointAt(1), []);
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const flagRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!flagRef.current) return;
    const t = state.clock.elapsedTime;
    const speed = reducedMotion ? 0.25 : 1;
    // gentle wave: skew the flag by rotating around its pole edge
    flagRef.current.rotation.y = Math.sin(t * 2.2 * speed) * 0.18;
    flagRef.current.position.z = Math.sin(t * 1.4 * speed) * 0.02;
  });

  return (
    <group>
      <StationPad center={anchor} radius={4.1} />
      <group position={[anchor.x, anchor.y, anchor.z]}>
        {/* cairn */}
        <mesh position={[0, 0.22, 0]} castShadow>
          <dodecahedronGeometry args={[0.42, 0]} />
          <meshStandardMaterial color="#8d99ae" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.18, 0.5, 0.1]} castShadow>
          <dodecahedronGeometry args={[0.26, 0]} />
          <meshStandardMaterial color="#a3adc2" roughness={0.9} flatShading />
        </mesh>
        {/* flag pole */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 2.4, 8]} />
          <meshStandardMaterial color="#d8dee9" roughness={0.4} metalness={0.5} />
        </mesh>
        {/* flag */}
        <mesh ref={flagRef} position={[0.42, 2.45, 0]} castShadow>
          <planeGeometry args={[0.8, 0.5, 6, 1]} />
          <meshStandardMaterial
            color={ACCENT_SIGNAL}
            side={THREE.DoubleSide}
            roughness={0.6}
            emissive={ACCENT_SIGNAL}
            emissiveIntensity={0.15}
          />
        </mesh>
      </group>
      <StationLabel
        stationId="summit"
        stationT={1}
        title="🏔 Summit — Contact"
        accent="#8fd6ff"
        position={[anchor.x, anchor.y + 3.4, anchor.z]}
      />
    </group>
  );
}
