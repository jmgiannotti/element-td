/**
 * update_sprite.cjs — Convierte Sprite-0002.ase → base64 PNG → HeroSprite.js
 *
 * Uso:
 *   node update_sprite.cjs
 *
 * Parsea el .ase directamente (sin depender de ase-parser, que no lee
 * correctamente este archivo) y compone las capas visibles en un PNG.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PNG } = require('pngjs');

// ── Configuración ──────────────────────────────────────
const ASE_FILE = path.join(__dirname, 'Sprite-0002.ase');
const HERO_SPRITE_FILE = path.join(__dirname, 'js', 'data', 'HeroSprite.js');
const Y_OFFSET = 3;  // px que se baja el sprite para alinear pies con sombra

// ── 1. Parsear el .ase manualmente ─────────────────────
const buff = fs.readFileSync(ASE_FILE);

// Header
const fileSize = buff.readUInt32LE(0);
const magic = buff.readUInt16LE(4);
if (magic !== 0xA5E0) {
    console.error(`ERROR: magic incorrecto 0x${magic.toString(16)}, no es un archivo Aseprite válido`);
    process.exit(1);
}
const numFrames = buff.readUInt16LE(6);
const W = buff.readUInt16LE(8);
const H = buff.readUInt16LE(10);
const colorDepth = buff.readUInt16LE(12);
const bpp = colorDepth / 8;

console.log(`Parseando: ${W}×${H}, ${colorDepth}bpp, ${numFrames} frame(s)`);

// Parse frame 0 chunks
let offset = 128;
const frameBytes = buff.readUInt32LE(offset);
const frameMagic = buff.readUInt16LE(offset + 4);
const oldChunks = buff.readUInt16LE(offset + 6);
const newChunks = buff.readUInt32LE(offset + 12);
const numChunks = newChunks !== 0 ? newChunks : oldChunks;

console.log(`Frame 0: ${numChunks} chunks`);

const layers = [];
const cels = [];

let chunkOffset = offset + 16;
for (let c = 0; c < numChunks && chunkOffset < offset + frameBytes; c++) {
    const chunkSize = buff.readUInt32LE(chunkOffset);
    const chunkType = buff.readUInt16LE(chunkOffset + 4);

    // Layer chunk (0x2004)
    if (chunkType === 0x2004) {
        const layerFlags = buff.readUInt16LE(chunkOffset + 6);
        const layerType = buff.readUInt16LE(chunkOffset + 8);
        const childLevel = buff.readUInt16LE(chunkOffset + 10);
        const blendMode = buff.readUInt16LE(chunkOffset + 14);
        const opacity = buff.readUInt8(chunkOffset + 16);
        const nameLen = buff.readUInt16LE(chunkOffset + 19);
        const name = buff.slice(chunkOffset + 21, chunkOffset + 21 + nameLen).toString('utf-8');
        const visible = !!(layerFlags & 1);
        layers.push({ name, visible, opacity, blendMode, type: layerType });
        console.log(`  Capa ${layers.length - 1}: "${name}" ${visible ? '✓' : '✗'} opacity=${opacity}`);
    }

    // Cel chunk (0x2005)
    if (chunkType === 0x2005) {
        const layerIndex = buff.readUInt16LE(chunkOffset + 6);
        const xpos = buff.readInt16LE(chunkOffset + 8);
        const ypos = buff.readInt16LE(chunkOffset + 10);
        const opacity = buff.readUInt8(chunkOffset + 12);
        const celType = buff.readUInt16LE(chunkOffset + 13);
        const zIndex = buff.readInt16LE(chunkOffset + 15);

        let rawData = null;
        let celW = 0, celH = 0;

        if (celType === 0) {
            // Raw image data
            celW = buff.readUInt16LE(chunkOffset + 22);
            celH = buff.readUInt16LE(chunkOffset + 24);
            rawData = buff.slice(chunkOffset + 26, chunkOffset + 26 + celW * celH * bpp);
        } else if (celType === 2) {
            // Compressed image data
            celW = buff.readUInt16LE(chunkOffset + 22);
            celH = buff.readUInt16LE(chunkOffset + 24);
            const compData = buff.slice(chunkOffset + 26, chunkOffset + chunkSize);
            rawData = zlib.inflateSync(compData);
        }

        if (rawData) {
            cels.push({ layerIndex, xpos, ypos, opacity, celType, zIndex, w: celW, h: celH, rawData });
            const layer = layers[layerIndex];
            console.log(`  Cel: capa ${layerIndex} ("${layer?.name}") ${celW}×${celH} en (${xpos},${ypos})`);
        }
    }

    chunkOffset += chunkSize;
}

console.log(`\nCapas: ${layers.length}, Cels: ${cels.length}`);

// ── 2. Componer capas visibles ─────────────────────────
const canvas = Buffer.alloc(W * H * 4, 0);

// Ordenar cels por layerIndex + zIndex
cels.sort((a, b) => {
    const oA = a.layerIndex + a.zIndex;
    const oB = b.layerIndex + b.zIndex;
    return oA - oB || a.zIndex - b.zIndex;
});

for (const cel of cels) {
    const layer = layers[cel.layerIndex];
    if (!layer || !layer.visible) {
        console.log(`  Saltando cel de capa ${cel.layerIndex} ("${layer?.name}") — oculta`);
        continue;
    }

    // opacity de capa: si es 0, tratar como 255 (ase-parser bug workaround,
    // el campo opacity a veces no se guarda en versiones viejas)
    const layerOpacity = (layer.opacity === 0 ? 255 : layer.opacity) / 255;
    const celOpacity = cel.opacity / 255;
    const combinedOpacity = layerOpacity * celOpacity;

    console.log(`  Componiendo capa ${cel.layerIndex} ("${layer?.name}") ${cel.w}×${cel.h}`);

    for (let py = 0; py < cel.h; py++) {
        for (let px = 0; px < cel.w; px++) {
            const srcIdx = (py * cel.w + px) * 4;
            const dstX = cel.xpos + px;
            const dstY = cel.ypos + py + Y_OFFSET;

            if (dstX < 0 || dstX >= W || dstY < 0 || dstY >= H) continue;

            const dstIdx = (dstY * W + dstX) * 4;

            const srcR = cel.rawData[srcIdx];
            const srcG = cel.rawData[srcIdx + 1];
            const srcB = cel.rawData[srcIdx + 2];
            const srcA = (cel.rawData[srcIdx + 3] / 255) * combinedOpacity;

            if (srcA === 0) continue;

            // Alpha compositing (src over dst)
            const dstA = canvas[dstIdx + 3] / 255;
            const outA = srcA + dstA * (1 - srcA);

            if (outA > 0) {
                canvas[dstIdx]     = Math.round((srcR * srcA + canvas[dstIdx]     * dstA * (1 - srcA)) / outA);
                canvas[dstIdx + 1] = Math.round((srcG * srcA + canvas[dstIdx + 1] * dstA * (1 - srcA)) / outA);
                canvas[dstIdx + 2] = Math.round((srcB * srcA + canvas[dstIdx + 2] * dstA * (1 - srcA)) / outA);
                canvas[dstIdx + 3] = Math.round(outA * 255);
            }
        }
    }
}

// Count visible pixels
let visiblePx = 0;
for (let i = 0; i < canvas.length; i += 4) {
    if (canvas[i + 3] > 0) visiblePx++;
}
console.log(`\nPíxeles visibles en resultado: ${visiblePx}/${W * H}`);

// ── 3. Generar PNG ─────────────────────────────────────
const png = new PNG({ width: W, height: H });
canvas.copy(png.data);
const pngBuffer = PNG.sync.write(png);
const base64 = pngBuffer.toString('base64');

console.log(`PNG: ${pngBuffer.length} bytes, base64: ${base64.length} chars`);

// ── 4. Actualizar HeroSprite.js ────────────────────────
let source = fs.readFileSync(HERO_SPRITE_FILE, 'utf-8');

// Buscar el bloque png: '...' (puede ser multilinea con +)
const pngRegex = /png:\s*\n?\s*'data:image\/png;base64,[\s\S]*?',/;
const match = source.match(pngRegex);

if (!match) {
    console.error('ERROR: No se encontró el bloque png: en HeroSprite.js');
    process.exit(1);
}

// Partir el base64 en líneas de ~100 chars para legibilidad
const chunkSize = 100;
const chunks = [];
for (let i = 0; i < base64.length; i += chunkSize) {
    chunks.push(base64.slice(i, i + chunkSize));
}

let replacement;
if (chunks.length <= 1) {
    replacement = `png:\n        'data:image/png;base64,${base64}',`;
} else {
    const lines = chunks.map((chunk, i) => {
        if (i === 0) return `        'data:image/png;base64,${chunk}'`;
        return `        '${chunk}'`;
    });
    replacement = `png:\n${lines.join(' +\n')},`;
}

source = source.replace(pngRegex, replacement);
fs.writeFileSync(HERO_SPRITE_FILE, source, 'utf-8');

console.log('\n✓ HeroSprite.js actualizado con el nuevo sprite');
console.log('  Recargá el juego en el browser para ver los cambios.');
