/**
 * update_gear.cjs — gear32.ase → Data URI PNG → GearSprite.js
 *
 * Uso:
 *   node update_gear.cjs
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PNG } = require('pngjs');

const ASE_FILE = fs.existsSync(path.join(__dirname, 'assets', 'gear32.ase'))
    ? path.join(__dirname, 'assets', 'gear32.ase')
    : path.join(__dirname, 'gear32.ase');
const GEAR_SPRITE_FILE = path.join(__dirname, 'js', 'data', 'GearSprite.js');
const EXPORT_PNG_FILE = path.join(__dirname, 'assets', 'settings_gear.png');

if (!fs.existsSync(ASE_FILE)) {
    console.error(`ERROR: No se encontró ${ASE_FILE}`);
    process.exit(1);
}

const buff = fs.readFileSync(ASE_FILE);

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

if (colorDepth !== 32) {
    console.error(`ERROR: se esperaba RGBA (32bpp), el archivo es ${colorDepth}bpp`);
    process.exit(1);
}

console.log(`Parseando gear32.ase: ${W}×${H}, ${colorDepth}bpp, ${numFrames} frame(s)`);

const layers = [];
const frames = [];

let offset = 128;
for (let f = 0; f < numFrames; f++) {
    const frameBytes = buff.readUInt32LE(offset);
    const duration = buff.readUInt16LE(offset + 8);
    const oldChunks = buff.readUInt16LE(offset + 6);
    const newChunks = buff.readUInt32LE(offset + 12);
    const numChunks = newChunks !== 0 ? newChunks : oldChunks;

    const cels = [];
    let chunkOffset = offset + 16;

    for (let c = 0; c < numChunks && chunkOffset < offset + frameBytes; c++) {
        const chunkSize = buff.readUInt32LE(chunkOffset);
        const chunkType = buff.readUInt16LE(chunkOffset + 4);

        // Layer chunk (0x2004)
        if (chunkType === 0x2004) {
            const flags = buff.readUInt16LE(chunkOffset + 6);
            const nameLen = buff.readUInt16LE(chunkOffset + 22);
            layers.push({
                name: buff.slice(chunkOffset + 24, chunkOffset + 24 + nameLen).toString('utf-8'),
                type: buff.readUInt16LE(chunkOffset + 8),
                childLevel: buff.readUInt16LE(chunkOffset + 10),
                blendMode: buff.readUInt16LE(chunkOffset + 16),
                opacity: buff.readUInt8(chunkOffset + 18),
                visible: !!(flags & 1),
            });
        }

        // Cel chunk (0x2005)
        if (chunkType === 0x2005) {
            const cel = {
                layerIndex: buff.readUInt16LE(chunkOffset + 6),
                xpos: buff.readInt16LE(chunkOffset + 8),
                ypos: buff.readInt16LE(chunkOffset + 10),
                opacity: buff.readUInt8(chunkOffset + 12),
                celType: buff.readUInt16LE(chunkOffset + 13),
                zIndex: buff.readInt16LE(chunkOffset + 15),
            };

            if (cel.celType === 0) {
                cel.w = buff.readUInt16LE(chunkOffset + 22);
                cel.h = buff.readUInt16LE(chunkOffset + 24);
                cel.raw = buff.slice(chunkOffset + 26, chunkOffset + 26 + cel.w * cel.h * bpp);
            } else if (cel.celType === 2) {
                cel.w = buff.readUInt16LE(chunkOffset + 22);
                cel.h = buff.readUInt16LE(chunkOffset + 24);
                cel.raw = zlib.inflateSync(buff.slice(chunkOffset + 26, chunkOffset + chunkSize));
            } else if (cel.celType === 1) {
                cel.linkFrame = buff.readUInt16LE(chunkOffset + 22);
            }

            cels.push(cel);
        }

        chunkOffset += chunkSize;
    }

    frames.push({ duration, cels });
    offset += frameBytes;
}

function isDrawable(index) {
    if (!layers[index]) return true;
    let level = layers[index].childLevel;
    if (!layers[index].visible) return false;
    for (let i = index - 1; i >= 0 && level > 0; i--) {
        if (layers[i].childLevel < level) {
            if (!layers[i].visible) return false;
            level = layers[i].childLevel;
        }
    }
    return true;
}

function resolveCel(cel, depth = 0) {
    if (cel.celType !== 1) return cel;
    if (depth > numFrames) return null;
    const src = frames[cel.linkFrame]?.cels.find(c => c.layerIndex === cel.layerIndex);
    if (!src) return null;
    const resolved = resolveCel(src, depth + 1);
    return resolved ? { ...resolved, xpos: cel.xpos, ypos: cel.ypos } : null;
}

function compose(frameIndex) {
    const canvas = Buffer.alloc(W * H * 4, 0);

    const ordered = frames[frameIndex].cels
        .slice()
        .sort((a, b) => (a.layerIndex + a.zIndex) - (b.layerIndex + b.zIndex) || a.zIndex - b.zIndex);

    for (const raw of ordered) {
        const layer = layers[raw.layerIndex];
        if (layer && (!isDrawable(raw.layerIndex) || layer.opacity === 0)) continue;

        const cel = resolveCel(raw);
        if (!cel || !cel.raw) continue;

        const layerOp = layer ? layer.opacity / 255 : 1;
        const mul = layerOp * (cel.opacity / 255);

        for (let py = 0; py < cel.h; py++) {
            for (let px = 0; px < cel.w; px++) {
                const srcIdx = (py * cel.w + px) * 4;
                const dstX = cel.xpos + px;
                const dstY = cel.ypos + py;
                if (dstX < 0 || dstX >= W || dstY < 0 || dstY >= H) continue;

                const srcA = (cel.raw[srcIdx + 3] / 255) * mul;
                if (srcA === 0) continue;

                const dstIdx = (dstY * W + dstX) * 4;
                const dstA = canvas[dstIdx + 3] / 255;
                const outA = srcA + dstA * (1 - srcA);
                if (outA <= 0) continue;

                for (let ch = 0; ch < 3; ch++) {
                    canvas[dstIdx + ch] = Math.round(
                        (cel.raw[srcIdx + ch] * srcA + canvas[dstIdx + ch] * dstA * (1 - srcA)) / outA
                    );
                }
                canvas[dstIdx + 3] = Math.round(outA * 255);
            }
        }
    }

    return canvas;
}

const canvas = compose(0);

// Encontrar caja delimitadora exacta de píxeles no transparentes
let minX = W, maxX = 0, minY = H, maxY = 0;
let opaquePixels = 0;
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        const a = canvas[(y * W + x) * 4 + 3];
        if (a > 0) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            opaquePixels++;
        }
    }
}

if (opaquePixels === 0) {
    console.error('ERROR: No se encontraron píxeles visibles en gear32.ase');
    process.exit(1);
}

const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;
console.log(`Píxeles ocupados: x=[${minX}..${maxX}], y=[${minY}..${maxY}] → Dimensión: ${cropW}×${cropH} (${opaquePixels} píxeles)`);

const png = new PNG({ width: cropW, height: cropH });
for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
        const srcIdx = ((minY + y) * W + (minX + x)) * 4;
        const dstIdx = (y * cropW + x) * 4;
        canvas.copy(png.data, dstIdx, srcIdx, srcIdx + 4);
    }
}

const pngBuffer = PNG.sync.write(png);
const base64 = pngBuffer.toString('base64');
const dataUri = `data:image/png;base64,${base64}`;

const content = `/**
 * Sprite del engranaje de ajustes generado a partir de gear32.ase.
 * Ejecutar 'node update_gear.cjs' para regenerar si se modifica el archivo aseprite.
 */
export const GEAR_SPRITE = {
    key: 'icon_gear',
    width: ${cropW},
    height: ${cropH},
    png: '${dataUri}',
};
`;

fs.writeFileSync(GEAR_SPRITE_FILE, content, 'utf-8');
fs.writeFileSync(EXPORT_PNG_FILE, pngBuffer);
console.log(`✓ Generado ${path.relative(__dirname, GEAR_SPRITE_FILE)} (${cropW}×${cropH})`);
console.log(`✓ Exportado ${path.relative(__dirname, EXPORT_PNG_FILE)}`);
