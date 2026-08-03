"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useUIStore } from "@/lib/store";

const BODY_COLOR = "#4f8fdb";
const FIN_COLOR = "#2f6bff";
const BODY_SIZE = 0.34;

/** Flat triangular tail — one static mesh, no physics, that only moves when clicked. */
function tailFinGeometry(size: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-size * 1.1, size * 0.6);
  shape.lineTo(-size * 0.6, 0);
  shape.lineTo(-size * 1.1, -size * 0.6);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/**
 * The same fish that used to stand at its own main-stage station — now the
 * first exhibit inside the vault. One elongated ellipsoid body, a flat tail
 * fin, and an eye; motionless at rest, flops briefly on click. Positioning
 * (which pedestal it sits on) is the caller's job — this only draws the
 * fish around its own local origin, so a wrapping `<group position>` places it.
 */
export default function FishObject({ onClick }: { onClick?: () => void }) {
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const groupRef = useRef<THREE.Group>(null);
  const flop = useRef(0);
  const tailGeo = useMemo(() => tailFinGeometry(BODY_SIZE), []);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    if (flop.current > 0) {
      flop.current = Math.max(0, flop.current - delta * (reducedMotion ? 3 : 1.7));
      g.rotation.y = Math.sin(flop.current * Math.PI * 3.2) * flop.current * 0.55;
      g.position.y = Math.max(Math.sin(flop.current * Math.PI), 0) * 0.08;
    } else if (g.rotation.y !== 0 || g.position.y !== 0) {
      g.rotation.y = 0;
      g.position.y = 0;
    }
  });

  return (
    <group
      ref={groupRef}
      onPointerDown={(e) => {
        e.stopPropagation();
        flop.current = 1;
        onClick?.();
      }}
    >
      <mesh castShadow scale={[1.5, 0.72, 0.55]}>
        <sphereGeometry args={[BODY_SIZE, 16, 12]} />
        <meshStandardMaterial color={BODY_COLOR} roughness={0.45} />
      </mesh>
      <mesh geometry={tailGeo} position={[-BODY_SIZE * 1.15, 0, 0]}>
        <meshStandardMaterial color={FIN_COLOR} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[BODY_SIZE * 0.85, BODY_SIZE * 0.12, BODY_SIZE * 0.26]}>
        <sphereGeometry args={[BODY_SIZE * 0.1, 8, 8]} />
        <meshStandardMaterial color="#0e1c33" />
      </mesh>
    </group>
  );
}
