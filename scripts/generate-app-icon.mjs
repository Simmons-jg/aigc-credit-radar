import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "public", "aigc-credit-radar-icon.ico");
const iconSizes = [16, 32, 48, 64, 128, 256];

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, generateIco(iconSizes));
console.log(`Generated ${outputPath}`);

function generateIco(sizes) {
  const images = sizes.map((size) => createIconDib(renderIcon(size), size, size));
  const headerSize = 6 + sizes.length * 16;
  const output = Buffer.alloc(headerSize + images.reduce((sum, image) => sum + image.length, 0));

  output.writeUInt16LE(0, 0);
  output.writeUInt16LE(1, 2);
  output.writeUInt16LE(sizes.length, 4);

  let imageOffset = headerSize;
  sizes.forEach((size, index) => {
    const entryOffset = 6 + index * 16;
    const image = images[index];
    output.writeUInt8(size === 256 ? 0 : size, entryOffset);
    output.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    output.writeUInt8(0, entryOffset + 2);
    output.writeUInt8(0, entryOffset + 3);
    output.writeUInt16LE(1, entryOffset + 4);
    output.writeUInt16LE(32, entryOffset + 6);
    output.writeUInt32LE(image.length, entryOffset + 8);
    output.writeUInt32LE(imageOffset, entryOffset + 12);
    image.copy(output, imageOffset);
    imageOffset += image.length;
  });

  return output;
}

function createIconDib(rgba, width, height) {
  const xorBytes = width * height * 4;
  const maskRowBytes = Math.ceil(width / 32) * 4;
  const maskBytes = maskRowBytes * height;
  const dib = Buffer.alloc(40 + xorBytes + maskBytes);

  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(width, 4);
  dib.writeInt32LE(height * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(0, 16);
  dib.writeUInt32LE(xorBytes, 20);
  dib.writeInt32LE(0, 24);
  dib.writeInt32LE(0, 28);
  dib.writeUInt32LE(0, 32);
  dib.writeUInt32LE(0, 36);

  let offset = 40;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      dib[offset] = rgba[source + 2];
      dib[offset + 1] = rgba[source + 1];
      dib[offset + 2] = rgba[source];
      dib[offset + 3] = rgba[source + 3];
      offset += 4;
    }
  }

  return dib;
}

function renderIcon(size) {
  const samples = 4;
  const pixels = Buffer.alloc(size * size * 4);
  const bolt = [
    [35.4, 8.8],
    [18.8, 34.1],
    [30.4, 34.1],
    [27.4, 55.2],
    [45.2, 27.7],
    [33.4, 27.7],
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = ((x + (sx + 0.5) / samples) / size) * 64;
          const py = ((y + (sy + 0.5) / samples) / size) * 64;
          const color = sampleIconColor(px, py, bolt);
          r += color[0];
          g += color[1];
          b += color[2];
          a += color[3];
        }
      }

      const divisor = samples * samples;
      const target = (y * size + x) * 4;
      pixels[target] = Math.round(r / divisor);
      pixels[target + 1] = Math.round(g / divisor);
      pixels[target + 2] = Math.round(b / divisor);
      pixels[target + 3] = Math.round(a / divisor);
    }
  }

  return pixels;
}

function sampleIconColor(x, y, bolt) {
  if (!insideRoundRect(x, y, 0, 0, 64, 64, 14)) return [0, 0, 0, 0];
  if (pointInPolygon(x, y, bolt)) return [255, 255, 255, 255];

  const inner = insideRoundRect(x, y, 4, 4, 56, 56, 11);
  if (!inner) return [8, 117, 104, 255];

  const t = clamp((y - 4) / 56, 0, 1);
  return [
    Math.round(lerp(11, 6, t)),
    Math.round(lerp(122, 79, t)),
    Math.round(lerp(109, 73, t)),
    255,
  ];
}

function insideRoundRect(x, y, rectX, rectY, width, height, radius) {
  const innerX = clamp(x, rectX + radius, rectX + width - radius);
  const innerY = clamp(y, rectY + radius, rectY + height - radius);
  const dx = x - innerX;
  const dy = y - innerY;
  return dx * dx + dy * dy <= radius * radius;
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
