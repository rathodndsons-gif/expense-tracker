#!/usr/bin/env node
/**
 * Zero-dependency PWA icon generator.
 *
 * Draws a gradient rounded-square "spending bars" mark and encodes it as PNG
 * using only Node's built-in `zlib` (we hand-roll the PNG container, IHDR,
 * IDAT and IEND chunks + CRC32).
 *
 * Output:
 *   public/icons/icon-192.png            (transparent rounded corners)
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png   (full-bleed, content inside safe zone)
 *   public/apple-touch-icon.png          (180×180 full-bleed, iOS style)
 *
 * Run:  bun scripts/generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ----------------------------- PNG encoder ----------------------------- */

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/* ------------------------------- drawing ------------------------------- */

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/** Anti-aliased rounded-rect alpha (signed distance field). */
function roundedRectAlpha(x, y, size, radius) {
  const half = size / 2;
  const qx = Math.abs(x - half) - (half - radius);
  const qy = Math.abs(y - half) - (half - radius);
  const d =
    Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) +
    Math.min(Math.max(qx, qy), 0) -
    radius;
  return Math.max(0, Math.min(1, 0.5 - d)); // ~1px AA
}

const TOP = [0x58, 0x56, 0xd6]; // indigo
const BOTTOM = [0x0a, 0x84, 0xff]; // blue

/**
 * @param {number} size
 * @param {{ fullBleed?: boolean }} opts fullBleed → no transparency (iOS touch icon / maskable)
 */
function makeIcon(size, { fullBleed = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = fullBleed ? 0 : Math.round(size * 0.22);
  const bottom = size * 0.82;
  const bars = [
    { cx: 0.38, w: 0.12, h: 0.26 },
    { cx: 0.5, w: 0.12, h: 0.42 },
    { cx: 0.62, w: 0.12, h: 0.56 },
  ].map((b) => ({ cx: b.cx * size, w: b.w * size, h: b.h * size }));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const alpha = fullBleed ? 1 : roundedRectAlpha(x, y, size, radius);
      if (alpha <= 0) {
        rgba[i + 3] = 0;
        continue;
      }
      const t = y / size;
      let r = lerp(TOP[0], BOTTOM[0], t);
      let g = lerp(TOP[1], BOTTOM[1], t);
      let b = lerp(TOP[2], BOTTOM[2], t);

      for (const bar of bars) {
        const left = bar.cx - bar.w / 2;
        if (x < left || x > bar.cx + bar.w / 2) continue;
        if (y < bottom - bar.h || y > bottom) continue;
        // Round the top corners of the bar.
        const localX = x - left;
        const overhang = bottom - bar.h - y;
        if (overhang < bar.w / 2) {
          const radius2 = bar.w / 2;
          if (localX < radius2 || localX > bar.w - radius2) {
            const dx = localX < radius2 ? localX : bar.w - localX;
            if (dx * dx + overhang * overhang > radius2 * radius2) continue;
          }
        }
        r = 255;
        g = 255;
        b = 255;
        break;
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePNG(size, size, rgba);
}

const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const jobs = [
  ["icon-192.png", makeIcon(192)],
  ["icon-512.png", makeIcon(512)],
  ["icon-maskable-512.png", makeIcon(512, { fullBleed: true })],
];
writeFileSync(join(root, "public", "apple-touch-icon.png"), makeIcon(180, { fullBleed: true }));

for (const [name, buf] of jobs) {
  writeFileSync(join(outDir, name), buf);
  console.log(`✓ public/icons/${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}
console.log("✓ public/apple-touch-icon.png");
