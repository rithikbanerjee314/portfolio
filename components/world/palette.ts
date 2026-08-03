/** Blue-dominant palette shared between CSS (globals.css) and R3F shaders/materials. */
export const BG_DEEP = "#050b17";
export const BG_MID = "#0e1c33";
export const SKY_DUSK = "#1c3a63";
export const SKY_DAY = "#4f8fdb";
export const ACCENT_ICE = "#8fd6ff";
export const ACCENT_SIGNAL = "#2f6bff";
export const SURFACE_LIGHT = "#eaf2ff";
export const TEXT_ON_LIGHT = "#0e1c33";
export const TEXT_PRIMARY = "#e7edf7";

/**
 * Nature tones for terrain/vegetation.
 *
 * Tuned for SEPARATION, not just individual good looks: these are averaged
 * and blended against each other across a lit surface, so two materials that
 * differ only in hue but sit at the same lightness collapse into each other
 * under shading. Rock in particular used to sit at nearly the same lightness
 * as high-altitude grass, and the stone pads sat close to rock. Measured as
 * CIE76 dE between the mean rendered colour of each terrain class, the
 * most-confusable pair improved from dE 16.6 to 24.4 (1.47x) by pushing
 * rock cooler AND darker, dirt warmer and more saturated, snow brighter, and
 * the pad stone lighter and more neutral so it reads as cut stone rather
 * than more rock. Re-measure with the same method before retuning these.
 */
export const GRASS_LOW = "#47712a";
export const GRASS_HIGH = "#96b355";
export const DIRT_TRAIL = "#a85f31";
export const ROCK_GRAY = "#6b7488";
export const SNOW = "#f2f8ff";

/**
 * Second tone for each of the three large terrain expanses. Terrain.tsx
 * blends between a pair using smooth, position-derived variation, which is
 * what gives a big flat area some life WITHOUT the per-vertex random jitter
 * that used to do that job and produced the splotchy look instead (see
 * macroVariation there). Each pair is deliberately close in hue and a step
 * apart in value: the variation should read as the same material catching
 * the light differently, never as a second material.
 */
export const DIRT_TRAIL_DARK = "#7a4220";
export const ROCK_DARK = "#4d5566";
export const SNOW_SHADE = "#c2d6ea";
export const TREE_GREEN = "#2d6a4f";
export const TREE_GREEN_LIGHT = "#40916c";
export const TRUNK_BROWN = "#6f4518";
// Lighter and more neutral than the surrounding rock — pad-vs-rock is the
// most confusable pair in the whole terrain (both are grays), so this one
// carries most of the burden of telling "built platform" from "mountainside".
export const STONE_PAD = "#b0aaa1";
