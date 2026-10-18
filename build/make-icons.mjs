// Dependency-free PNG generator (uses only Node's built-in zlib) so the repo doesn't
// need an image library / native canvas just to produce the four toolbar icon sizes.
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const outDir = path.join(root, "icons");

const CRC_TABLE = (() => {
  const table = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdrData),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** True if (x, y) falls inside a rounded rectangle of size w×h with the given corner radius. */
function insideRoundedRect(x, y, w, h, radius) {
  if (x >= radius && x <= w - radius) return y >= 0 && y < h;
  if (y >= radius && y <= h - radius) return x >= 0 && x < w;
  const cx = x < radius ? radius : w - radius;
  const cy = y < radius ? radius : h - radius;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function setPixel(buf, size, x, y, [r, g, b, a]) {
  const idx = (y * size + x) * 4;
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
  buf[idx + 3] = a;
}

/** Draws a simple "phone" glyph: a rounded body with an inset screen. */
function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4, 0); // transparent background
  const bodyColor = [15, 118, 110, 255]; // #0f766e
  const screenColor = [204, 251, 241, 255]; // #ccfbf1

  const margin = Math.max(1, Math.round(size * 0.1));
  const bodyW = size - margin * 2;
  const bodyH = size - margin * 2;
  const bodyRadius = Math.max(1, Math.round(size * 0.22));

  const screenMargin = Math.max(1, Math.round(size * 0.19));
  const screenW = size - screenMargin * 2;
  const screenH = size - screenMargin * 2 - Math.round(size * 0.08);
  const screenRadius = Math.max(1, Math.round(size * 0.08));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bx = x - margin;
      const by = y - margin;
      if (bx >= 0 && bx < bodyW && by >= 0 && by < bodyH && insideRoundedRect(bx, by, bodyW, bodyH, bodyRadius)) {
        setPixel(buf, size, x, y, bodyColor);
      }
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = x - screenMargin;
      const sy = y - screenMargin;
      if (sx >= 0 && sx < screenW && sy >= 0 && sy < screenH && insideRoundedRect(sx, sy, screenW, screenH, screenRadius)) {
        setPixel(buf, size, x, y, screenColor);
      }
    }
  }

  return buf;
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = encodePng(size, size, drawIcon(size));
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
  console.log(`Wrote icons/icon${size}.png`);
}
