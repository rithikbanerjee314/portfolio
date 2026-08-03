"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Sky as SkyImpl } from "three/examples/jsm/objects/Sky.js";
import * as THREE from "three";
import { useUIStore } from "@/lib/store";
import { SKY_DUSK, SKY_DAY } from "./palette";

/**
 * Sky + fog driven continuously by scroll progress so the whole climb reads
 * as one lighting arc (dusk at the base -> bright blue near the summit)
 * rather than five disconnected environments. Built on three's Sky addon
 * directly (rather than drei's declarative <Sky>) so uniforms can be
 * mutated every frame without fighting React's effect-dependency timing.
 */
// Module scope, not constructed inside useFrame. This loop runs on EVERY
// frame for the entire session, so two `new THREE.Color()` per call is ~120
// short-lived objects a second from this component alone — the steady
// young-generation garbage that shows up as a periodic hitch rather than a
// constant slowdown (same reason CameraRig and path.ts were made
// allocation-free).
const WHITE = new THREE.Color("#ffffff");
export default function SkyEnvironment() {
  const { scene } = useThree();
  const sun = useRef(new THREE.Vector3(0, 1, 0));
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const fogColor = useMemo(() => new THREE.Color(SKY_DUSK), []);
  const dusk = useMemo(() => new THREE.Color(SKY_DUSK), []);
  const day = useMemo(() => new THREE.Color(SKY_DAY), []);

  const sky = useMemo(() => {
    const s = new SkyImpl();
    s.scale.setScalar(450000);
    const u = s.material.uniforms;
    u.turbidity.value = 3.5;
    u.rayleigh.value = 1.1;
    u.mieCoefficient.value = 0.018;
    u.mieDirectionalG.value = 0.8;
    return s;
  }, []);

  useMemo(() => {
    scene.fog = new THREE.FogExp2(SKY_DUSK, 0.016);
  }, [scene]);

  useFrame(() => {
    const t = useUIStore.getState().progress;
    const elevation = THREE.MathUtils.lerp(4, 55, t);
    const azimuth = THREE.MathUtils.lerp(-40, 40, t);
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sun.current.setFromSphericalCoords(1, phi, theta);
    (sky.material.uniforms.sunPosition.value as THREE.Vector3).copy(sun.current);

    fogColor.copy(dusk).lerp(day, t).lerp(WHITE, 0.25);
    if (scene.fog) {
      (scene.fog as THREE.FogExp2).color.copy(fogColor);
      // opens up further near the summit so the final vista shows the whole
      // valley, its beacons and the cloud deck below
      const vista = THREE.MathUtils.smoothstep(t, 0.88, 1);
      (scene.fog as THREE.FogExp2).density =
        THREE.MathUtils.lerp(0.014, 0.007, t) * (1 - vista * 0.55);
    }
    if (dirLightRef.current) {
      dirLightRef.current.position.copy(sun.current).multiplyScalar(40);
      dirLightRef.current.intensity = THREE.MathUtils.lerp(1.15, 1.9, t);
      dirLightRef.current.color.copy(fogColor).lerp(WHITE, 0.7);
    }
  });

  return (
    <>
      <primitive object={sky} />
      <hemisphereLight args={[SKY_DAY, "#5a6b4a", 0.65]} />
      <ambientLight intensity={0.35} color="#dce8f5" />
      <directionalLight ref={dirLightRef} castShadow={false} />
    </>
  );
}
