// Regenerates app/favicon.ico so legacy consumers that fetch `/favicon.ico`
// directly (rather than reading the `<link rel="icon">` tag app/icon.svg
// produces) also get the site's own mountain glyph instead of the Create
// Next App/Vercel triangle this project shipped with.
//
// Hand-rolled rather than pulled in via an image library: this project has
// no image-processing dependency, and adding one just for a single one-off
// icon generation isn't worth it. (An earlier version of the modern favicon
// used next/og's `ImageResponse` instead of a static app/icon.svg — reverted
// after it hit a real bug: Next 14.2.35's bundled @vercel/og throws "Invalid
// URL" loading its default font on Windows, via `fileURLToPath(join(import.
// meta.url, ...))` under the Node.js runtime. A static SVG has no such
// pipeline to fail.) Node's built-in `zlib` is enough to build a real PNG
// (IHDR/IDAT/IEND with a correct CRC32 per chunk), and a PNG embedded whole
// as a single ICO directory entry is a valid, universally supported .ico
// file on every OS/browser since Windows Vista.
//
// Run with: node scratchpad/generate-favicon.mjs
// Re-run this after any change to the icon design in app/icon.svg so the
// two can't drift apart — the triangle coordinates and palette constants
// below are deliberately kept in sync with that file by hand (there's no
// shared source; app/icon.svg is plain markup, this is a plain rasterizer).
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "app", "favicon.ico");

// Same constants as components/world/palette.ts (hex -> rgb by hand, since
// this script runs standalone via plain `node`, not through the app's own
// module graph).
const SKY_DUSK = [0x1c, 0x3a, 0x63];
const BG_DEEP = [0x05, 0x0b, 0x17];
const ROCK_DARK = [0x4d, 0x55, 0x66];
const ROCK_GRAY = [0x6b, 0x74, 0x88];
const SNOW = [0xf2, 0xf8, 0xff];

// Same triangle points as app/icon.tsx's 32x32 SVG, expressed as fractions
// of the canvas so they rescale cleanly to any output size.
const F = 32;
const LEFT_FLANK = [[2, 27], [13, 10], [18, 27]].map(([x, y]) => [x / F, y / F]);
const RIGHT_FLANK = [[13, 10], [22, 27], [18, 27]].map(([x, y]) => [x / F, y / F]);
const SNOW_CAP = [[10, 15], [13, 10], [16, 15]].map(([x, y]) => [x / F, y / F]);

function pointInTriangle(px, py, [[ax, ay], [bx, by], [cx, cy]]) {
  const d = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = d(px, py, ax, ay, bx, by);
  const d2 = d(px, py, bx, by, cx, cy);
  const d3 = d(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Renders the icon at `size`x`size` with 3x3 supersampling per pixel for
 *  clean-looking diagonal triangle edges at small resolutions. */
function renderRGBA(size) {
  const SS = 3;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (x + (sx + 0.5) / SS) / size;
          const fy = (y + (sy + 0.5) / SS) / size;
          // Background: vertical gradient, sky at top to deep navy at bottom.
          let [pr, pg, pb] = [
            lerp(SKY_DUSK[0], BG_DEEP[0], fy),
            lerp(SKY_DUSK[1], BG_DEEP[1], fy),
            lerp(SKY_DUSK[2], BG_DEEP[2], fy),
          ];
          if (pointInTriangle(fx, fy, LEFT_FLANK)) [pr, pg, pb] = ROCK_DARK;
          if (pointInTriangle(fx, fy, RIGHT_FLANK)) [pr, pg, pb] = ROCK_GRAY;
          if (pointInTriangle(fx, fy, SNOW_CAP)) [pr, pg, pb] = SNOW;
          r += pr;
          g += pg;
          b += pb;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      pixels[i] = Math.round(r / n);
      pixels[i + 1] = Math.round(g / n);
      pixels[i + 2] = Math.round(b / n);
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

// --- Minimal PNG encoder (IHDR + one IDAT + IEND), 8-bit RGBA, filter-none ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(pixels, size) {
  const rowBytes = size * 4;
  const raw = Buffer.alloc(size * (1 + rowBytes));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + rowBytes);
    raw[rowStart] = 0; // filter type: None
    raw.set(pixels.subarray(y * rowBytes, (y + 1) * rowBytes), rowStart + 1);
  }
  const idatData = deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- ICO container: one directory entry per size, each holding a real PNG ---

function buildICO(pngsBySize) {
  const count = pngsBySize.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const entries = [];
  const images = [];
  let offset = 6 + count * 16;
  for (const { size, png } of pngsBySize) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // width
    entry[1] = size >= 256 ? 0 : size; // height
    entry[2] = 0; // color count (0 = no palette, true color)
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // bytes in resource
    entry.writeUInt32LE(offset, 12); // offset from start of file
    entries.push(entry);
    images.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images]);
}

const sizes = [16, 32, 48];
const pngsBySize = sizes.map((size) => ({ size, png: encodePNG(renderRGBA(size), size) }));
const ico = buildICO(pngsBySize);
writeFileSync(OUT_PATH, ico);
console.log(`Wrote ${OUT_PATH} (${ico.length} bytes, sizes: ${sizes.join(", ")})`);
