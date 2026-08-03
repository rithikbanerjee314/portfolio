"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useUIStore } from "@/lib/store";
import { TERRAIN_BOUNDS, SUMMIT_Y, mulberry32 } from "./terrain-utils";

const COUNTS: Record<string, number> = { low: 6, mid: 11, high: 16 };
/** Cloud deck sits well below the summit so the final stop looks down on it. */
const DECK_MIN = SUMMIT_Y * 0.45;
const DECK_MAX = SUMMIT_Y * 0.68;

function makeCloudTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // a few overlapping soft blobs make a puffier silhouette than one radial
  const blobs: [number, number, number][] = [
    [0.5, 0.55, 0.32],
    [0.32, 0.6, 0.22],
    [0.68, 0.62, 0.24],
    [0.45, 0.42, 0.2],
    [0.6, 0.45, 0.18],
  ];
  for (const [bx, by, br] of blobs) {
    const g = ctx.createRadialGradient(
      bx * size,
      by * size,
      0,
      bx * size,
      by * size,
      br * size
    );
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(0.6, "rgba(245,249,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function Clouds() {
  const deviceTier = useUIStore((s) => s.deviceTier);
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const count = COUNTS[deviceTier] ?? 11;
  const groupRef = useRef<THREE.Group>(null);

  const { sprites, speeds } = useMemo(() => {
    const texture = makeCloudTexture();
    const rand = mulberry32(2024);
    const sprites: THREE.Sprite[] = [];
    const speeds: number[] = [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.5 + rand() * 0.3,
        depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      const scale = 7 + rand() * 8;
      s.scale.set(scale, scale * 0.42, 1);
      s.position.set(
        TERRAIN_BOUNDS.minX + rand() * TERRAIN_BOUNDS.width,
        DECK_MIN + rand() * (DECK_MAX - DECK_MIN),
        TERRAIN_BOUNDS.minZ + rand() * TERRAIN_BOUNDS.depth
      );
      sprites.push(s);
      speeds.push(0.25 + rand() * 0.5);
    }
    return { sprites, speeds };
  }, [count]);

  useFrame((_, delta) => {
    const drift = reducedMotion ? 0.12 : 1;
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      s.position.x += speeds[i] * delta * drift;
      if (s.position.x > TERRAIN_BOUNDS.maxX + 10) {
        s.position.x = TERRAIN_BOUNDS.minX - 10;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {sprites.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
    </group>
  );
}
