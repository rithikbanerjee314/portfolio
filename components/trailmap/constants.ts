/**
 * Plain values shared between TrailMapCanvas.tsx (the dynamically-imported
 * R3F scene) and TrailMapGate.tsx (the always-mounted DOM shell). Kept in
 * this dependency-free module deliberately — TrailMapGate needs
 * BOARD_BACKGROUND to paint its backdrop the instant the map opens (before
 * the heavy canvas chunk has even resolved), and importing it directly from
 * TrailMapCanvas.tsx would pull three/drei/R3F into TrailMapGate's own
 * always-loaded bundle, defeating the code-split between them.
 */

/** Warm brown/tan — matches the wooden sign boards elsewhere on the site. */
export const BOARD_BACKGROUND = "#d9954f";
