"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ScrollControls, useScroll, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import VaultRoom, { VAULT_ROOM_WIDTH } from "./VaultRoom";
import SceneReady from "@/components/world/SceneReady";
import { WALL_COLOR } from "./constants";
const EDGE_MARGIN = 2.2;

/** Pans the camera horizontally past the row of pedestals — same dead-simple translate-only rig as the trail map's, no rotation/look-around. */
function PanRig() {
  const scroll = useScroll();
  const { camera } = useThree();
  const halfWidth = VAULT_ROOM_WIDTH / 2 + EDGE_MARGIN;

  useFrame(() => {
    const targetX = THREE.MathUtils.lerp(-halfWidth, halfWidth, scroll.offset);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.12);
  });

  return null;
}

/**
 * The vault's independent scene — its own `<Canvas>`, camera, and scroll
 * rig, sharing no code with the mountain world or the trail map. A
 * perspective camera (unlike the trail map's flat orthographic one) plus
 * per-pedestal point lights and fog give it real depth and shadow, the
 * "dark lit room" look the trail map deliberately doesn't have.
 */
export default function VaultCanvas({ onReady }: { onReady?: () => void }) {
  return (
    <div className="fixed inset-0">
      <Canvas gl={{ antialias: true }} dpr={[1, 1.75]} shadows>
        <color attach="background" args={[WALL_COLOR]} />
        <fog attach="fog" args={[WALL_COLOR, 3, 11]} />
        <PerspectiveCamera makeDefault position={[0, 1.3, 4.4]} fov={50} near={0.1} far={30} />
        <ScrollControls pages={2} horizontal damping={0.25}>
          <PanRig />
          <VaultRoom />
        </ScrollControls>
        {onReady && <SceneReady onReady={onReady} />}
      </Canvas>
    </div>
  );
}
