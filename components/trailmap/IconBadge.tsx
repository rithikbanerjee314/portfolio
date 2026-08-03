"use client";

import { useCallback, useState } from "react";
import { Text } from "@react-three/drei";
import { getIconMeta } from "./icons";
import { useIconTexture } from "./useIconTexture";
import { BADGE_SIZE } from "./layout";

const FRAME_COLOR = "#8a5a2b";
const INSET_COLOR = "#141922";
const LABEL_COLOR = "#3a2410";

// --- Detail card layout ----------------------------------------------------
// The card used to be a fixed-height plane (0.9, or 1.15 with a tools row)
// with every text block at a hardcoded y. That silently assumed a one-line
// subtitle and a ~two-line detail — but both wrap against `maxWidth`, and
// the real entries run to three, four, five lines. Anything longer than the
// assumption ran straight through the block above it and off the bottom of
// the card, which is the overlapping title/content that was reported.
//
// The card is now laid out from the text's ACTUAL rendered height: each
// block reports its measured height via troika's `onSync`, and the card
// height and every block position are derived from those. Nothing here
// assumes a line count.
const CARD_WIDTH = BADGE_SIZE * 2.2;
const CARD_PAD = 0.13;
const CARD_GAP = 0.09;
const TOOL_ROW_HEIGHT = 0.3;
const TEXT_WIDTH = CARD_WIDTH - CARD_PAD * 2;
/** Gap between the top of the badge tile and the bottom of its card. */
const CARD_LIFT = 0.18;

const SUBTITLE_SIZE = 0.12;
const DETAIL_SIZE = 0.09;
const DETAIL_LINE_HEIGHT = 1.35;

/**
 * First-frame height guess, replaced by the real measurement as soon as
 * troika syncs. Without it the card would visibly resize on open; the
 * estimate only has to be close, not exact. 0.52em is a reasonable average
 * advance width for the default sans font.
 */
function estimateHeight(text: string, fontSize: number, lineHeight: number): number {
  const charsPerLine = Math.max(Math.floor(TEXT_WIDTH / (fontSize * 0.52)), 1);
  const lines = Math.max(Math.ceil(text.length / charsPerLine), 1);
  return lines * fontSize * lineHeight;
}

/** troika exposes the laid-out block as `[minX, minY, maxX, maxY]`. */
type TroikaTextMesh = { textRenderInfo?: { blockBounds?: [number, number, number, number] } };

function useMeasuredHeight(estimated: number) {
  const [height, setHeight] = useState(estimated);
  const onSync = useCallback((mesh: TroikaTextMesh) => {
    const bounds = mesh?.textRenderInfo?.blockBounds;
    if (!bounds) return;
    const measured = bounds[3] - bounds[1];
    // Threshold guards against a sync/setState feedback loop on float noise.
    setHeight((prev) => (Math.abs(prev - measured) > 0.002 ? measured : prev));
  }, []);
  return [height, onSync] as const;
}

/**
 * A single framed logo tile on the trail map board — a real WebGL plane
 * (frame + dark inset + rasterized icon texture), not a DOM element, so it
 * lives comfortably in the same independent scene as everything else here.
 * Clicking toggles a small detail card above it (role/period/description) —
 * collapsed by default, matching the "not much text" brief for this map.
 */
export default function IconBadge({
  iconKey,
  title,
  subtitle,
  detail,
  toolKeys,
  position,
  expanded,
  onToggle,
}: {
  iconKey: string;
  title: string;
  subtitle?: string;
  detail?: string;
  toolKeys?: string[];
  position: [number, number];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { color } = getIconMeta(iconKey);
  const texture = useIconTexture(iconKey, color);
  const [hovered, setHovered] = useState(false);
  const insetSize = BADGE_SIZE * 0.82;
  const iconSize = BADGE_SIZE * 0.6;

  const [subtitleHeight, onSubtitleSync] = useMeasuredHeight(
    estimateHeight(subtitle ?? "", SUBTITLE_SIZE, 1.2)
  );
  const [detailHeight, onDetailSync] = useMeasuredHeight(
    estimateHeight(detail ?? "", DETAIL_SIZE, DETAIL_LINE_HEIGHT)
  );

  const hasCard = expanded && (subtitle || detail);
  const hasTools = !!toolKeys?.length;

  // Stack the present blocks top-down, spacing each by the one before it's
  // real height rather than by a constant.
  const blocks: { key: string; height: number }[] = [];
  if (subtitle) blocks.push({ key: "subtitle", height: subtitleHeight });
  if (detail) blocks.push({ key: "detail", height: detailHeight });
  if (hasTools) blocks.push({ key: "tools", height: TOOL_ROW_HEIGHT });
  const contentHeight =
    blocks.reduce((sum, b) => sum + b.height, 0) + CARD_GAP * Math.max(blocks.length - 1, 0);
  const cardHeight = contentHeight + CARD_PAD * 2;
  const blockTop: Record<string, number> = {};
  let cursor = cardHeight / 2 - CARD_PAD;
  for (const b of blocks) {
    blockTop[b.key] = cursor;
    cursor -= b.height + CARD_GAP;
  }

  return (
    <group position={[position[0], position[1], 0]}>
      <mesh
        onClick={onToggle}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered || expanded ? 1.06 : 1}
      >
        <planeGeometry args={[BADGE_SIZE, BADGE_SIZE]} />
        <meshBasicMaterial color={FRAME_COLOR} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[insetSize, insetSize]} />
        <meshBasicMaterial color={INSET_COLOR} />
      </mesh>
      {texture && (
        <mesh position={[0, 0, 0.02]}>
          <planeGeometry args={[iconSize, iconSize]} />
          <meshBasicMaterial map={texture} transparent />
        </mesh>
      )}
      <Text
        position={[0, -BADGE_SIZE / 2 - 0.22, 0]}
        fontSize={0.13}
        color={LABEL_COLOR}
        anchorX="center"
        anchorY="middle"
        maxWidth={BADGE_SIZE * 1.7}
        textAlign="center"
      >
        {title}
      </Text>
      {hasCard && (
        // Anchored by its BOTTOM edge a fixed distance above the tile, so a
        // taller card grows upward into empty space instead of down over the
        // badge it belongs to. z=0.05 puts the whole card in front of every
        // badge's own layers (0 / 0.01 / 0.02); only one card is ever open at
        // a time (TrailMapBoard owns a single `openId`), so cards can't
        // fight each other for depth.
        <group position={[0, BADGE_SIZE / 2 + CARD_LIFT + cardHeight / 2, 0.05]}>
          <mesh>
            <planeGeometry args={[CARD_WIDTH, cardHeight]} />
            <meshBasicMaterial color="#1a1408" transparent opacity={0.94} />
          </mesh>
          {subtitle && (
            <Text
              position={[0, blockTop.subtitle, 0.01]}
              fontSize={SUBTITLE_SIZE}
              color={color}
              anchorX="center"
              anchorY="top"
              maxWidth={TEXT_WIDTH}
              textAlign="center"
              onSync={onSubtitleSync}
            >
              {subtitle}
            </Text>
          )}
          {detail && (
            <Text
              position={[0, blockTop.detail, 0.01]}
              fontSize={DETAIL_SIZE}
              color="#e6d9c3"
              anchorX="center"
              anchorY="top"
              maxWidth={TEXT_WIDTH}
              textAlign="center"
              lineHeight={DETAIL_LINE_HEIGHT}
              onSync={onDetailSync}
            >
              {detail}
            </Text>
          )}
          {hasTools && (
            <group position={[0, blockTop.tools - TOOL_ROW_HEIGHT / 2, 0.01]}>
              {toolKeys!.map((key, i) => (
                <ToolIcon key={key} iconKey={key} index={i} count={toolKeys!.length} />
              ))}
            </group>
          )}
        </group>
      )}
    </group>
  );
}

/** Small unframed icon used for the "tools used" row inside an experience badge's detail card. */
function ToolIcon({ iconKey, index, count }: { iconKey: string; index: number; count: number }) {
  const { color } = getIconMeta(iconKey);
  const texture = useIconTexture(iconKey, color);
  const spacing = 0.34;
  const x = (index - (count - 1) / 2) * spacing;
  if (!texture) return null;
  return (
    <mesh position={[x, 0, 0]}>
      <planeGeometry args={[0.26, 0.26]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}
