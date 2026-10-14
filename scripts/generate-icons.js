/**
 * Generates valid PNG icons and SVG favicon using Node built-in zlib & fs.
 * No external dependencies required!
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makePng(width, height, getPixelRgba) {
  const bytesPerPixel = 4;
  const scanlineLength = width * bytesPerPixel;
  const rawData = Buffer.alloc((scanlineLength + 1) * height);

  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (scanlineLength + 1);
    rawData[scanlineOffset] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRgba(x, y, width, height);
      const pixelOffset = scanlineOffset + 1 + x * bytesPerPixel;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const idatData = zlib.deflateSync(rawData);

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([typeBuf, data]);
    const crcVal = crc32(body);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal, 0);
    return Buffer.concat([lenBuf, body, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function renderIcon(x, y, w, h) {
  // Normalize 0..1
  const nx = (x - w / 2) / (w / 2);
  const ny = (y - h / 2) / (h / 2);
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Background rounded rect / circle
  if (Math.abs(nx) > 0.92 || Math.abs(ny) > 0.92) {
    return [0, 0, 0, 0];
  }

  // Background gradient: dark slate to indigo (#0f172a to #312e81)
  const grad = (ny + 1) * 0.5;
  let bgR = Math.round(15 + grad * 34);
  let bgG = Math.round(23 + grad * 23);
  let bgB = Math.round(42 + grad * 87);

  // Center mine/orb shape
  if (dist < 0.48) {
    // Glowing central core (cyan #06b6d4 to teal #14b8a6)
    const coreGrad = 1 - (dist / 0.48);
    const orbR = Math.round(6 + coreGrad * 30);
    const orbG = Math.round(182 + coreGrad * 60);
    const orbB = Math.round(212 + coreGrad * 40);
    return [orbR, orbG, orbB, 255];
  }

  // Spikes for classic mine look (8 spikes)
  const angle = Math.atan2(ny, nx);
  const spikeCount = 8;
  const modAngle = Math.abs((angle % (Math.PI / 4)) - (Math.PI / 8));
  if (dist < 0.65 && modAngle < 0.08) {
    return [34, 211, 238, 255]; // bright cyan spikes
  }

  // Border ring
  if (dist >= 0.75 && dist <= 0.82) {
    return [99, 102, 241, Math.round(180 * (1 - Math.abs(dist - 0.785) / 0.035))];
  }

  return [bgR, bgG, bgB, 255];
}

const targetDir = path.join(__dirname, '..', 'src');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Write PNGs
const png192 = makePng(192, 192, renderIcon);
fs.writeFileSync(path.join(targetDir, 'icon-192.png'), png192);

const png512 = makePng(512, 512, renderIcon);
fs.writeFileSync(path.join(targetDir, 'icon-512.png'), png512);

// Write SVG
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="core" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="100" fill="url(#bg)"/>
  <!-- Spikes -->
  <g stroke="#38bdf8" stroke-width="24" stroke-linecap="round">
    <line x1="256" y1="90" x2="256" y2="422"/>
    <line x1="90" y1="256" x2="422" y2="256"/>
    <line x1="138" y1="138" x2="374" y2="374"/>
    <line x1="138" y1="374" x2="374" y2="138"/>
  </g>
  <!-- Core Orb -->
  <circle cx="256" cy="256" r="110" fill="url(#core)"/>
  <circle cx="215" cy="215" r="30" fill="#ffffff" opacity="0.6"/>
</svg>`;

fs.writeFileSync(path.join(targetDir, 'favicon.svg'), svgContent);
console.log('Icons generated successfully: icon-192.png, icon-512.png, favicon.svg');
