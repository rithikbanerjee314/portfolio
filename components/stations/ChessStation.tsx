"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, CuboidCollider, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { getStationAnchor, STATION_ORDER } from "@/components/world/path";
import { getStationContent } from "./stations.data";
import StationPad from "./StationPad";
import StationLabel from "./StationLabel";
import { useUIStore } from "@/lib/store";
import { useObjectDrag } from "@/lib/useObjectDrag";

const station = STATION_ORDER.find((s) => s.id === "chess")!;
const content = getStationContent("chess")!;
const WALL_RADIUS = 2.4;
const MAX_LINEAR_SPEED = 4.5;
/** Reused by the drag interpolation below instead of allocating per frame. */
const dragScratch = new THREE.Vector3();

/** A tall, unmistakably king-shaped silhouette: revolve a 2D profile around Y. */
function kingLatheGeometry(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.26, 0.0),
    new THREE.Vector2(0.26, 0.04),
    new THREE.Vector2(0.2, 0.07),
    new THREE.Vector2(0.16, 0.16),
    new THREE.Vector2(0.13, 0.22),
    new THREE.Vector2(0.14, 0.28),
    new THREE.Vector2(0.1, 0.34), // waist
    new THREE.Vector2(0.11, 0.58),
    new THREE.Vector2(0.15, 0.64), // collar
    new THREE.Vector2(0.2, 0.68),
    new THREE.Vector2(0.13, 0.74), // neck taper
    new THREE.Vector2(0.1, 0.78),
    new THREE.Vector2(0.16, 0.84), // head ball
    new THREE.Vector2(0.17, 0.9),
    new THREE.Vector2(0.1, 0.95),
    new THREE.Vector2(0.06, 0.97),
    new THREE.Vector2(0.0, 0.98),
  ];
  // 12 radial segments (was 20) — still reads as round on a piece this
  // small, and meaningfully lightens the convex-hull collider Rapier has
  // to compute from it every time this station mounts.
  return new THREE.LatheGeometry(pts, 12);
}

function KingMesh({ color = "#e8dcc0" }: { color?: string }) {
  const bodyGeo = useMemo(() => kingLatheGeometry(), []);
  return (
    <group scale={1.05}>
      <mesh geometry={bodyGeo} castShadow>
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.08} />
      </mesh>
      {/* cross finial on top — vertical bar's bottom stays anchored where it
          meets the head (y=0.96); the extra height goes entirely above the
          crossbar (y=1.06) so the top arm reads clearly as a plus sign
          instead of a short stub barely poking above the crossbar. */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[0.05, 0.18, 0.05]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
      <mesh position={[0, 1.06, 0]} castShadow>
        <boxGeometry args={[0.13, 0.05, 0.05]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Board({ anchor }: { anchor: THREE.Vector3 }) {
  const tiles = useMemo(() => {
    const out: { pos: [number, number, number]; dark: boolean }[] = [];
    for (let x = 0; x < 4; x++) {
      for (let z = 0; z < 4; z++) {
        out.push({ pos: [x * 0.3 - 0.45, 0, z * 0.3 - 0.45], dark: (x + z) % 2 === 0 });
      }
    }
    return out;
  }, []);

  return (
    <group position={[anchor.x, anchor.y + 0.1, anchor.z]}>
      {tiles.map((t, i) => (
        <mesh key={i} position={t.pos} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.3, 0.3]} />
          <meshStandardMaterial color={t.dark ? "#0e1c33" : "#d9cba8"} roughness={0.8} />
        </mesh>
      ))}
      {/* decorative static pieces, scaled down to read as pawns beside the king */}
      <group position={[-0.6, 0, -0.6]} scale={0.35}>
        <KingMesh color="#b8a878" />
      </group>
      <group position={[0.6, 0, 0.6]} scale={0.35}>
        <KingMesh color="#b8a878" />
      </group>
    </group>
  );
}

/** Invisible ring of low walls so a thrown king bounces back onto the board —
 *  one shared fixed RigidBody with several collider children, same reasoning
 *  as the soccer pitch's walls. 24 segments (not 8) so adjacent segments
 *  overlap generously with almost no seam — the king's collider is an
 *  auto-generated convex hull from a Lathe profile with thin extremities
 *  (the cross finial, the neck), and CCD's time-of-impact solver is least
 *  reliable exactly at a seam between two flat wall segments meeting at an
 *  angle, which is where a fast, non-primitive-shaped body is most likely
 *  to find a gap and tunnel through. Thickness bumped from 0.12 to 0.35 for
 *  the same reason — more margin, no thin wall to slip past. */
function BoardWalls({ anchor }: { anchor: THREE.Vector3 }) {
  const segments = 24;
  return (
    <RigidBody type="fixed" colliders={false} position={anchor.toArray()} restitution={0.5}>
      {Array.from({ length: segments }).map((_, i) => {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * WALL_RADIUS;
        const z = Math.sin(angle) * WALL_RADIUS;
        const halfWidth = (Math.PI * WALL_RADIUS) / segments + 0.15;
        return (
          <CuboidCollider
            key={i}
            args={[halfWidth, 1.2, 0.35]}
            position={[x, 1.1, z]}
            rotation={[0, -angle, 0]}
          />
        );
      })}
      {/* invisible ceiling — with the velocity clamp on throws below, a
          thrown king should never clear this, but it's the physical
          backstop against ending up clipped into the mountainside. */}
      <CuboidCollider args={[WALL_RADIUS, 0.15, WALL_RADIUS]} position={[0, 2.3, 0]} />
    </RigidBody>
  );
}

// Reset the instant the king strays past the walls/ceiling — see the
// matching comment on the soccer ball's watchdog for why the old +3-unit
// buffer let it travel well off the pad before resetting.
function useRespawnWatchdog(
  bodyRef: React.RefObject<RapierRigidBody>,
  anchor: THREE.Vector3,
  startPos: THREE.Vector3,
  dragging: boolean
) {
  useFrame(() => {
    if (dragging) return;
    const body = bodyRef.current;
    if (!body) return;
    // Same reasoning as the soccer ball's watchdog: cap speed every frame
    // so nothing can build up enough velocity to tunnel through a thin
    // wall collider in a single physics step.
    const lv = body.linvel();
    const speed = Math.hypot(lv.x, lv.y, lv.z);
    if (speed > MAX_LINEAR_SPEED) {
      const s = MAX_LINEAR_SPEED / speed;
      body.setLinvel({ x: lv.x * s, y: lv.y * s, z: lv.z * s }, true);
    }
    const t = body.translation();
    const dist = Math.hypot(t.x - anchor.x, t.z - anchor.z);
    if (t.y < anchor.y - 1 || t.y > anchor.y + 2.8 || dist > WALL_RADIUS + 0.5) {
      body.setTranslation(startPos, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    }
  });
}

// Dragging is unconstrained kinematic motion (no gravity/collision while
// held — kinematic bodies in Rapier are never stopped by fixed colliders,
// so the walls/ceiling only ever contain the piece once it's thrown, not
// while it's being dragged). This clamp radius is the ONLY thing containing
// it during a drag, so it must be applied to every position the target can
// ever hold, including the very first frame before any pointer-move event.
const DRAG_RADIUS = WALL_RADIUS - 0.35;

function clampToPad(x: number, z: number, anchor: THREE.Vector3): [number, number] {
  const dx = x - anchor.x;
  const dz = z - anchor.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= DRAG_RADIUS || dist === 0) return [x, z];
  const scale = DRAG_RADIUS / dist;
  return [anchor.x + dx * scale, anchor.z + dz * scale];
}

// A plain tap (down+up with negligible movement in between) shouldn't launch
// the piece at all — it used to go through the same
// velocity-from-cursor-motion throw path as a real drag, and even a single
// stray frame's worth of "motion" could read as a throw. Below this distance,
// treat it as a tap and leave the piece resting in place. Measured in CSS
// pixels of actual pointer movement, not world-space distance: the same
// physical finger/mouse movement covers a DIFFERENT world-space distance
// depending on camera FOV/zoom/distance, so a world-space threshold means
// something different on every device — which is how ordinary mobile finger
// jitter during an intended tap started registering as a throw.
const CLICK_DISTANCE_PX = 6;
const MAX_THROW_SPEED = 4;

function DraggableKing({ anchor }: { anchor: THREE.Vector3 }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const [dragging, setDragging] = useState(false);
  const target = useRef(new THREE.Vector3());
  const lastPos = useRef(new THREE.Vector3());
  const velocity = useRef(new THREE.Vector3());
  const dragPlaneY = useRef(0);
  const startPos = useMemo(() => anchor.clone().add(new THREE.Vector3(0, 0.12, 0)), [anchor]);
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const dragPlane = useMemo(() => new THREE.Plane(), []);
  const draggingRef = useRef(false);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);

  useRespawnWatchdog(bodyRef, anchor, startPos, dragging);

  // The pointer plumbing (capture, touch-scroll suppression, single-pointer
  // ownership, guaranteed cleanup on pointercancel/pinch/unmount) all lives
  // in useObjectDrag — see that file and lib/dragState.ts. What's left here is
  // only the chess-specific part: where the piece should go and what happens
  // when it's let go.
  //
  // The raycast below deliberately does NOT rely on the ray meeting the drag
  // plane. The camera sits above the plane and looks generally downward, so a
  // ray aimed at the upper portion of the screen is level-or-upward and
  // mathematically never crosses it — intersectPlane correctly returns null
  // there regardless of how large the plane is, which froze the piece across
  // the whole upper half of the screen. Extrapolating a fixed distance along
  // the ray instead (an earlier fix) had its own failure: as the ray nears
  // vertical its horizontal component collapses toward zero and then flips
  // sign, snapping the piece to the opposite edge of the pad. So when there's
  // no intersection, keep only the part of the input that's still well
  // defined — WHICH WAY the visitor is pointing, horizontally — and push the
  // target out to the pad edge along it from the pad's own centre. That's
  // stable at any camera angle and degrades continuously back into the real
  // intersection case as the ray tips down.
  const { start: onDown } = useObjectDrag({
    onStart: () => {
      const body = bodyRef.current;
      if (!body) return;
      body.wakeUp();
      const t = body.translation();
      dragPlaneY.current = t.y + 0.4;
      lastPos.current.set(t.x, t.y, t.z);
      velocity.current.set(0, 0, 0);
      // Seed the lerp target at the piece's own current position — left at a
      // stale value (world origin on the very first drag) it would lerp the
      // kinematic body 40%/frame toward that point on a tap that never moves,
      // reading as a teleport.
      target.current.set(t.x, dragPlaneY.current, t.z);
      dragPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(anchor.x, dragPlaneY.current, anchor.z)
      );
      draggingRef.current = true;
      setDragging(true);
    },
    onMove: (e) => {
      if (!draggingRef.current) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      let px: number;
      let pz: number;
      if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
        px = hitPoint.x;
        pz = hitPoint.z;
      } else {
        const dirX = raycaster.ray.direction.x;
        const dirZ = raycaster.ray.direction.z;
        const horizLen = Math.hypot(dirX, dirZ);
        // Pointing effectively straight up: no horizontal information at
        // all, so hold the last target rather than inventing a direction.
        if (horizLen < 1e-4) return;
        px = anchor.x + (dirX / horizLen) * DRAG_RADIUS;
        pz = anchor.z + (dirZ / horizLen) * DRAG_RADIUS;
      }
      const [x, z] = clampToPad(px, pz, anchor);
      target.current.set(x, dragPlaneY.current, z);
    },
    onEnd: ({ cancelled, movedPx }) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      const body = bodyRef.current;
      if (!body) return;
      // A cancelled gesture is not a throw the visitor chose to make — the
      // browser took the pointer away mid-drag (second finger, tab switch).
      // Dropping it in place is the only non-surprising outcome.
      if (cancelled || movedPx < CLICK_DISTANCE_PX) {
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        return;
      }
      const v = velocity.current.clone();
      if (v.length() > MAX_THROW_SPEED) v.setLength(MAX_THROW_SPEED);
      body.setLinvel({ x: v.x, y: THREE.MathUtils.clamp(v.y, 1, MAX_THROW_SPEED), z: v.z }, true);
    },
  });

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body || !dragging) return;
    const current = body.translation();
    // Scratch vector — this runs every frame for the duration of a drag.
    const next = dragScratch.set(current.x, current.y, current.z).lerp(target.current, 0.4);
    // Redundant clamp on the interpolated position itself, independent of
    // target's own clamp — belt-and-suspenders, since this is the only
    // thing standing between the piece and the mountainside while dragging.
    const [cx, cz] = clampToPad(next.x, next.z, anchor);
    next.x = cx;
    next.z = cz;
    velocity.current.subVectors(next, lastPos.current).divideScalar(Math.max(delta, 0.001));
    lastPos.current.copy(next);
    body.setNextKinematicTranslation(next);
  });

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type={dragging ? "kinematicPosition" : "dynamic"}
        colliders="hull"
        position={startPos.toArray()}
        // Real bounce off the walls, not a dead stop — previously 0, which
        // combined with any residual tunneling read as "disappears into the
        // mountain" rather than an obvious, visible wall hit.
        restitution={0.5}
        friction={0.8}
        angularDamping={0.6}
        linearDamping={0.2}
        canSleep={false}
        // Locked to yaw-only rotation: a tall, narrow piece landing on a
        // hull collider approximated from a 12-segment lathe profile could
        // catch an edge on the small initial drop and tip over before the
        // visitor ever saw it standing. Pitch/roll lock guarantees it's
        // always upright at rest, while still letting it spin and slide
        // when thrown.
        enabledRotations={[false, true, false]}
        // See the soccer ball's matching comment: without this, a fast
        // throw can cross a thin wall collider's whole thickness within a
        // single physics step and tunnel through it undetected.
        ccd
      >
        <group onPointerDown={onDown}>
          <KingMesh />
        </group>
      </RigidBody>
    </>
  );
}

function ProceduralKing({ anchor }: { anchor: THREE.Vector3 }) {
  const groupRef = useRef<THREE.Group>(null);
  const anim = useRef(0);
  const startPos = useMemo(() => anchor.clone().add(new THREE.Vector3(0, 0, 0)), [anchor]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (anim.current > 0) {
      anim.current = Math.max(0, anim.current - delta * 1.5);
      groupRef.current.position.y = startPos.y + Math.sin(anim.current * Math.PI) * 0.5;
      groupRef.current.rotation.y += delta * 4;
    } else {
      groupRef.current.rotation.y = 0;
      groupRef.current.position.y = startPos.y;
    }
  });

  return (
    <group
      ref={groupRef}
      position={startPos.toArray()}
      onPointerDown={() => {
        anim.current = 1;
      }}
    >
      <KingMesh />
    </group>
  );
}

export default function ChessStation() {
  const physicsEnabled = useUIStore((s) => s.physicsEnabled);
  const anchor = useMemo(() => getStationAnchor(station), []);

  return (
    <group>
      <StationPad center={anchor} radius={2.0} />
      <Board anchor={anchor} />
      {physicsEnabled ? (
        <>
          <RigidBody type="fixed" colliders={false} position={anchor.toArray()}>
            <CuboidCollider args={[2.0, 0.05, 2.0]} position={[0, 0.05, 0]} />
          </RigidBody>
          <BoardWalls anchor={anchor} />
          <DraggableKing anchor={anchor} />
        </>
      ) : (
        <ProceduralKing anchor={anchor} />
      )}
      <StationLabel
        stationId="chess"
        stationT={station.t}
        title={`${content.emoji} ${content.title}`}
        accent={content.accent}
        position={[anchor.x, anchor.y + 2.3, anchor.z]}
      />
    </group>
  );
}
