/**
 * Plain values shared between VaultCanvas.tsx (the dynamically-imported R3F
 * scene) and VaultGate.tsx (the always-mounted DOM shell). Kept in this
 * dependency-free module deliberately — VaultGate needs WALL_COLOR to paint
 * its backdrop the instant the vault opens (before the heavy canvas chunk
 * has even resolved), and importing it directly from VaultCanvas.tsx would
 * pull three/drei/R3F into VaultGate's own always-loaded bundle, defeating
 * the code-split between them.
 */

/** Deep, near-black purple — the vault's dark lit room. */
export const WALL_COLOR = "#0d0a12";
