"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { RigidBody, usePrismaticJoint, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { getStationAnchor, STATION_ORDER } from "@/components/world/path";
import { getStationContent } from "./stations.data";
import StationPad from "./StationPad";
import StationLabel from "./StationLabel";
import { useUIStore } from "@/lib/store";
import { playNote } from "@/lib/tonePlayer";

const station = STATION_ORDER.find((s) => s.id === "piano")!;
const content = getStationContent("piano")!;

const WHITE_KEYS = [
  { note: "C4", key: "a" },
  { note: "D4", key: "s" },
  { note: "E4", key: "d" },
  { note: "F4", key: "f" },
  { note: "G4", key: "g" },
  { note: "A4", key: "h" },
  { note: "B4", key: "j" },
  { note: "C5", key: "k" },
];
const BLACK_KEYS = [
  { note: "C#4", key: "w", after: 0 },
  { note: "D#4", key: "e", after: 1 },
  { note: "F#4", key: "t", after: 3 },
  { note: "G#4", key: "y", after: 4 },
  { note: "A#4", key: "u", after: 5 },
];

const KEY_TRAVEL = 0.09;
const WHITE_W = 0.34;

// The actual synth is a module-level singleton (lib/tonePlayer.ts), shared
// with `useAudioPrewarm` (lib/hooks.ts) so the AudioContext/synth is
// already built well before the visitor could scroll this far — see that
// file's doc comment for why the earlier per-component-instance approach
// here caused the first couple of notes to audibly overlap.
//
// NOTE: this deliberately does NOT prewarm on mount. It used to, and that
// silently killed all piano audio once StationsLayer began mounting during
// the loading screen: a mount effect has no user gesture behind it, so the
// AudioContext unlock it kicked off could never complete. See tonePlayer.ts
// for the full failure mode. Unlocking is `useAudioPrewarm`'s job — it
// listens for the page's first real gesture, which every visitor performs
// (scroll/click/drag) long before reaching this station.
function useTonePlayer() {
  return useCallback((note: string) => playNote(note), []);
}

function PianoKey({
  note,
  x,
  z,
  width,
  depth,
  height,
  color,
  isBlack,
  restY,
  baseRef,
  baseOrigin,
  onPlay,
  registerPress,
}: {
  note: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  isBlack: boolean;
  restY: number;
  baseRef: React.RefObject<RapierRigidBody>;
  baseOrigin: THREE.Vector3;
  onPlay: (note: string) => void;
  registerPress: (note: string, fn: () => void) => void;
}) {
  const keyRef = useRef<RapierRigidBody>(null);
  const pressed = useRef(false);
  const [visualPress, setVisualPress] = useState(false);

  // All 13 keys share ONE fixed anchor body (the piano base) instead of each
  // key spinning up its own — halves the RigidBody count created when this
  // station mounts, which was a real contributor to the hitch felt when
  // scrolling past it. The joint's anchor-on-base is this key's rest
  // position expressed relative to that shared body's own origin.
  usePrismaticJoint(baseRef, keyRef, [
    [x - baseOrigin.x, restY - baseOrigin.y, z - baseOrigin.z],
    [0, 0, 0],
    [0, 1, 0],
    [-KEY_TRAVEL, 0.002],
  ]);

  const press = useCallback(() => {
    pressed.current = true;
    setVisualPress(true);
    onPlay(note);
    keyRef.current?.applyImpulse({ x: 0, y: -0.012, z: 0 }, true);
    setTimeout(() => {
      pressed.current = false;
      setVisualPress(false);
    }, 130);
  }, [note, onPlay]);

  useEffect(() => registerPress(note, press), [note, press, registerPress]);

  useFrame(() => {
    const body = keyRef.current;
    if (!body) return;
    const t = body.translation();
    const disp = t.y - restY;
    const vel = body.linvel();
    // simple spring back to rest (gravity disabled on this body)
    const force = -disp * 55 - vel.y * 3.2;
    body.applyImpulse({ x: 0, y: force * 0.016, z: 0 }, true);
  });

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    press();
  };

  return (
    <>
      {/* colliders disabled: keys are joint+spring driven and clicked via
          raycast, so physical collisions only cause neighbors to jam each
          other into half-pressed poses */}
      <RigidBody
        ref={keyRef}
        type="dynamic"
        position={[x, restY, z]}
        gravityScale={0}
        colliders={false}
        linearDamping={2}
        enabledTranslations={[false, true, false]}
        enabledRotations={[false, false, false]}
      >
        <mesh onPointerDown={onDown} castShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial
            color={visualPress ? "#8fd6ff" : color}
            roughness={0.4}
            metalness={isBlack ? 0.3 : 0.05}
          />
        </mesh>
      </RigidBody>
    </>
  );
}

function PianoKeys({ anchor }: { anchor: THREE.Vector3 }) {
  const playNote = useTonePlayer();
  const baseRef = useRef<RapierRigidBody>(null);
  const pressFns = useRef<Map<string, () => void>>(new Map());
  const registerPress = useCallback((note: string, fn: () => void) => {
    pressFns.current.set(note, fn);
    return () => pressFns.current.delete(note);
  }, []);

  useEffect(() => {
    const keyMap = new Map<string, string>();
    WHITE_KEYS.forEach((k) => keyMap.set(k.key, k.note));
    BLACK_KEYS.forEach((k) => keyMap.set(k.key, k.note));
    const down = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const note = keyMap.get(e.key.toLowerCase());
      if (note && !down.has(e.key)) {
        down.add(e.key);
        pressFns.current.get(note)?.();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => down.delete(e.key);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const restY = anchor.y + 0.2;
  const startX = anchor.x - (WHITE_KEYS.length * WHITE_W) / 2 + WHITE_W / 2;

  return (
    <group>
      <RigidBody ref={baseRef} type="fixed" position={anchor.toArray()} colliders={false} />
      {WHITE_KEYS.map((k, i) => (
        <PianoKey
          key={k.note}
          note={k.note}
          x={startX + i * WHITE_W}
          z={anchor.z}
          width={WHITE_W * 0.92}
          depth={0.9}
          height={0.1}
          color="#eaf2ff"
          isBlack={false}
          restY={restY}
          baseRef={baseRef}
          baseOrigin={anchor}
          onPlay={playNote}
          registerPress={registerPress}
        />
      ))}
      {BLACK_KEYS.map((k) => (
        <PianoKey
          key={k.note}
          note={k.note}
          x={startX + (k.after + 0.5) * WHITE_W}
          z={anchor.z - 0.25}
          width={WHITE_W * 0.55}
          depth={0.45}
          height={0.1}
          color="#0e1c33"
          isBlack
          restY={restY + 0.08}
          baseRef={baseRef}
          baseOrigin={anchor}
          onPlay={playNote}
          registerPress={registerPress}
        />
      ))}
    </group>
  );
}

function StaticPianoKeys({ anchor }: { anchor: THREE.Vector3 }) {
  const playNote = useTonePlayer();
  const [pressedNote, setPressedNote] = useState<string | null>(null);
  const restY = anchor.y + 0.2;
  const startX = anchor.x - (WHITE_KEYS.length * WHITE_W) / 2 + WHITE_W / 2;

  const press = (note: string) => {
    setPressedNote(note);
    playNote(note);
    setTimeout(() => setPressedNote((p) => (p === note ? null : p)), 130);
  };

  return (
    <group>
      {WHITE_KEYS.map((k, i) => (
        <mesh
          key={k.note}
          position={[startX + i * WHITE_W, restY - (pressedNote === k.note ? 0.05 : 0), anchor.z]}
          onPointerDown={() => press(k.note)}
        >
          <boxGeometry args={[WHITE_W * 0.92, 0.1, 0.9]} />
          <meshStandardMaterial color={pressedNote === k.note ? "#8fd6ff" : "#eaf2ff"} />
        </mesh>
      ))}
      {BLACK_KEYS.map((k) => (
        <mesh
          key={k.note}
          position={[
            startX + (k.after + 0.5) * WHITE_W,
            restY + 0.08 - (pressedNote === k.note ? 0.05 : 0),
            anchor.z - 0.25,
          ]}
          onPointerDown={() => press(k.note)}
        >
          <boxGeometry args={[WHITE_W * 0.55, 0.1, 0.45]} />
          <meshStandardMaterial color={pressedNote === k.note ? "#8fd6ff" : "#0e1c33"} />
        </mesh>
      ))}
    </group>
  );
}

export default function PianoStation() {
  const physicsEnabled = useUIStore((s) => s.physicsEnabled);
  const anchor = useMemo(() => getStationAnchor(station), []);

  return (
    <group>
      <StationPad center={anchor} radius={2.15} />
      <mesh position={[anchor.x, anchor.y + 0.06, anchor.z]}>
        <boxGeometry args={[3.2, 0.12, 1.2]} />
        <meshStandardMaterial color="#0e1c33" roughness={0.6} />
      </mesh>
      {physicsEnabled ? <PianoKeys anchor={anchor} /> : <StaticPianoKeys anchor={anchor} />}
      <StationLabel
        stationId="piano"
        stationT={station.t}
        title={`${content.emoji} ${content.title}`}
        accent={content.accent}
        position={[anchor.x, anchor.y + 2.2, anchor.z]}
      />
    </group>
  );
}
