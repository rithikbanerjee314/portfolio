"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { getStationAnchor, STATION_ORDER } from "@/components/world/path";
import { getStationContent } from "./stations.data";
import StationPad from "./StationPad";
import StationLabel from "./StationLabel";
import { useUIStore } from "@/lib/store";
import { ACCENT_ICE, SKY_DAY } from "@/components/world/palette";
import { useObjectDrag } from "@/lib/useObjectDrag";

const station = STATION_ORDER.find((s) => s.id === "tokamak")!;
const content = getStationContent("tokamak")!;

const R_MAJOR = 1.1;
const R_MINOR = 0.38;
const COIL_COUNT = 26;

// Reused by the per-frame idle spin below rather than reallocated each call.
const SPIN_AXIS = new THREE.Vector3(0, 1, 0);
const PITCH_AXIS = new THREE.Vector3(1, 0, 0);
const spinQ = new THREE.Quaternion();
// Same reasoning, for the drag rotation below (one pointermove per frame or
// more, for the whole duration of a drag).
const dragQA = new THREE.Quaternion();
const dragQB = new THREE.Quaternion();

function PlasmaParticles({ count, speed }: { count: number; speed: number }) {
  const ref = useRef<THREE.Points>(null);
  const params = useMemo(() => {
    const arr = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      arr[i * 4] = Math.random() * Math.PI * 2;
      arr[i * 4 + 1] = Math.random() * Math.PI * 2;
      arr[i * 4 + 2] = 0.2 + Math.random() * 0.5;
      arr[i * 4 + 3] = (0.35 + Math.random() * 0.55) * R_MINOR;
    }
    return arr;
  }, [count]);
  const positions = useMemo(() => new Float32Array(count * 3), [count]);
  const colors = useMemo(() => {
    const c = new Float32Array(count * 3);
    const inner = new THREE.Color(ACCENT_ICE);
    const outer = new THREE.Color(SKY_DAY);
    for (let i = 0; i < count; i++) {
      const t = (params[i * 4 + 3] / R_MINOR - 0.35) / 0.55;
      const col = inner.clone().lerp(outer, t);
      c[i * 3] = col.r;
      c[i * 3 + 1] = col.g;
      c[i * 3 + 2] = col.b;
    }
    return c;
  }, [count, params]);

  useFrame((state) => {
    const t = state.clock.elapsedTime * speed;
    const geo = ref.current?.geometry;
    if (!geo) return;
    const pos = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const phi0 = params[i * 4];
      const theta0 = params[i * 4 + 1];
      const q = params[i * 4 + 2];
      const r = params[i * 4 + 3];
      // Toroidal progression (phi, around the big ring) dominates — this is
      // "flowing along the toroid", matching the direction the field coils
      // wind around. Poloidal motion (theta, around the tube's own cross
      // section) is a slow secondary drift for a gentle helical look, not
      // a fast spin — it was previously scaled up to 2.5-5x the toroidal
      // rate, which read as particles spinning in place rather than
      // traveling around the ring.
      const phi = phi0 + t * 1.4;
      const theta = theta0 + t * 0.5 * q;
      const R = R_MAJOR + r * Math.cos(theta);
      pos[i * 3] = R * Math.cos(phi);
      pos[i * 3 + 1] = r * Math.sin(theta);
      pos[i * 3 + 2] = R * Math.sin(phi);
    }
    geo.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.065}
        vertexColors
        transparent
        opacity={1}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

/** Toroidal field coils wound tightly and evenly around the main torus —
 *  matching a real tokamak's dense ring-of-loops look, rather than a sparse
 *  spoked structure. Snug against the tube surface, no visible struts.
 *
 *  Each coil is itself a small torus, whose default hole axis (before any
 *  rotation) is world Z. A torus is fully rotationally symmetric about its
 *  own hole axis, so the only thing that needs aligning is that axis — no
 *  extra "roll" term is needed once it's pointed the right way. It needs to
 *  point along the TOROIDAL (circumferential) tangent at each coil's
 *  position, i.e. tangent to the big ring, so the coil stands as a hoop
 *  wrapping the tube's cross-section rather than facing along the ring.
 *  For a position at angle `a` on the big ring — (cos a, 0, sin a) * R_MAJOR,
 *  matching the main torus/particle parametrization below — that tangent is
 *  d/da (cos a, 0, sin a) = (-sin a, 0, cos a), which a plain Y-axis
 *  rotation of `-a` produces from the default Z axis. */
function CoilRig() {
  return (
    <group>
      {Array.from({ length: COIL_COUNT }).map((_, i) => {
        const angle = (i / COIL_COUNT) * Math.PI * 2;
        const cx = Math.cos(angle) * R_MAJOR;
        const cz = Math.sin(angle) * R_MAJOR;
        return (
          <mesh key={i} position={[cx, 0, cz]} rotation={[0, -angle, 0]}>
            <torusGeometry args={[R_MINOR + 0.05, 0.026, 8, 24]} />
            <meshStandardMaterial color="#3d6fd6" roughness={0.3} metalness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

function TokamakBody({ anchor }: { anchor: THREE.Vector3 }) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<RapierRigidBody>(null);
  const physicsEnabled = useUIStore((s) => s.physicsEnabled);
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const deviceTier = useUIStore((s) => s.deviceTier);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const idleSpin = useRef(0.12);
  const quat = useRef(new THREE.Quaternion());

  const count = deviceTier === "low" ? 250 : deviceTier === "mid" ? 550 : 1000;

  // Pointer plumbing (capture, touch-scroll suppression so a rotate-drag
  // doesn't also scroll the climb, single-pointer ownership, and guaranteed
  // cleanup on pointercancel/pinch/unmount) lives in useObjectDrag — see that
  // file and lib/dragState.ts. Its window-level move listener also matters for
  // a torus specifically: the cursor frequently passes over the ring's own
  // empty centre hole, where a mesh-bound onPointerMove/onPointerOut would
  // cancel the drag outright.
  const { start: onDown } = useObjectDrag({
    onStart: (e) => {
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
    },
    onMove: (e) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      // Scratch quaternions — this runs for every pointer move of a drag.
      dragQA.setFromAxisAngle(SPIN_AXIS, dx * 0.006);
      dragQB.setFromAxisAngle(PITCH_AXIS, dy * 0.006);
      quat.current.premultiply(dragQA).premultiply(dragQB);
      idleSpin.current = dx * 0.02;
    },
    onEnd: () => {
      dragging.current = false;
    },
  });

  useFrame((_, delta) => {
    if (!dragging.current) {
      // Scratch objects, not fresh allocations — the idle spin runs every
      // frame this station is mounted (see SkyEnvironment for the same note).
      spinQ.setFromAxisAngle(SPIN_AXIS, idleSpin.current * delta);
      quat.current.premultiply(spinQ);
      idleSpin.current = THREE.MathUtils.lerp(idleSpin.current, reducedMotion ? 0.03 : 0.12, 0.01);
    }
    if (groupRef.current) groupRef.current.quaternion.copy(quat.current);
    if (physicsEnabled && bodyRef.current) {
      bodyRef.current.setNextKinematicRotation(quat.current);
    }
  });

  const body = (
    <group ref={groupRef} onPointerDown={onDown}>
      {/* THREE.TorusGeometry's default hole axis is Z (big ring in the
          XY-plane), but PlasmaParticles below parametrizes its ring in the
          XZ-plane (hole axis Y) — a straight `<mesh>` with no rotation put
          the glass torus and the particle flow at right angles to each
          other. Rotating +90° about X swaps the mesh's Y/Z the same way,
          so its big-ring plane and phi(=u) parametrization (cos->x, sin->z)
          line up exactly with the particles' (x = R cos phi, z = R sin phi). */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R_MAJOR, R_MINOR, 24, 72]} />
        {/* depthWrite={false}: every plasma particle sits inside this shell
            by construction (see PlasmaParticles' radius range above), so
            the shell's near (camera-facing) surface is always closer to the
            camera than any particle behind it — even at 18% opacity, a
            depth-writing surface there occludes ALL of them, not just the
            far half. depthTest stays on (default) so the real scene
            (terrain) still hides the whole assembly correctly when it's
            behind a hillside; only this shell's self-occlusion of its own
            contents is disabled, same standard treatment as any glass /
            energy-shell effect. */}
        <meshStandardMaterial
          color="#1a2140"
          transparent
          opacity={0.18}
          roughness={0.3}
          metalness={0.8}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <CoilRig />
      <PlasmaParticles count={count} speed={reducedMotion ? 0.25 : 1} />
      <pointLight color={ACCENT_ICE} intensity={2.5} distance={4} />
    </group>
  );

  if (!physicsEnabled) return <group position={anchor.toArray()}>{body}</group>;

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={anchor.toArray()}
      gravityScale={0}
    >
      {body}
    </RigidBody>
  );
}

export default function TokamakStation() {
  const anchor = useMemo(() => getStationAnchor(station), []);
  const floatAnchor = useMemo(() => anchor.clone().add(new THREE.Vector3(0, 1.7, 0)), [anchor]);
  return (
    <group>
      <StationPad center={anchor} radius={2.15} />
      {/* pedestal under the floating torus */}
      <mesh position={[anchor.x, anchor.y + 0.35, anchor.z]}>
        <cylinderGeometry args={[0.22, 0.34, 0.6, 10]} />
        <meshStandardMaterial color="#5a6478" roughness={0.5} metalness={0.7} flatShading />
      </mesh>
      <TokamakBody anchor={floatAnchor} />
      <StationLabel
        stationId="tokamak"
        stationT={station.t}
        title={`${content.emoji} ${content.title}`}
        accent={content.accent}
        position={[anchor.x, anchor.y + 3.6, anchor.z]}
      />
    </group>
  );
}
