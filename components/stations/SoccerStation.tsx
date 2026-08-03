"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { RigidBody, CuboidCollider, BallCollider, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { getStationAnchor, STATION_ORDER, PATH_CURVE } from "@/components/world/path";
import { getStationContent } from "./stations.data";
import StationPad from "./StationPad";
import StationLabel from "./StationLabel";
import { useUIStore } from "@/lib/store";
import { makeSoccerBallTexture, makeNetTexture, makeSpherifiedBoxGeometry } from "./textures";

const BALL_RADIUS = 0.35;

const station = STATION_ORDER.find((s) => s.id === "soccer")!;
const content = getStationContent("soccer")!;
const PAD_TOP = 0.09;
const WALL_RADIUS = 4.4;

export default function SoccerStation() {
  const physicsEnabled = useUIStore((s) => s.physicsEnabled);
  const anchor = useMemo(() => getStationAnchor(station), []);
  const forward = useMemo(() => PATH_CURVE.getTangentAt(station.t).setY(0).normalize(), []);
  const goalCenter = useMemo(
    () => anchor.clone().addScaledVector(forward, 2.2).add(new THREE.Vector3(0, PAD_TOP, 0)),
    [anchor, forward]
  );

  return (
    <group>
      <StationPad center={anchor} radius={3.5} />
      {physicsEnabled ? (
        <>
          <RigidBody type="fixed" colliders={false} position={anchor.toArray()}>
            <CuboidCollider args={[4.9, 0.25, 4.9]} position={[0, PAD_TOP - 0.25, 0]} />
          </RigidBody>
          <PitchWalls anchor={anchor} />
          <Goal center={goalCenter} forward={forward} accent={content.accent} withPhysics />
          <SoccerBall anchor={anchor} forward={forward} />
        </>
      ) : (
        <>
          <Goal center={goalCenter} forward={forward} accent={content.accent} withPhysics={false} />
          <ProceduralBall anchor={anchor} forward={forward} />
        </>
      )}
      <StationLabel
        stationId="soccer"
        stationT={station.t}
        title={`${content.emoji} ${content.title}`}
        accent={content.accent}
        position={[anchor.x, anchor.y + 2.6, anchor.z]}
      />
    </group>
  );
}

/** Invisible ring of low walls so the ball bounces back onto the pitch
 *  instead of rolling off into the void — one shared fixed RigidBody with
 *  several collider children (not one RigidBody per wall segment, which was
 *  needlessly heavy to create every time this station mounts). */
function PitchWalls({ anchor }: { anchor: THREE.Vector3 }) {
  // 24 segments (not 8), overlapping generously, with thicker colliders —
  // a fast ball hitting the seam between two flat wall segments is exactly
  // where CCD's time-of-impact solver is least reliable; more, denser,
  // thicker segments close that gap. See the matching comment on the
  // chess board's walls.
  const segments = 24;
  return (
    <RigidBody type="fixed" colliders={false} position={anchor.toArray()} restitution={0.5}>
      {Array.from({ length: segments }).map((_, i) => {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * WALL_RADIUS;
        const z = Math.sin(angle) * WALL_RADIUS;
        const halfWidth = (Math.PI * WALL_RADIUS) / segments + 0.2;
        return (
          <CuboidCollider
            key={i}
            args={[halfWidth, 1.4, 0.35]}
            position={[x, 1.3, z]}
            rotation={[0, -angle, 0]}
          />
        );
      })}
      {/* invisible ceiling — belt-and-suspenders alongside the mass fix
          below so a hard/high kick can never clear the walls and sail out
          over the mountainside, which has no physics collider of its own
          to stop it. */}
      <CuboidCollider args={[WALL_RADIUS, 0.15, WALL_RADIUS]} position={[0, 2.7, 0]} />
    </RigidBody>
  );
}

/** Build a quaternion that maps local +X/+Y to the given world axes directly
 *  (via an explicit orthonormal basis matrix), instead of composing Euler
 *  angles — Euler composition is order-dependent and a rotation applied
 *  after an axis has already been tilted rotates around that axis's own
 *  tilted orientation, not world-vertical, which is what silently broke the
 *  top net's alignment with the crossbar before. */
function basisQuaternion(xAxis: THREE.Vector3, yAxis: THREE.Vector3): THREE.Quaternion {
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function GoalMeshes({ center, forward }: { center: THREE.Vector3; forward: THREE.Vector3 }) {
  const netTexture = useMemo(() => makeNetTexture(), []);
  const UP = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const { postL, postR, bar, back, right } = useMemo(() => {
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    return {
      right,
      postL: center.clone().addScaledVector(right, -1.1).add(new THREE.Vector3(0, 0.65, 0)),
      postR: center.clone().addScaledVector(right, 1.1).add(new THREE.Vector3(0, 0.65, 0)),
      bar: center.clone().add(new THREE.Vector3(0, 1.3, 0)),
      back: center.clone().addScaledVector(forward, 0.9).add(new THREE.Vector3(0, 0.65, 0)),
    };
  }, [center, forward]);

  // Crossbar: align the cylinder's own length axis (local +Y) directly to
  // the world "right" vector, rather than composing rotations — guarantees
  // it lies exactly between the posts regardless of yaw.
  const barQuat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, right), [right, UP]);

  // back net: local X -> right, local Y -> up (a plain vertical panel facing forward)
  const backQuat = useMemo(() => basisQuaternion(right, UP), [right, UP]);
  // side nets: local X -> forward, local Y -> up (vertical panel running front-to-back)
  const sideQuat = useMemo(() => basisQuaternion(forward, UP), [forward, UP]);
  // top net: local X -> right, local Y -> forward (horizontal panel, flush with the crossbar)
  const topQuat = useMemo(() => basisQuaternion(right, forward), [right, forward]);

  const netMat = (
    <meshStandardMaterial
      map={netTexture}
      transparent
      alphaTest={0.3}
      side={THREE.DoubleSide}
      color="#f4f7fb"
      roughness={0.9}
    />
  );

  return (
    <>
      <mesh position={postL.toArray()}>
        <cylinderGeometry args={[0.06, 0.06, 1.3, 8]} />
        <meshStandardMaterial color="#f4f7fb" roughness={0.35} />
      </mesh>
      <mesh position={postR.toArray()}>
        <cylinderGeometry args={[0.06, 0.06, 1.3, 8]} />
        <meshStandardMaterial color="#f4f7fb" roughness={0.35} />
      </mesh>
      <mesh position={bar.toArray()} quaternion={barQuat}>
        <cylinderGeometry args={[0.06, 0.06, 2.32, 8]} />
        <meshStandardMaterial color="#f4f7fb" roughness={0.35} />
      </mesh>
      {/* back net */}
      <mesh position={back.toArray()} quaternion={backQuat}>
        <planeGeometry args={[2.2, 1.3]} />
        {netMat}
      </mesh>
      {/* side nets — flat panels running from each post straight back */}
      <mesh
        position={postL.clone().addScaledVector(forward, 0.45).toArray()}
        quaternion={sideQuat}
      >
        <planeGeometry args={[1.0, 1.3]} />
        {netMat}
      </mesh>
      <mesh
        position={postR.clone().addScaledVector(forward, 0.45).toArray()}
        quaternion={sideQuat}
      >
        <planeGeometry args={[1.0, 1.3]} />
        {netMat}
      </mesh>
      {/* top net — flush with the crossbar, lying flat back to the top of the back net */}
      <mesh
        position={bar.clone().addScaledVector(forward, 0.45).toArray()}
        quaternion={topQuat}
      >
        <planeGeometry args={[2.2, 0.9]} />
        {netMat}
      </mesh>
    </>
  );
}

function Goal({
  center,
  forward,
  accent,
  withPhysics,
}: {
  center: THREE.Vector3;
  forward: THREE.Vector3;
  accent: string;
  withPhysics: boolean;
}) {
  const meshes = <GoalMeshes center={center} forward={forward} />;
  return (
    <>
      {withPhysics ? (
        <RigidBody type="fixed" colliders="cuboid">
          {meshes}
        </RigidBody>
      ) : (
        meshes
      )}
      <pointLight
        position={[center.x, center.y + 1, center.z]}
        color={accent}
        intensity={1.2}
        distance={5}
      />
    </>
  );
}

// A fast enough object can cross a thin collider's whole thickness within a
// single physics step and tunnel straight through it undetected — repeated
// clicks stack impulses onto the ball's *existing* velocity with no cap, so
// a burst of clicks can build up exactly that kind of speed. Clamping speed
// every frame means it's structurally impossible to reach tunneling
// velocity, on top of `ccd` below (belt-and-suspenders, not either/or).
const MAX_LINEAR_SPEED = 6;

/** Reset the ball the instant it strays past the walls/ceiling, rather than
 *  letting it travel arbitrarily far first — the walls+ceiling should make
 *  this unreachable in normal play, but this is the last-resort guarantee
 *  that it can never end up visibly off the pad, clipped into the
 *  mountainside, or over the cliff edge. Previously buffered by +3 units,
 *  which let an escaped ball travel well into the terrain before resetting. */
function useRespawnWatchdog(
  bodyRef: React.RefObject<RapierRigidBody>,
  anchor: THREE.Vector3,
  startPos: THREE.Vector3
) {
  useFrame(() => {
    const body = bodyRef.current;
    if (!body) return;
    const lv = body.linvel();
    const speed = Math.hypot(lv.x, lv.y, lv.z);
    if (speed > MAX_LINEAR_SPEED) {
      const s = MAX_LINEAR_SPEED / speed;
      body.setLinvel({ x: lv.x * s, y: lv.y * s, z: lv.z * s }, true);
    }
    const t = body.translation();
    const dist = Math.hypot(t.x - anchor.x, t.z - anchor.z);
    if (t.y < anchor.y - 1 || t.y > anchor.y + 3.2 || dist > WALL_RADIUS + 0.6) {
      body.setTranslation(startPos, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  });
}

function SoccerBall({ anchor, forward }: { anchor: THREE.Vector3; forward: THREE.Vector3 }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const startPos = useMemo(
    () => anchor.clone().add(new THREE.Vector3(0, PAD_TOP + 0.5, 0)),
    [anchor]
  );
  const [hovered, setHovered] = useState(false);
  const ballTexture = useMemo(() => makeSoccerBallTexture(), []);
  const ballGeo = useMemo(() => makeSpherifiedBoxGeometry(BALL_RADIUS, 10), []);

  useRespawnWatchdog(bodyRef, anchor, startPos);

  const kick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const body = bodyRef.current;
    if (!body) return;
    const localX = e.uv ? e.uv.x - 0.5 : 0;
    const localY = e.uv ? e.uv.y - 0.5 : 0;
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const impulse = forward
      .clone()
      .multiplyScalar(3.6)
      .addScaledVector(right, localX * 2.2)
      .add(new THREE.Vector3(0, 1.4 + Math.max(localY, 0) * 1.8, 0));
    // wake explicitly — the ball is re-kickable indefinitely, not just once
    body.wakeUp();
    body.applyImpulse(impulse, true);
    body.applyTorqueImpulse(
      { x: (Math.random() - 0.5) * 0.5, y: 0, z: (Math.random() - 0.5) * 0.5 },
      true
    );
  };

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      restitution={0.55}
      friction={0.7}
      position={startPos.toArray()}
      angularDamping={0.4}
      linearDamping={0.15}
      canSleep={false}
      // Explicit mass: at Rapier's default density (1) a 0.35-radius ball
      // collider has a mass of ~0.18, so the kick impulses below (tuned
      // assuming a roughly 1-unit-mass ball) were producing velocity
      // changes several times larger than intended — that's what sent the
      // ball clearing the walls and flying off into the mountainside.
      mass={1}
      // Continuous collision detection: without it, Rapier only checks for
      // collisions at each step's start/end position, so a fast-moving ball
      // can be on one side of a thin wall collider one frame and past it
      // the next, never registering contact.
      ccd
    >
      {/* Explicit BallCollider, decoupled from the visual mesh — the mesh
          below is a spherified cube (see makeSpherifiedBoxGeometry), not a
          literal THREE.SphereGeometry, so auto-inferred colliders shouldn't
          be relied on to guess a clean sphere shape from it. */}
      <BallCollider args={[BALL_RADIUS]} />
      <mesh
        castShadow
        geometry={ballGeo}
        onPointerDown={kick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? 1.06 : 1}
      >
        <meshStandardMaterial map={ballTexture} roughness={0.45} metalness={0.05} />
      </mesh>
    </RigidBody>
  );
}

function ProceduralBall({ anchor, forward }: { anchor: THREE.Vector3; forward: THREE.Vector3 }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const anim = useRef<{ t: number; from: THREE.Vector3; to: THREE.Vector3 } | null>(null);
  const restPos = useMemo(
    () => anchor.clone().add(new THREE.Vector3(0, PAD_TOP + 0.35, 0)),
    [anchor]
  );
  const ballTexture = useMemo(() => makeSoccerBallTexture(), []);
  const ballGeo = useMemo(() => makeSpherifiedBoxGeometry(BALL_RADIUS, 8), []);

  const kick = () => {
    const to = restPos.clone().addScaledVector(forward, 2.4 + Math.random());
    anim.current = { t: 0, from: meshRef.current!.position.clone(), to };
  };

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    if (anim.current) {
      anim.current.t += delta * 1.4;
      const p = Math.min(anim.current.t, 1);
      const hop = Math.sin(p * Math.PI) * 0.6;
      meshRef.current.position.lerpVectors(anim.current.from, anim.current.to, p);
      meshRef.current.position.y = restPos.y + hop;
      meshRef.current.rotation.x += delta * 6;
      if (p >= 1) {
        anim.current = null;
        meshRef.current.position.copy(restPos);
      }
    }
  });

  return (
    <mesh ref={meshRef} geometry={ballGeo} position={restPos.toArray()} onPointerDown={kick}>
      <meshStandardMaterial map={ballTexture} roughness={0.45} />
    </mesh>
  );
}
