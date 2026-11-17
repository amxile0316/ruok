// Modified by the RUOK fork on 2026-11-17: generates official RUOK icon assets and installer artwork.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'desktop/brand/ruok-master.png');
const publicDir = path.join(root, 'public');
const installerDir = path.join(root, 'desktop/installer-assets');
const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

const clamp = (value, min = 0, max = 255) => Math.max(min, Math.min(max, value));

async function transparentMaster() {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.from(data);
  const width = info.width, height = info.height;
  const alphaMap = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    const sourceAlpha = rgba[i + 3] / 255;
    alphaMap[p] = sourceAlpha < 0.03 ? 0 : sourceAlpha;
  }
  // Keep only sizable connected components: removes sensor/film speckles while preserving the detached dot.
  const seen = new Uint8Array(width * height);
  const keep = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || alphaMap[start] <= 0) continue;
    let top = 0, count = 0;
    stack[top++] = start;
    seen[start] = 1;
    const members = [];
    while (top > 0) {
      const p = stack[--top];
      members.push(p);
      count++;
      const x = p % width, y = Math.floor(p / width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (!seen[q] && alphaMap[q] > 0) { seen[q] = 1; stack[top++] = q; }
      }
    }
    if (count >= 40) for (const p of members) keep[p] = 1;
  }
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    if (!keep[p]) { rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0; continue; }
    let r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    // The supplied render has a few pure-red/yellow chromatic artifacts on the top/right rim. Recolour only
    // extreme red/yellow pixels so the bronze patina stays untouched.
    const other = Math.max(g, b);
    if (r > 30 && other < 25 && r - other > 20) { r = 176; g = 128; b = 80; }
    else if (r > 180 && g > 145 && b < 70) { r = 201; g = 160; b = 96; }
    const alpha = alphaMap[p];
    // Despill low-alpha edge pixels before unmixing from white; chromatic edge noise would otherwise turn red/yellow.
    if (alpha < 0.9) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const mix = (1 - alpha) * 0.7;
      r = r * (1 - mix) + lum * mix;
      g = g * (1 - mix) + lum * mix;
      b = b * (1 - mix) + lum * mix;
    }
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b;
    rgba[i + 3] = Math.round(alpha * 255);
    if (rgba[i + 3] > 8) {
      const x = p % width, y = Math.floor(p / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('no opaque pixels found in brand source');
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const trimmed = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: minX, top: minY, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();
  const side = Math.round(Math.max(cropWidth, cropHeight) * 1.14);
  const left = Math.round((side - cropWidth) / 2);
  const top = Math.round((side - cropHeight) / 2);
  return sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: trimmed, left, top }])
    .png()
    .toBuffer();
}

async function renderPng(master, size) {
  let image = sharp(master).resize(size, size, { fit: 'contain', kernel: 'lanczos3', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (size <= 32) image = image.sharpen({ sigma: 0.8, m1: 0.9, m2: 2.2 });
  else if (size <= 64) image = image.sharpen({ sigma: 0.6, m1: 0.6, m2: 1.6 });
  return image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

function bmpIconEntry(rgba, width, height) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(width, 4);
  header.writeInt32LE(height * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  const maskRow = Math.ceil(width / 32) * 4;
  header.writeUInt32LE(width * height * 4 + maskRow * height, 20);
  const xor = Buffer.alloc(width * height * 4);
  const and = Buffer.alloc(maskRow * height);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4;
      const d = (y * width + x) * 4;
      xor[d] = rgba[s + 2];
      xor[d + 1] = rgba[s + 1];
      xor[d + 2] = rgba[s];
      xor[d + 3] = rgba[s + 3];
      if (rgba[s + 3] < 128) and[y * maskRow + (x >> 3)] |= 1 << (7 - (x & 7));
    }
  }
  return Buffer.concat([header, xor, and]);
}

async function buildIco(pngs) {
  const entries = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    const png = pngs.get(size);
    if (size === 256) {
      entries.push({ size, data: png });
    } else {
      const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      entries.push({ size, data: bmpIconEntry(data, size, size) });
    }
  }
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach((entry, index) => {
    const pos = 6 + index * 16;
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, pos);
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, pos + 1);
    header.writeUInt8(0, pos + 2);
    header.writeUInt8(0, pos + 3);
    header.writeUInt16LE(1, pos + 4);
    header.writeUInt16LE(32, pos + 6);
    header.writeUInt32LE(entry.data.length, pos + 8);
    header.writeUInt32LE(offset, pos + 12);
    offset += entry.data.length;
  });
  return Buffer.concat([header, ...entries.map(entry => entry.data)]);
}

function buildIcns(pngs) {
  const chunks = [
    ['icp4', 16], ['icp5', 32], ['icp6', 64],
    ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
    ['ic11', 32], ['ic12', 64], ['ic13', 128], ['ic14', 256],
  ].map(([type, size]) => {
    const data = pngs.get(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const head = Buffer.alloc(8);
  head.write('icns', 0, 4, 'ascii');
  head.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}

function writeBmp24(rgba, width, height, target) {
  const rowSize = Math.ceil(width * 3 / 4) * 4;
  const pixelSize = rowSize * height;
  const file = Buffer.alloc(54 + pixelSize);
  file.write('BM', 0, 2, 'ascii');
  file.writeUInt32LE(file.length, 2);
  file.writeUInt32LE(54, 10);
  file.writeUInt32LE(40, 14);
  file.writeInt32LE(width, 18);
  file.writeInt32LE(height, 22);
  file.writeUInt16LE(1, 26);
  file.writeUInt16LE(24, 28);
  file.writeUInt32LE(pixelSize, 34);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 3;
      file[d] = rgba[s + 2];
      file[d + 1] = rgba[s + 1];
      file[d + 2] = rgba[s];
    }
  }
  fs.writeFileSync(target, file);
}

async function buildSidebar(master) {
  const width = 164, height = 314;
  const background = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b2c29"/><stop offset="0.55" stop-color="#101a18"/><stop offset="1" stop-color="#080d0c"/>
    </linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
    <path d="M24 246 H140" stroke="#d8b77b" stroke-opacity=".45"/>
    <text x="82" y="276" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="3" fill="#e6c489">RUOK</text>
    <text x="82" y="294" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="8" letter-spacing="1.5" fill="#8ba39b">LOCAL VIDEO STUDIO</text>
  </svg>`);
  const icon = await sharp(master).resize(104, 104, { fit: 'contain', kernel: 'lanczos3', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const png = await sharp(background).composite([{ input: icon, left: 30, top: 62 }]).png().toBuffer();
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  writeBmp24(data, width, height, path.join(installerDir, 'sidebar.bmp'));
}

const master = await transparentMaster();
const pngs = new Map();
for (const size of pngSizes) {
  const png = await renderPng(master, size);
  pngs.set(size, png);
  fs.writeFileSync(path.join(publicDir, `ruok-icon-${size}.png`), png);
}
fs.writeFileSync(path.join(publicDir, 'ruok.ico'), await buildIco(pngs));
fs.writeFileSync(path.join(publicDir, 'ruok.icns'), buildIcns(pngs));
fs.writeFileSync(path.join(publicDir, 'ruok-mark.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="RUOK"><image width="256" height="256" href="data:image/png;base64,${pngs.get(256).toString('base64')}"/></svg>\n`);
await buildSidebar(master);
for (const dir of ['release']) {
  const target = path.join(root, dir);
  if (fs.existsSync(target)) fs.writeFileSync(path.join(target, 'RUOK.icns'), fs.readFileSync(path.join(publicDir, 'ruok.icns')));
}
console.log('RUOK icons generated:', pngSizes.map(size => `${size}px`).join(', '), '+ ico/icns/sidebar');
