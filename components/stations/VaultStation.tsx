"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getStationAnchor, STATION_ORDER } from "@/components/world/path";
import StationPad from "./StationPad";
import StationLabel from "./StationLabel";
import { useUIStore } from "@/lib/store";

const station = STATION_ORDER.find((s) => s.id === "vault")!;

const ACCENT = "#e8b923";
const WOOD_LIGHT = "#d9974a";
const WOOD_SIDE = "#b5652f";
const TRIM_DARK = "#2b1a0f";
const RIVET_COLOR = "#c9a45c";

const BASE_W = 1.3;
const BASE_H = 0.46;
const BASE_D = 0.85;
// The dome's chord (its curved cross-section, before the final 90° swap
// below) matches the chest's DEPTH, not its width — this is what puts the
// flat end faces on the left/right sides once swapped, matching a real
// barrel-top chest (flat-ish front, rounded profile from the side).
const DOME_CHORD_R = BASE_D / 2;
// A full half-cylinder — sagitta == radius, so makeDomeGeometry's Y-scale
// step below is a no-op (kept, rather than special-cased away, so a
// shallower arc is a one-line change again if ever wanted back).
const DOME_SAGITTA = DOME_CHORD_R;
const ARCH_CHORD_R = DOME_CHORD_R + 0.02;
const ARCH_SAGITTA = ARCH_CHORD_R;
const ARCH_THICKNESS = 0.1;
// The edge rails still need to read as flush against the dome's own side —
// a visible gap would look wrong — but a *capped* rail sitting exactly at
// the dome's own X extent puts its cap exactly coplanar with the dome's,
// which is what z-fights (see lesson 31). This nudges the rail's outer cap
// proud of that plane by an amount too small to read as a gap (0.006 out
// of a 1.3-unit-wide chest) but large enough to give the two caps distinct
// depths.
const EDGE_RAIL_MARGIN = 0.006;
// A thin border tracing the base's side-face rectangle (bottom + front +
// back edges — the top edge is already the horizontal seam band below),
// so each side face reads as fully outlined, continuous with the dome's
// edge rail above it rather than stopping abruptly at the seam.
const SIDE_FRAME_THICKNESS = 0.045;
const SIDE_FRAME_PROUD = 0.012;
// Thin wire tracing the dome's own semicircular side-cap rim (as seen
// looking straight at the chest from the side), so the side outline is
// continuous from the base's straight edges up around the dome's curve —
// the wide arch/edge-rail bands wrap across the WIDTH and read well from
// front/angled views, but don't themselves trace this side-on silhouette.
// A genuine `TorusGeometry` tube, not a flat `RingGeometry` — a flat 2D
// ring has literally zero thickness along the chest's X axis, so from any
// viewing angle off its exact face-on normal it visually thins toward
// nothing (a real gap against the side-frame border's actual 3D boxes,
// which keep their thickness from every angle). A torus tube has real
// volume in every direction, so it reads as a consistent-width line
// regardless of viewing angle, closing that gap.
const RIM_TUBE_RADIUS = 0.022;
// The rim strip needs to actually OVERLAP the edge rail and the side-frame
// border, not just touch them — two pieces that are merely tangent (zero
// overlap) can still read as a gap depending on angle/lighting, even once
// both are "real" 3D volumes (lesson 32 fixed the flat-vs-volume mismatch;
// this fixes the remaining zero-margin seam). This is how far past each
// neighbor's own boundary the rim strip's edge is pushed.
const RIM_TUBE_OVERLAP = 0.02;
// How much extra the side-frame border's front/back bars reach past the
// seam (toward the rim strip), for the same reason.
const SIDE_FRAME_TOP_OVERLAP = 0.02;
// How far open the lid swings, in radians — a bit past 90° so it rests
// leant back rather than perfectly vertical.
const MAX_OPEN_ANGLE = Math.PI * 0.6;

/**
 * Barrel-top dome/arch geometry — every step of this transform chain was
 * verified against the actual installed three.js in a standalone Node
 * script before use (this environment can't render WebGL to check
 * visually, see CLAUDE.md dev-environment quirks). Building this directly
 * with a shallow `thetaLength` produces a broken shape: `CylinderGeometry`'s
 * end caps always include the central axis point, so a partial-angle slice
 * gets pie-slice-shaped caps that dip down to the axis center rather than a
 * flat chord — invisible in the full-semicircle case (where the axis
 * center happens to coincide with the chord) but very visible otherwise.
 * The fix: build the *proven-correct* full semicircle (chord = 2×radius,
 * flush at y=0, peak at y=radius, clean caps), then non-uniformly scale Y
 * down to the desired shallow peak height (`sagitta`) — this can never
 * distort X/Z or break the caps, since scale doesn't touch the flatness of
 * a cap, only how tall the dome reads. Finally `rotateY(90°)` swaps which
 * axis is the curve's chord and which is the flat-ended extrusion axis.
 *
 * `openEnded` defaults to false (real caps) for the main dome, since its
 * caps ARE the chest's visible flat side faces. The decorative arch bands
 * pass `true` — they're thin proud shells with no visible "inside" to cap,
 * and the two edge-rail bands sit flush against the main dome's own X
 * extent, so a capped edge rail would put its outer cap exactly coplanar
 * with the dome's own end cap there — classic z-fighting (the flickering
 * brown/black diagonal noise the user reported), not a lighting bug.
 */
function makeDomeGeometry(
  chordRadius: number,
  extrudeLength: number,
  sagitta: number,
  segments = 20,
  openEnded = false
) {
  const geo = new THREE.CylinderGeometry(
    chordRadius,
    chordRadius,
    extrudeLength,
    segments,
    1,
    openEnded,
    -Math.PI / 2,
    Math.PI
  );
  geo.rotateX(-Math.PI / 2);
  geo.scale(1, sagitta / chordRadius, 1);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/** A box rotated 45° in its own plane reads as a diamond — used for the escutcheon plate and the hasp below it. */
function Diamond({
  size,
  depth,
  position,
  color,
}: {
  size: number;
  depth: number;
  position: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} rotation={[0, 0, Math.PI / 4]}>
      <boxGeometry args={[size, size, depth]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
    </mesh>
  );
}

function Rivet({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.022, 8, 8]} />
      <meshStandardMaterial color={RIVET_COLOR} roughness={0.35} metalness={0.5} />
    </mesh>
  );
}

/**
 * A treasure chest standing where the fish used to — the entry point to the
 * vault, a small independent gallery of side projects that don't have their
 * own main-stage station. Its label/quick-nav/beacon-label entry behave
 * exactly like every other station (travel + open the normal side pane,
 * default `StationLabel` behavior, no override) — clicking the chest object
 * itself is the special interaction, the same "object click does something
 * extra, doesn't reopen the pane" pattern as the soccer ball or chess king.
 * The lid tracks `vaultPending || vaultOpen` directly (open while
 * pending/open, closed otherwise) rather than a separate local "did I
 * click" flag, so it stays consistent if the visitor scrolls away mid-open
 * and the pending state abandons itself.
 */
export default function VaultStation() {
  const anchor = useMemo(() => getStationAnchor(station), []);
  const requestScrollTo = useUIStore((s) => s.requestScrollTo);
  const setVaultPending = useUIStore((s) => s.setVaultPending);
  const setOpenPaneId = useUIStore((s) => s.setOpenPaneId);
  const vaultPending = useUIStore((s) => s.vaultPending);
  const vaultOpen = useUIStore((s) => s.vaultOpen);
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const [hovered, setHovered] = useState(false);

  const lidRef = useRef<THREE.Group>(null);
  const lidAngle = useRef(0);
  const glowRef = useRef<THREE.PointLight>(null);

  const shouldBeOpen = vaultPending || vaultOpen;

  const domeGeo = useMemo(() => makeDomeGeometry(DOME_CHORD_R, BASE_W, DOME_SAGITTA), []);
  // Middle bands: open-ended, nothing borders their ends so there's no cap to fight.
  const archGeo = useMemo(
    () => makeDomeGeometry(ARCH_CHORD_R, ARCH_THICKNESS, ARCH_SAGITTA, 20, true),
    []
  );
  // Edge rails: real caps (so they read as flush, not hollow, against the
  // chest's side) — the EDGE_RAIL_MARGIN offset in their position (below)
  // is what keeps those caps off the dome's own cap plane.
  const edgeRailGeo = useMemo(
    () => makeDomeGeometry(ARCH_CHORD_R, ARCH_THICKNESS, ARCH_SAGITTA, 20, false),
    []
  );
  // A half-`TorusGeometry` tube tracing the dome's own cap boundary — real
  // 3D volume, not a flat disc (see the constant comment above for why a
  // flat `RingGeometry` was tried first and produced a gap from off-angle
  // views). `TorusGeometry`'s default hole axis is Z (lesson 23); rotating
  // it 90° about Y swaps that to X, matching every other flat-sided piece
  // on this dome — verified via the same bounding-box-against-real-`three`
  // Node-script technique used throughout this file (lesson 27).
  const rimStripGeo = useMemo(() => {
    const geo = new THREE.TorusGeometry(DOME_CHORD_R, RIM_TUBE_RADIUS, 10, 28, Math.PI);
    geo.rotateY(Math.PI / 2);
    return geo;
  }, []);

  const baseMaterials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ color: WOOD_SIDE, roughness: 0.75, flatShading: true }), // +x right
      new THREE.MeshStandardMaterial({ color: WOOD_SIDE, roughness: 0.75, flatShading: true }), // -x left
      new THREE.MeshStandardMaterial({ color: WOOD_LIGHT, roughness: 0.75, flatShading: true }), // +y top
      new THREE.MeshStandardMaterial({ color: WOOD_SIDE, roughness: 0.75, flatShading: true }), // -y bottom
      new THREE.MeshStandardMaterial({ color: WOOD_LIGHT, roughness: 0.75, flatShading: true }), // +z front
      new THREE.MeshStandardMaterial({ color: WOOD_LIGHT, roughness: 0.75, flatShading: true }), // -z back
    ],
    []
  );
  // dome groups: [0]=curved lateral surface, [1]/[2]=the two flat end caps
  const domeMaterials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ color: WOOD_LIGHT, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: WOOD_SIDE, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: WOOD_SIDE, roughness: 0.7 }),
    ],
    []
  );
  // The edge rail's cap is unavoidably a full disc (CylinderGeometry always
  // fans its caps from the center), nearly as large as the dome's own side
  // — a single black material across the whole mesh painted almost the
  // entire visible side black instead of just a thin trim line. Only the
  // *lateral* surface (the actual visible "rail" wrapping the curve) should
  // be dark; the caps should match the dome's own side-wood tone so they
  // blend invisibly into the brown underneath rather than reading as a
  // black disc.
  const edgeRailMaterials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ color: TRIM_DARK, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: WOOD_SIDE, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: WOOD_SIDE, roughness: 0.7 }),
    ],
    []
  );

  useFrame((_, delta) => {
    const target = shouldBeOpen ? MAX_OPEN_ANGLE : 0;
    const speed = reducedMotion ? 8 : 4.5;
    lidAngle.current = THREE.MathUtils.damp(lidAngle.current, target, speed, delta);
    // Hinge now sits at the FRONT edge (see the pivot group below) — a
    // positive rotation here lifts the BACK edge up and swings it forward
    // over the hinge, the mirror image of the original back-hinge motion.
    if (lidRef.current) lidRef.current.rotation.x = lidAngle.current;
    if (glowRef.current) {
      glowRef.current.intensity = (lidAngle.current / MAX_OPEN_ANGLE) * 1.4;
    }
  });

  const openVault = () => {
    requestScrollTo?.(station.t);
    setVaultPending(true);
    setOpenPaneId(null);
  };

  const halfW = BASE_W / 2;
  const halfD = BASE_D / 2;
  // Arch bands spread across the WIDTH (matching the reference image),
  // since the dome's flat ends face the sides and its curve arcs
  // front-to-back — the bands wrap over that curve at different X offsets.
  const archXs = [-BASE_W * 0.28, 0, BASE_W * 0.28];
  // Edge rails: flush against the dome's own left/right edges, framing
  // where the curved lid meets the flat end caps — nudged out by
  // EDGE_RAIL_MARGIN so their own end caps aren't exactly coplanar with
  // the dome's (see lesson 31).
  const edgeRailX = halfW - ARCH_THICKNESS / 2 + EDGE_RAIL_MARGIN;
  // The edge rail's true outer face — the rim strip's inner edge needs to
  // sit *past* this (toward the center), not just meet it, so the two
  // solid volumes actually overlap rather than merely touch.
  const edgeRailOuterX = edgeRailX + ARCH_THICKNESS / 2;
  const rimTubeCenterOffset = edgeRailOuterX - RIM_TUBE_OVERLAP + RIM_TUBE_RADIUS;

  return (
    <group>
      <StationPad center={anchor} radius={2.15} />
      <group
        position={[anchor.x, anchor.y, anchor.z]}
        onClick={(e) => {
          e.stopPropagation();
          openVault();
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? 1.03 : 1}
      >
        {/* base */}
        <mesh position={[0, BASE_H / 2, 0]} material={baseMaterials} castShadow>
          <boxGeometry args={[BASE_W, BASE_H, BASE_D]} />
        </mesh>

        {/* corner reinforcement bands */}
        {[
          [-halfW * 0.97, halfD * 0.97],
          [halfW * 0.97, halfD * 0.97],
          [-halfW * 0.97, -halfD * 0.97],
          [halfW * 0.97, -halfD * 0.97],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, BASE_H / 2, z]}>
            <boxGeometry args={[0.05, BASE_H * 0.98, 0.05]} />
            <meshStandardMaterial color={TRIM_DARK} roughness={0.6} />
          </mesh>
        ))}

        {/* little feet at the base corners */}
        {[
          [-halfW * 0.85, halfD * 0.85],
          [halfW * 0.85, halfD * 0.85],
          [-halfW * 0.85, -halfD * 0.85],
          [halfW * 0.85, -halfD * 0.85],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, -0.03, z]}>
            <boxGeometry args={[0.12, 0.06, 0.12]} />
            <meshStandardMaterial color={TRIM_DARK} roughness={0.6} />
          </mesh>
        ))}

        {/* horizontal seam band, attached to the base so it doesn't move with the lid */}
        <mesh position={[0, BASE_H - 0.03, 0]}>
          <boxGeometry args={[BASE_W * 1.01, 0.09, BASE_D * 1.01]} />
          <meshStandardMaterial color={TRIM_DARK} roughness={0.6} />
        </mesh>
        {Array.from({ length: 5 }).map((_, i) => (
          <Rivet key={i} position={[(-2 + i) * (halfW * 0.42), BASE_H - 0.03, -halfD * 1.005]} />
        ))}

        {/* escutcheon + hasp on the back face (opposite the hinge, swapped from the front) */}
        <Diamond size={0.22} depth={0.03} position={[0, BASE_H, -halfD - 0.02]} color={TRIM_DARK} />
        <mesh position={[0, BASE_H, -halfD - 0.045]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial color={RIVET_COLOR} roughness={0.4} metalness={0.5} />
        </mesh>
        <Diamond size={0.13} depth={0.025} position={[0, BASE_H - 0.17, -halfD - 0.015]} color={TRIM_DARK} />

        {/* side handles */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (halfW + 0.01), BASE_H * 0.55, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.12, 0.022, 8, 16, Math.PI * 1.4]} />
            <meshStandardMaterial color={TRIM_DARK} roughness={0.5} metalness={0.3} />
          </mesh>
        ))}

        {/* side-face border — bottom + front + back edges (the top edge is
            already the horizontal seam band above), closing the outline
            around each side face so it reads as continuous with the dome's
            edge rail rather than stopping at the seam */}
        {[-1, 1].map((side) => {
          const x = side * (halfW + SIDE_FRAME_PROUD / 2);
          return (
            <group key={side}>
              <mesh position={[x, 0, 0]}>
                <boxGeometry args={[SIDE_FRAME_PROUD, SIDE_FRAME_THICKNESS, BASE_D + SIDE_FRAME_THICKNESS]} />
                <meshStandardMaterial color={TRIM_DARK} roughness={0.6} />
              </mesh>
              {/* front/back edges — extended past the seam (toward the
                  rim strip above) by SIDE_FRAME_TOP_OVERLAP so the two
                  volumes overlap rather than just touch; bottom end is
                  unaffected, still flush with the ground */}
              <mesh position={[x, BASE_H / 2 + SIDE_FRAME_TOP_OVERLAP / 2, halfD]}>
                <boxGeometry
                  args={[SIDE_FRAME_PROUD, BASE_H + SIDE_FRAME_THICKNESS + SIDE_FRAME_TOP_OVERLAP, SIDE_FRAME_THICKNESS]}
                />
                <meshStandardMaterial color={TRIM_DARK} roughness={0.6} />
              </mesh>
              <mesh position={[x, BASE_H / 2 + SIDE_FRAME_TOP_OVERLAP / 2, -halfD]}>
                <boxGeometry
                  args={[SIDE_FRAME_PROUD, BASE_H + SIDE_FRAME_THICKNESS + SIDE_FRAME_TOP_OVERLAP, SIDE_FRAME_THICKNESS]}
                />
                <meshStandardMaterial color={TRIM_DARK} roughness={0.6} />
              </mesh>
            </group>
          );
        })}

        {/* warm glow from inside, fades in as the lid opens */}
        <pointLight ref={glowRef} color={ACCENT} intensity={0} distance={3} position={[0, BASE_H + 0.15, 0]} />

        {/* lid — pivots around the FRONT-top edge (opens toward the front, opposite the original back hinge) */}
        <group ref={lidRef} position={[0, BASE_H, halfD]}>
          <mesh geometry={domeGeo} material={domeMaterials} position={[0, 0, -halfD]} castShadow />
          {archXs.map((x, i) => (
            <mesh key={i} geometry={archGeo} position={[x, 0, -halfD]}>
              <meshStandardMaterial color={TRIM_DARK} roughness={0.6} />
            </mesh>
          ))}
          {[-edgeRailX, edgeRailX].map((x, i) => (
            <mesh key={i} geometry={edgeRailGeo} material={edgeRailMaterials} position={[x, 0, -halfD]} />
          ))}
          {[-1, 1].map((side) => (
            <mesh key={side} geometry={rimStripGeo} position={[side * rimTubeCenterOffset, 0, -halfD]}>
              <meshStandardMaterial color={TRIM_DARK} roughness={0.6} />
            </mesh>
          ))}
        </group>
      </group>
      <StationLabel
        stationId="vault"
        stationT={station.t}
        title="🗝 Vault"
        accent={ACCENT}
        position={[anchor.x, anchor.y + 2.1, anchor.z]}
      />
    </group>
  );
}
