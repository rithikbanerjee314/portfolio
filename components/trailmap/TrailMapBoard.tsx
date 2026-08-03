"use client";

import { useState } from "react";
import { Text } from "@react-three/drei";
import IconBadge from "./IconBadge";
import { TRAILMAP_LAYOUT } from "./layout";

const LABEL_COLOR = "#3a2410";

/** Lays out every Education/Experience/Skills badge from `layout.ts`'s precomputed grid; owns which single badge (if any) has its detail card expanded. */
export default function TrailMapBoard() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <group position={[-TRAILMAP_LAYOUT.totalWidth / 2, 0, 0]}>
      {TRAILMAP_LAYOUT.sections.map((section) => (
        <group key={section.title}>
          <Text
            position={[section.centerX, -section.height / 2 - 0.55, 0]}
            fontSize={0.22}
            color={LABEL_COLOR}
            anchorX="center"
            anchorY="middle"
          >
            {section.title.toUpperCase()}
          </Text>
          {section.badges.map((badge) => (
            <IconBadge
              key={badge.id}
              iconKey={badge.iconKey}
              title={badge.title}
              subtitle={badge.subtitle}
              detail={badge.detail}
              toolKeys={badge.toolKeys}
              position={[badge.x, badge.y]}
              expanded={openId === badge.id}
              onToggle={() => setOpenId(openId === badge.id ? null : badge.id)}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
