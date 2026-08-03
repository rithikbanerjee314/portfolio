"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ScrollControls, useScroll, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import TrailMapBoard from "./TrailMapBoard";
import { TRAILMAP_LAYOUT } from "./layout";
import SceneReady from "@/components/world/SceneReady";
import { BOARD_BACKGROUND } from "./constants";
// Extra margin past the outermost badges so the pan doesn't stop with a
// badge flush against the screen edge.
const EDGE_MARGIN = 1.6;

/** Pans the orthographic camera horizontally across the board as the visitor scrolls — no rotation, no look-around, just a flat left-right pan. */
function PanRig() {
  const scroll = useScroll();
  const { camera } = useThree();
  const halfWidth = TRAILMAP_LAYOUT.totalWidth / 2 + EDGE_MARGIN;

  useFrame(() => {
    const targetX = THREE.MathUtils.lerp(-halfWidth, halfWidth, scroll.offset);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.12);
  });

  return null;
}

/**
 * A fully independent R3F scene for the trail map's interior — its own
 * `<Canvas>`, camera, and scroll rig, sharing no code with the mountain
 * world's `WorldCanvas`/`CameraRig`/`path.ts`. A flat orthographic camera
 * gives the "2D map trail, viewed in 3D" look: badges stay a constant size
 * and never distort in perspective as the visitor pans across them.
 */
export default function TrailMapCanvas({ onReady }: { onReady?: () => void }) {
  return (
    <div className="fixed inset-0">
      <Canvas gl={{ antialias: true }} dpr={[1, 1.75]}>
        <color attach="background" args={[BOARD_BACKGROUND]} />
        <OrthographicCamera makeDefault position={[0, 0, 10]} zoom={110} near={0.1} far={50} />
        <ScrollControls pages={3} horizontal damping={0.25}>
          <PanRig />
          <TrailMapBoard />
        </ScrollControls>
        {onReady && <SceneReady onReady={onReady} />}
      </Canvas>
    </div>
  );
}
