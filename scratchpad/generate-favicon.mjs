// Regenerates app/favicon.ico so legacy consumers that fetch `/favicon.ico`
// directly (rather than reading the `<link rel="icon">` tag app/icon.svg
// produces) also get the site's own initials badge instead of the Create
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
// Rendering real text (app/icon.svg's "RB") without a font-rasterization
// library means hand-drawing it: RB_FONT below is a plain 5x7 dot-matrix
// bitmap for just the two glyphs this icon needs, laid out and scaled by
// the same rasterizer that draws the circle/ring. It won't match the SVG's
// real system-font letterforms exactly, but at 16-48px nobody can tell the
// difference between a bitmap R and a system-font R — only that it reads as
// "RB" clearly, which this achieves.
//
// Run with: node scratchpad/generate-favicon.mjs
// Re-run this after any change to the icon design in app/icon.svg so the
// two can't drift apart — the circle/ring/text layout and palette constants
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
const BG_DEEP = [0x05, 0x0b, 0x17];
const ACCENT_SIGNAL = [0x2f, 0x6b, 0xff];
const SURFACE_LIGHT = [0xea, 0xf2, 0xff];

// Circle geometry, as fractions of the canvas — same proportions as
// app/icon.svg's `cx=16 cy=16 r=14` on a 32-wide viewBox, with a 2-unit ring.
const CENTER = 0.5;
const RADIUS = 14 / 32;
const RING_WIDTH = 2 / 32;

// Plain 5-wide x 7-tall dot-matrix bitmap, 1 = lit pixel, top row first —
// just enough of a "font" for the two characters this icon needs.
const RB_FONT = {
  R: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
    [1, 0, 1, 0, 0],
    [1, 0, 0, 1, 0],
    [1, 0, 0, 0, 1],
  ],
  B: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
  ],
};
// "R" + a 1-column gap + "B" = 11 columns wide, 7 rows tall, in font units.
const TEXT_COLS = 11;
const TEXT_ROWS = 7;
// Size of one font unit, as a fraction of the canvas — chosen so the whole
// glyph block (11 x 7 units) sits comfortably inside the ring with margin
// on every side, the same way the SVG's text sits inside its circle.
const UNIT = 0.052;
const TEXT_LEFT = CENTER - (TEXT_COLS * UNIT) / 2;
const TEXT_TOP = CENTER - (TEXT_ROWS * UNIT) / 2;

function glyphLit(fx, fy) {
  const col = Math.floor((fx - TEXT_LEFT) / UNIT);
  const row = Math.floor((fy - TEXT_TOP) / UNIT);
  if (row < 0 || row >= TEXT_ROWS) return false;
  if (col >= 0 && col < 5) return RB_FONT.R[row][col] === 1;
  if (col >= 6 && col < 11) return RB_FONT.B[row][col - 6] === 1;
  return false; // the gap column, or outside the block entirely
}

/** Returns [r,g,b,a] for one exact point — a=0 means fully transparent
 *  (outside the circle), a=255 means fully opaque. No in-between values;
 *  edge anti-aliasing comes from supersampling this at several sub-points
 *  per output pixel, not from soft alpha here. */
function sampleColor(fx, fy) {
  const dist = Math.hypot(fx - CENTER, fy - CENTER);
  if (dist > RADIUS) return [0, 0, 0, 0];
  if (dist > RADIUS - RING_WIDTH) return [...ACCENT_SIGNAL, 255];
  if (glyphLit(fx, fy)) return [...SURFACE_LIGHT, 255];
  return [...BG_DEEP, 255];
}

/** Renders at `size`x`size` with 4x4 supersampling per pixel, using
 *  alpha-weighted ("premultiplied") averaging so the transparent-to-opaque
 *  circle edge doesn't pick up a dark or light color fringe from whichever
 *  side happens to dominate a given pixel. */
function renderRGBA(size) {
  const SS = 4;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (x + (sx + 0.5) / SS) / size;
          const fy = (y + (sy + 0.5) / SS) / size;
          const [r, g, b, a] = sampleColor(fx, fy);
          rSum += r * a;
          gSum += g * a;
          bSum += b * a;
          aSum += a;
        }
      }
      const i = (y * size + x) * 4;
      const alpha = Math.round(aSum / (SS * SS));
      pixels[i] = aSum > 0 ? Math.round(rSum / aSum) : 0;
      pixels[i + 1] = aSum > 0 ? Math.round(gSum / aSum) : 0;
      pixels[i + 2] = aSum > 0 ? Math.round(bSum / aSum) : 0;
      pixels[i + 3] = alpha;
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
