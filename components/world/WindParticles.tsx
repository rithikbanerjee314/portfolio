"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useUIStore } from "@/lib/store";
import { ACCENT_ICE } from "./palette";

const VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform float uMotion;
attribute float aPhase;
attribute float aScale;
varying float vAlpha;

void main() {
  vec3 pos = position;
  pos.x += sin(uTime * 0.18 + aPhase) * 1.4 * uMotion;
  pos.y += sin(uTime * 0.12 + aPhase * 1.6) * 0.6 * uMotion;
  pos.z += (uTime * 0.9 + aPhase * 3.0) * uMotion; // steady drift, wraps via mod below
  pos.z = mod(pos.z + 30.0, 60.0) - 30.0;

  vAlpha = 0.35 + 0.35 * sin(uTime * 0.5 + aPhase * 4.0);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aScale * (18.0 / -mv.z);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float alpha = smoothstep(0.5, 0.05, d) * vAlpha;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha * 0.6);
}
`;

const COUNTS: Record<string, number> = { low: 250, mid: 550, high: 1000 };

export default function WindParticles() {
  const deviceTier = useUIStore((s) => s.deviceTier);
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const count = COUNTS[deviceTier] ?? 550;

  const { positions, scales, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = Math.random() * 32 - 2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60 - 5;
      scales[i] = 0.4 + Math.random() * 1.2;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, scales, phases };
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uColor: { value: new THREE.Color(ACCENT_ICE) },
    }),
    []
  );

  useFrame((_, delta) => {
    uniforms.uTime.value += delta * (reducedMotion ? 0.2 : 1);
    uniforms.uMotion.value = reducedMotion ? 0.2 : 1;
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aScale" args={[scales, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
