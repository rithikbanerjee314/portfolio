"use client";

import { Text } from "@react-three/drei";
import { getStationContent } from "@/components/stations/stations.data";
import { VAULT_PROJECT_IDS, VAULT_OBJECTS } from "./vault.data";
import { useUIStore } from "@/lib/store";

const SPACING = 3;
const PEDESTAL_RADIUS = 0.5;
const PEDESTAL_HEIGHT = 0.85;
const PEDESTAL_COLOR = "#2a2632";
const FLOOR_COLOR = "#141018";
const WALL_COLOR = "#0d0a12";

/** Total row width — exported so `VaultCanvas`'s pan rig can clamp the camera to it. */
export const VAULT_ROOM_WIDTH = Math.max(VAULT_PROJECT_IDS.length - 1, 0) * SPACING;

/**
 * A row of stone pedestals in a dark room, one per vault project — each lit
 * by its own warm point light so it reads as a spotlit exhibit against the
 * surrounding dark, rather than one evenly-lit "board" like the trail map.
 * Clicking a pedestal or its object toggles `vaultSelectedId`, which
 * `VaultGate.tsx` reads to show the project's real detail sheet (with an
 * actual GitHub link) as DOM chrome outside the canvas.
 */
export default function VaultRoom() {
  const vaultSelectedId = useUIStore((s) => s.vaultSelectedId);
  const setVaultSelectedId = useUIStore((s) => s.setVaultSelectedId);
  const startX = -VAULT_ROOM_WIDTH / 2;

  return (
    <group>
      <ambientLight intensity={0.1} color="#3a3550" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[VAULT_ROOM_WIDTH + 8, 8]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.9} />
      </mesh>
      <mesh position={[0, 3, -2.4]}>
        <planeGeometry args={[VAULT_ROOM_WIDTH + 8, 6]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.95} />
      </mesh>

      {VAULT_PROJECT_IDS.map((id, i) => {
        const content = getStationContent(id);
        const Object3D = VAULT_OBJECTS[id];
        const x = startX + i * SPACING;
        const accent = content?.accent ?? "#e8b923";
        const selected = vaultSelectedId === id;
        const toggle = () => setVaultSelectedId(selected ? null : id);

        return (
          <group key={id} position={[x, 0, 0]} scale={selected ? 1.08 : 1}>
            <pointLight
              position={[0, PEDESTAL_HEIGHT + 1.3, 0.6]}
              color={accent}
              intensity={selected ? 3.2 : 1.9}
              distance={4.2}
              decay={2}
            />
            <mesh
              position={[0, PEDESTAL_HEIGHT / 2, 0]}
              castShadow
              receiveShadow
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
            >
              <cylinderGeometry args={[PEDESTAL_RADIUS, PEDESTAL_RADIUS * 1.15, PEDESTAL_HEIGHT, 20]} />
              <meshStandardMaterial
                color={PEDESTAL_COLOR}
                emissive={accent}
                emissiveIntensity={selected ? 0.18 : 0.05}
                roughness={0.6}
              />
            </mesh>
            {Object3D && (
              <group position={[0, PEDESTAL_HEIGHT + 0.28, 0]}>
                <Object3D onClick={toggle} />
              </group>
            )}
            {content && (
              <Text
                position={[0, PEDESTAL_HEIGHT + 0.85, 0]}
                fontSize={0.16}
                color="#e8e2d8"
                anchorX="center"
                anchorY="middle"
              >
                {`${content.emoji} ${content.title}`}
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}
