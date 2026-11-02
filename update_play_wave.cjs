/**
 * update_play_wave.cjs — icon_play_wave.ase → Data URI PNG → PlayWaveSprite.js
 *
 * Uso:
 *   node update_play_wave.cjs
 *
 * Si assets/icon_play_wave.ase no existe aún, genera el archivo fuente .ase
 * (12×12 px, 32bpp RGBA) con la flecha rúnica de esmeralda y oro.
 * Luego parsea el .ase componiendo sus capas visibles y exporta PlayWaveSprite.js.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PNG } = require('pngjs');

const ASSETS_DIR = path.join(__dirname, 'assets');
const DEFAULT_ASE_PATH = path.join(ASSETS_DIR, 'icon_play_wave.ase');
const PLAY_WAVE_SPRITE_FILE = path.join(__dirname, 'js', 'data', 'PlayWaveSprite.js');

/**
 * Crea un archivo binario Aseprite (.ase) RGBA 32bpp válido de 12×12 px
 * con el diseño pixel art de la flecha rúnica de inicio de oleada.
 */
function ensureSeedAseFile(filePath) {
    if (fs.existsSync(filePath)) return;
    if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

    const W = 12;
    const H = 12;

    // Paleta esmeralda y oro (US 15.18: #81C784, #FFFFFF, acentos #4CAF50 + engaste dorado)
    const PALETTE = {
        o: [0x0D, 0x26, 0x14, 0xFF], // Contorno oscuro esmeralda profundo
        W: [0xFF, 0xFF, 0xFF, 0xFF], // Brillo especular blanco (#FFFFFF)
        L: [0x81, 0xC7, 0x84, 0xFF], // Esmeralda claro iluminado (#81C784)
        E: [0x4C, 0xAF, 0x50, 0xFF], // Esmeralda medio / acento (#4CAF50)
        D: [0x2E, 0x7D, 0x32, 0xFF], // Sombra bisel esmeralda
        Y: [0xFF, 0xF3, 0xC4, 0xFF], // Oro brillante superior
        G: [0xFF, 0xD5, 0x4F, 0xFF], // Engaste rúnico dorado (#FFD54F)
        g: [0xD3, 0x9A, 0x12, 0xFF], // Sombra de oro rúnico
    };

    const ROWS = [
        '.ooo........',
        'oGWLoo......',
        'oGLWWLoo....',
        '.oGLLLLWoo..',
        '.oogGLLWWoo.',
        '..oYGLLLLWWo',
        '..oGgEEEELWo',
        '.oogGEEEDoo.',
        '.ogEEEEDoo..',
        'ogEEEDoo....',
        'ogEDoo......',
        '.ooo........',
    ];

    const rgba = Buffer.alloc(W * H * 4, 0);
    for (let y = 0; y < H; y++) {
        const row = ROWS[y];
        for (let x = 0; x < W; x++) {
            const ch = row[x];
            const color = PALETTE[ch];
            if (!color) continue;
            const idx = (y * W + x) * 4;
            rgba[idx] = color[0];
            rgba[idx + 1] = color[1];
            rgba[idx + 2] = color[2];
            rgba[idx + 3] = color[3];
        }
    }

    // 1. Header Aseprite (128 bytes)
    const header = Buffer.alloc(128, 0);
    header.writeUInt16LE(0xA5E0, 4); // magic
    header.writeUInt16LE(1, 6);      // 1 frame
    header.writeUInt16LE(W, 8);      // width
    header.writeUInt16LE(H, 10);     // height
    header.writeUInt16LE(32, 12);    // 32 bpp RGBA
    header.writeUInt32LE(1, 14);     // flags (layer opacity valid)
    header.writeUInt16LE(100, 18);   // speed (ms)
    header.writeUInt8(0, 24);        // transparent index
    header.writeUInt16LE(32, 32);    // num colors
    header.writeUInt8(1, 34);        // pixel ratio W
    header.writeUInt8(1, 35);        // pixel ratio H

    // 2. Layer chunk (0x2004)
    const layerName = Buffer.from('Runa Play', 'utf-8');
    const layerChunk = Buffer.alloc(24 + layerName.length, 0);
    layerChunk.writeUInt32LE(layerChunk.length, 0);
    layerChunk.writeUInt16LE(0x2004, 4);
    layerChunk.writeUInt16LE(1, 6);  // visible
    layerChunk.writeUInt16LE(0, 8);  // normal layer
    layerChunk.writeUInt16LE(0, 10); // child level
    layerChunk.writeUInt16LE(W, 12);
    layerChunk.writeUInt16LE(H, 14);
    layerChunk.writeUInt16LE(0, 16); // blend normal
    layerChunk.writeUInt8(255, 18);  // opacity
    layerChunk.writeUInt16LE(layerName.length, 22);
    layerName.copy(layerChunk, 24);

    // 3. Cel chunk (0x2005, compressed raw image)
    const compressed = zlib.deflateSync(rgba);
    const celChunk = Buffer.alloc(26 + compressed.length, 0);
    celChunk.writeUInt32LE(celChunk.length, 0);
    celChunk.writeUInt16LE(0x2005, 4);
    celChunk.writeUInt16LE(0, 6);    // layer index 0
    celChunk.writeInt16LE(0, 8);     // x
    celChunk.writeInt16LE(0, 10);    // y
    celChunk.writeUInt8(255, 12);    // opacity
    celChunk.writeUInt16LE(2, 13);   // type 2 = compressed image
    celChunk.writeInt16LE(0, 15);    // z-index
    celChunk.writeUInt16LE(W, 22);   // width
    celChunk.writeUInt16LE(H, 24);   // height
    compressed.copy(celChunk, 26);

    // 4. Frame header (16 bytes)
    const chunks = Buffer.concat([layerChunk, celChunk]);
    const frameHeader = Buffer.alloc(16, 0);
    frameHeader.writeUInt32LE(16 + chunks.length, 0);
    frameHeader.writeUInt16LE(0xF1FA, 4);
    frameHeader.writeUInt16LE(2, 6);
    frameHeader.writeUInt16LE(100, 8);
    frameHeader.writeUInt32LE(2, 12);

    const frame = Buffer.concat([frameHeader, chunks]);
    header.writeUInt32LE(128 + frame.length, 0);

    fs.writeFileSync(filePath, Buffer.concat([header, frame]));
    console.log(`✓ Creado archivo fuente ${path.relative(__dirname, filePath)} (${W}×${H})`);
}

ensureSeedAseFile(DEFAULT_ASE_PATH);

const ASE_FILE = fs.existsSync(DEFAULT_ASE_PATH)
    ? DEFAULT_ASE_PATH
    : path.join(__dirname, 'icon_play_wave.ase');

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

console.log(`Parseando icon_play_wave.ase: ${W}×${H}, ${colorDepth}bpp, ${numFrames} frame(s)`);

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
                zIndex: buff.readUInt16LE(chunkOffset + 15),
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
    console.error('ERROR: No se encontraron píxeles visibles en icon_play_wave.ase');
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
 * Sprite de la flecha rúnica de iniciar oleada generado a partir de icon_play_wave.ase.
 * Ejecutar 'node update_play_wave.cjs' para regenerar si se modifica el archivo aseprite.
 */
export const PLAY_WAVE_SPRITE = {
    key: 'icon_play_wave',
    width: ${cropW},
    height: ${cropH},
    png: '${dataUri}',
};
`;

fs.writeFileSync(PLAY_WAVE_SPRITE_FILE, content, 'utf-8');
console.log(`✓ Generado ${path.relative(__dirname, PLAY_WAVE_SPRITE_FILE)} (${cropW}×${cropH})`);

