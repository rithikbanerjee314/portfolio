"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { STATION_ORDER, PATH_CURVE, getStationAnchor } from "./path";
import { useUIStore } from "@/lib/store";

/**
 * No visual pillar — just per-checkpoint anchor points, used only to
 * project "click to travel" DOM labels once the visitor reaches the summit
 * overlook (rendered in Overlay.tsx). Used to also render a glowing light
 * pillar at every checkpoint, removed at the user's request (2026-07-26,
 * "they look awkwardly placed") — the label projection is the only reason
 * this component still exists.
 */
const UP = new THREE.Vector3(0, 1, 0);
// Nudge distance from the station's own anchor — just enough to clear the
// widest object footprint (the ~1.6-unit signboard, half-width 0.8) without
// pushing the label anchor far from the object it marks.
const BEACON_CLEARANCE = 0.95;
// Label height above the anchor — matches the old beam's top (anchor.y+6.4)
// plus clearance, kept as-is so the label sits at the same place it always
// has even though there's no beam there to justify the number anymore.
const LABEL_HEIGHT = 6.9;
// Same threshold as the summit overlook blend in CameraRig — only project
// "click to travel" labels once the visitor is up at the vista looking down
// on the whole route; at ground level each station already has its own
// StationLabel right next to its object, so a second label here would just
// be clutter.
const OVERLOOK_PROGRESS = 0.86;
const tmpVec3 = new THREE.Vector3();
const EMPTY_LABELS: Record<string, { x: number; y: number; visible: boolean }> = {};

export default function Beacons() {
  const { camera, size } = useThree();
  const setBeaconLabels = useUIStore((s) => s.setBeaconLabels);
  const beacons = useMemo(
    () =>
      STATION_ORDER.filter((s) => s.id !== "base").map((s) => {
        const anchor = getStationAnchor(s);
        let pos = anchor;
        if (s.side !== 0) {
          const tangent = PATH_CURVE.getTangentAt(s.t).normalize();
          const lateral = new THREE.Vector3().crossVectors(tangent, UP).normalize();
          // Nudge back toward the trail (opposite the station's own
          // lateral offset) so the label anchor sits between the object and
          // the path it marks, rather than pushed further out into the slope.
          pos = anchor.clone().addScaledVector(lateral, -s.side * BEACON_CLEARANCE);
        }
        return { station: s, anchor: pos };
      }),
    []
  );
  const labelsActive = useRef(false);
  const labelThrottle = useRef(0);

  useFrame((_, delta) => {
    const progress = useUIStore.getState().progress;

    // "click to travel" labels only matter once the visitor is up at the
    // summit overlook — everywhere else each station already has its own
    // ground-level StationLabel. Deliberately a manual world->screen
    // projection written to the store and drawn as plain DOM in Overlay.tsx,
    // NOT drei's `<Html>` — that mechanism was tried here first and, per
    // CLAUDE.md lessons 26-28, was invisible specifically from this same
    // overlook camera for reasons that were never root-caused. Recomputing
    // the projection ourselves sidesteps whatever's broken in that path.
    if (progress <= OVERLOOK_PROGRESS) {
      if (labelsActive.current) {
        labelsActive.current = false;
        setBeaconLabels(EMPTY_LABELS);
      }
      return;
    }
    labelsActive.current = true;

    // Throttled to ~20hz — smooth enough for the slow overlook camera drift,
    // far cheaper than a state write every frame.
    labelThrottle.current += delta;
    if (labelThrottle.current < 0.05) return;
    labelThrottle.current = 0;

    const next: Record<string, { x: number; y: number; visible: boolean }> = {};
    for (const b of beacons) {
      tmpVec3.set(b.anchor.x, b.anchor.y + LABEL_HEIGHT, b.anchor.z);
      tmpVec3.project(camera);
      next[b.station.id] = {
        x: (tmpVec3.x * 0.5 + 0.5) * size.width,
        y: (-tmpVec3.y * 0.5 + 0.5) * size.height,
        // z outside [-1, 1] means behind the camera or past the far plane.
        visible: tmpVec3.z > -1 && tmpVec3.z < 1,
      };
    }
    setBeaconLabels(next);
  });

  return null;
}
