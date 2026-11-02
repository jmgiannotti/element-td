/**
 * update_effectiveness.cjs — icon_effective_up.ase + icon_resist_down.ase → EffectivenessSprites.js
 *
 * Uso:
 *   node update_effectiveness.cjs
 *
 * Si los archivos fuente .ase no existen aún en assets/, genera los binarios Aseprite
 * (8×8 px, 32bpp RGBA) con alto contraste para Súper Efectivo (▲, dorado/verde) y
 * Resistido (▼, gris azulado). Luego parsea ambos .ase y exporta EffectivenessSprites.js.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PNG } = require('pngjs');

const ASSETS_DIR = path.join(__dirname, 'assets');
const OUTPUT_FILE = path.join(__dirname, 'js', 'data', 'EffectivenessSprites.js');

const SEEDS = [
    {
        fileName: 'icon_effective_up.ase',
        exportConst: 'EFFECTIVE_UP_SPRITE',
        key: 'icon_effective_up',
        layerName: 'Super Efectivo',
        width: 8,
        height: 8,
        palette: {
            o: [0x14, 0x10, 0x04, 0xFF], // Contorno oscuro de alto contraste
            W: [0xFF, 0xFD, 0xE7, 0xFF], // Brillo especular blanco-dorado
            G: [0xFF, 0xD5, 0x4F, 0xFF], // Oro radiante (#FFD54F)
            g: [0xFF, 0xB3, 0x00, 0xFF], // Oro cálido sombreado (#FFB300)
            L: [0x81, 0xC7, 0x84, 0xFF], // Verde esmeralda claro (#81C784)
            E: [0x4C, 0xAF, 0x50, 0xFF], // Verde esmeralda medio (#4CAF50)
        },
        rows: [
            '...oo...',
            '..oWWo..',
            '.oWGggo.',
            'oWGGGGgo',
            'oGLGGggo',
            'oLLooEEo',
            'oLooooEo',
            '.oo..oo.',
        ],
    },
    {
        fileName: 'icon_resist_down.ase',
        exportConst: 'RESIST_DOWN_SPRITE',
        key: 'icon_resist_down',
        layerName: 'Resistido',
        width: 8,
        height: 8,
        palette: {
            o: [0x0B, 0x11, 0x17, 0xFF], // Contorno hierro oscuro
            W: [0xEC, 0xEF, 0xF1, 0xFF], // Reflejo frío superior izquierdo (#ECEFF1)
            L: [0xB0, 0xBE, 0xC5, 0xFF], // Gris azulado claro (#B0BEC5)
            B: [0x78, 0x90, 0x9C, 0xFF], // Gris azulado medio (#78909C)
            S: [0x54, 0x6E, 0x7A, 0xFF], // Pizarra azulada (#546E7A)
            D: [0x37, 0x47, 0x4F, 0xFF], // Sombra profunda acero (#37474F)
        },
        rows: [
            '.oo..oo.',
            'oWooooSo',
            'oLLooSSo',
            'oLBBBSSo',
            'oLBBBBDo',
            '.oBBBDo.',
            '..oBDo..',
            '...oo...',
        ],
    },
];

function ensureSeedAseFile(seed) {
    const filePath = path.join(ASSETS_DIR, seed.fileName);
    if (fs.existsSync(filePath)) return filePath;
    if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

    const { width: W, height: H, palette, rows, layerName } = seed;
    const rgba = Buffer.alloc(W * H * 4, 0);
    for (let y = 0; y < H; y++) {
        const row = rows[y];
        for (let x = 0; x < W; x++) {
            const color = palette[row[x]];
            if (!color) continue;
            const idx = (y * W + x) * 4;
            rgba[idx] = color[0];
            rgba[idx + 1] = color[1];
            rgba[idx + 2] = color[2];
            rgba[idx + 3] = color[3];
        }
    }

    const header = Buffer.alloc(128, 0);
    header.writeUInt16LE(0xA5E0, 4);
    header.writeUInt16LE(1, 6);
    header.writeUInt16LE(W, 8);
    header.writeUInt16LE(H, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(1, 14);
    header.writeUInt16LE(100, 18);
    header.writeUInt8(0, 24);
    header.writeUInt16LE(32, 32);
    header.writeUInt8(1, 34);
    header.writeUInt8(1, 35);

    const nameBytes = Buffer.from(layerName, 'utf-8');
    const layerChunk = Buffer.alloc(24 + nameBytes.length, 0);
    layerChunk.writeUInt32LE(layerChunk.length, 0);
    layerChunk.writeUInt16LE(0x2004, 4);
    layerChunk.writeUInt16LE(1, 6);
    layerChunk.writeUInt16LE(0, 8);
    layerChunk.writeUInt16LE(0, 10);
    layerChunk.writeUInt16LE(W, 12);
    layerChunk.writeUInt16LE(H, 14);
    layerChunk.writeUInt16LE(0, 16);
    layerChunk.writeUInt8(255, 18);
    layerChunk.writeUInt16LE(nameBytes.length, 22);
    nameBytes.copy(layerChunk, 24);

    const compressed = zlib.deflateSync(rgba);
    const celChunk = Buffer.alloc(26 + compressed.length, 0);
    celChunk.writeUInt32LE(celChunk.length, 0);
    celChunk.writeUInt16LE(0x2005, 4);
    celChunk.writeUInt16LE(0, 6);
    celChunk.writeInt16LE(0, 8);
    celChunk.writeInt16LE(0, 10);
    celChunk.writeUInt8(255, 12);
    celChunk.writeUInt16LE(2, 13);
    celChunk.writeInt16LE(0, 15);
    celChunk.writeUInt16LE(W, 22);
    celChunk.writeUInt16LE(H, 24);
    compressed.copy(celChunk, 26);

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
    return filePath;
}

function compileAseToDataUri(asePath) {
    const buff = fs.readFileSync(asePath);
    const magic = buff.readUInt16LE(4);
    if (magic !== 0xA5E0) {
        throw new Error(`Magic incorrecto 0x${magic.toString(16)} en ${asePath}`);
    }
    const numFrames = buff.readUInt16LE(6);
    const W = buff.readUInt16LE(8);
    const H = buff.readUInt16LE(10);
    const colorDepth = buff.readUInt16LE(12);
    const bpp = colorDepth / 8;
    if (colorDepth !== 32) {
        throw new Error(`Se esperaba RGBA (32bpp) en ${asePath}, recibido ${colorDepth}bpp`);
    }

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

    const canvas = Buffer.alloc(W * H * 4, 0);
    const ordered = frames[0].cels
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

    let minX = W, maxX = 0, minY = H, maxY = 0, opaquePixels = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (canvas[(y * W + x) * 4 + 3] > 0) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                opaquePixels++;
            }
        }
    }

    if (opaquePixels === 0) {
        throw new Error(`No se encontraron píxeles visibles en ${asePath}`);
    }

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const png = new PNG({ width: cropW, height: cropH });
    for (let y = 0; y < cropH; y++) {
        for (let x = 0; x < cropW; x++) {
            const srcIdx = ((minY + y) * W + (minX + x)) * 4;
            const dstIdx = (y * cropW + x) * 4;
            canvas.copy(png.data, dstIdx, srcIdx, srcIdx + 4);
        }
    }

    const pngBuffer = PNG.sync.write(png);
    return {
        width: cropW,
        height: cropH,
        opaquePixels,
        dataUri: `data:image/png;base64,${pngBuffer.toString('base64')}`,
    };
}

const blocks = [
    '/**',
    ' * Sprites de efectividad elemental (▲ Súper Efectivo / ▼ Resistido) generados',
    ' * a partir de assets/icon_effective_up.ase y assets/icon_resist_down.ase.',
    " * Ejecutar 'node update_effectiveness.cjs' para regenerar si se modifican los .ase.",
    ' */',
];

for (const seed of SEEDS) {
    ensureSeedAseFile(seed);
    const asePath = fs.existsSync(path.join(ASSETS_DIR, seed.fileName))
        ? path.join(ASSETS_DIR, seed.fileName)
        : path.join(__dirname, seed.fileName);

    const res = compileAseToDataUri(asePath);
    console.log(`✓ ${seed.fileName}: ${res.width}×${res.height} (${res.opaquePixels} px) → ${seed.key}`);
    blocks.push(
        `export const ${seed.exportConst} = {`,
        `    key: '${seed.key}',`,
        `    width: ${res.width},`,
        `    height: ${res.height},`,
        `    png: '${res.dataUri}',`,
        '};',
        '',
    );
}

fs.writeFileSync(OUTPUT_FILE, blocks.join('\n'), 'utf-8');
console.log(`✓ Generado ${path.relative(__dirname, OUTPUT_FILE)}`);

