"use client";

import { useMemo, useState } from "react";
import { Text } from "@react-three/drei";
import { getStationAnchor, STATION_ORDER } from "@/components/world/path";
import StationPad from "./StationPad";
import StationLabel from "./StationLabel";
import { TRAILMAP } from "@/lib/content";
import { TRUNK_BROWN } from "@/components/world/palette";
import { useUIStore } from "@/lib/store";

const station = STATION_ORDER.find((s) => s.id === "intro")!;
const ACCENT = "#8fd6ff";

/**
 * Trailhead stop: a single wooden signboard on a stone pad just past base
 * camp. The About Me pane (bio + skills) opens on arrival, or via its
 * label/tab — same as any normal station. The trail map used to be a
 * second, separate sign a short scroll further up the path (its own
 * station, its own camera stop); merged onto this same board 2026-07-27 at
 * the user's request for "one sign that combines both of these two
 * functionalities" rather than two adjacent-but-separate stops. The board
 * itself is unchanged in spirit — same posts, same welcome text — just
 * taller, with a distinct "View Trail Map" button engraved near the
 * bottom. Clicking that button is the same "one part of the object has a
 * special, different click behavior" pattern already used by the vault
 * chest and the soccer ball/chess king: the board/label still do the
 * normal station thing (travel + open the About Me pane), only this one
 * small element hands off to the fullscreen trail map instead.
 */
export default function IntroStation() {
  const anchor = useMemo(() => getStationAnchor(station), []);
  const requestScrollTo = useUIStore((s) => s.requestScrollTo);
  const setMapPending = useUIStore((s) => s.setMapPending);
  const [mapHovered, setMapHovered] = useState(false);

  const openMap = () => {
    requestScrollTo?.(station.t);
    setMapPending(true);
  };

  return (
    <group>
      <StationPad center={anchor} radius={1.65} />
      <group position={[anchor.x, anchor.y, anchor.z]}>
        {/* posts — moved out to the board's edges so they frame the sign
            rather than crossing through the text (they used to sit at
            x=±0.55, well inside the text's width, and their front face was
            physically closer to the camera than the text plane). Left at
            their original height even though the board grew taller below
            (to fit the trail-map button) — the board already protruded
            slightly above the posts' own top in the original design
            (1.475 vs 1.4), so a slightly larger protrusion here reads as
            the same established look, not a new one. */}
        <mesh position={[-0.76, 0.7, 0]} castShadow>
          <boxGeometry args={[0.1, 1.4, 0.1]} />
          <meshStandardMaterial color={TRUNK_BROWN} roughness={0.85} flatShading />
        </mesh>
        <mesh position={[0.76, 0.7, 0]} castShadow>
          <boxGeometry args={[0.1, 1.4, 0.1]} />
          <meshStandardMaterial color={TRUNK_BROWN} roughness={0.85} flatShading />
        </mesh>
        {/* board — two zones only: a big WELCOME! and the button. An earlier
            version squeezed in a third zone, a two-line bio caption ("I'm
            Rithik — scroll to climb the trail and meet the projects along
            the way"), which the user cut as too verbose for a trailhead
            sign; the board keeps its height and spends it on making the
            button genuinely large instead of on prose. */}
        <mesh position={[0, 1.0, 0]} castShadow>
          <boxGeometry args={[1.6, 1.0, 0.07]} />
          <meshStandardMaterial color="#8a5a2b" roughness={0.75} flatShading />
        </mesh>
        {/* engraved welcome — just proud of the board's own front face
            (z=0.04), not out at the posts' front face (0.05). The posts
            don't overlap the text horizontally (|x|=0.76 vs. text capped
            within maxWidth 1.2 centered), so there's no occlusion reason to
            push it out further — doing so left a visible gap between board
            and text at oblique angles, reading as hovering text rather than
            engraved-on-the-sign. */}
        <Text
          position={[0, 1.31, 0.04]}
          fontSize={0.185}
          color="#f3e9d2"
          anchorX="center"
          anchorY="middle"
          maxWidth={1.35}
          textAlign="center"
          letterSpacing={0.04}
        >
          WELCOME!
        </Text>
        {/* Skills/experience button — the board's main call to action, so
            it's a large panel rather than the thin bar it used to be. This
            is the ONLY thing on this board that doesn't behave like the
            rest of a normal station: clicking it hands off to the
            fullscreen trail map instead of opening the About Me pane (the
            board itself and the floating label still do that). */}
        <mesh
          position={[0, 0.87, 0.036]}
          scale={mapHovered ? 1.04 : 1}
          onClick={openMap}
          onPointerOver={(e) => {
            e.stopPropagation();
            setMapHovered(true);
          }}
          onPointerOut={() => setMapHovered(false)}
        >
          <boxGeometry args={[1.4, 0.46, 0.02]} />
          <meshStandardMaterial
            color="#6b4423"
            roughness={0.75}
            flatShading
            emissive={TRAILMAP.accent}
            emissiveIntensity={mapHovered ? 0.34 : 0.12}
          />
        </mesh>
        {/* No emoji in these two: they render through troika (real WebGL
            text), whose default font has no emoji coverage, so the map glyph
            the old label carried came out as a tofu box. Emoji is fine in
            the DOM labels (StationLabel/StationPane), just not here. */}
        <Text
          position={[0, 0.925, 0.05]}
          fontSize={0.098}
          color="#fff6e2"
          anchorX="center"
          anchorY="middle"
          maxWidth={1.3}
          textAlign="center"
          lineHeight={1.25}
        >
          {"Click for my\nSkills & Experience"}
        </Text>
      </group>
      <StationLabel
        stationId="intro"
        stationT={station.t}
        title="👋 About Me"
        accent={ACCENT}
        position={[anchor.x, anchor.y + 2.4, anchor.z]}
      />
    </group>
  );
}
