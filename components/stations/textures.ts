import * as THREE from "three";

/**
 * Procedurally-generated canvas textures for station objects — no external
 * assets, generated once and cached per call site via useMemo by callers.
 */

/**
 * Classic black-pentagon-on-white soccer ball pattern, as a SQUARE tileable
 * texture (not equirectangular). An equirectangular texture on a UV sphere
 * has a real mathematical singularity at both poles — texture rows near the
 * top/bottom edge get compressed onto a vanishingly small circumference on
 * the sphere, so ANY shape drawn there distorts, no matter how it's sized
 * or positioned (three separate attempts at pole-specific fixes all ran
 * into this same wall). A square, evenly-gridded texture has no such
 * problem; paired with `makeSpherifiedBoxGeometry` below (a cube mesh
 * pushed out to a sphere, not a UV sphere), every face gets the same
 * uniform grid with no pole compression anywhere on the ball.
 */
export function makeSoccerBallTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4f7fb";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#0e1c33";

  const drawPentagon = (cx: number, cy: number, r: number, rot: number) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };

  // One large pentagon centered on the face, with generous white margin.
  // This texture is shared identically across all 6 faces of the spherified
  // cube, and cube face centers are already maximally/evenly spread across
  // the sphere by construction — so one pentagon per face gives exactly 6
  // large, widely-spaced pentagons on the whole ball, the fewest that can
  // still appear on every face as the ball rotates (any fewer would leave
  // some faces blank and look inconsistent mid-spin).
  drawPentagon(size / 2, size / 2, 78, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A "spherified cube" (aka cube-sphere): a box mesh with every vertex
 * pushed out to lie on a sphere of the given radius. Unlike THREE's
 * SphereGeometry, whose UVs are equirectangular (a real singularity at both
 * poles — see the comment on makeSoccerBallTexture above), a box's default
 * per-face UVs are each an ordinary 0–1 square with no compression
 * anywhere, so a tileable square texture reads as uniform panels from
 * every angle including what would have been the "poles."
 */
export function makeSpherifiedBoxGeometry(radius: number, segments = 8): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(2, 2, 2, segments, segments, segments);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.normalize().multiplyScalar(radius);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Transparent grid-line net pattern for goal netting. */
export function makeNetTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1.4;
  const step = 12;
  for (let x = 0; x <= size; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}
