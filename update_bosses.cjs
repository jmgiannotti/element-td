/**
 * update_bosses.cjs
 *
 * Lee los archivos boss_titan (.ase o .png), boss_dragon (.ase o .png) y boss_specter (.ase o .png)
 * y actualiza js/data/BossSprites.js con sus versiones Data URI.
 *
 * Uso:
 *   node update_bosses.cjs
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PNG } = require('pngjs');

const BOSS_SPRITES_FILE = path.join(__dirname, 'js', 'data', 'BossSprites.js');

const BOSS_DEFS = [
    { key: 'enemy_boss_titan', baseNames: ['boss_titan'], label: 'Titán de Sillar' },
    { key: 'enemy_boss_dragon', baseNames: ['boss_ascua_64', 'boss_dragon'], label: 'Ascua Primordial' },
    { key: 'enemy_boss_specter', baseNames: ['boss_specter'], label: 'Rey Velador' },
];

function readAseprite(filePath) {
    const buff = fs.readFileSync(filePath);
    const magic = buff.readUInt16LE(4);
    if (magic !== 0xA5E0) throw new Error(`Magic incorrecto en ${filePath}`);

    const numFrames = buff.readUInt16LE(6);
    const W = buff.readUInt16LE(8);
    const H = buff.readUInt16LE(10);
    const colorDepth = buff.readUInt16LE(12);
    const bpp = colorDepth / 8;
    if (colorDepth !== 32) throw new Error(`Se esperaba 32bpp en ${filePath}`);

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

    function composeFrame(frameIndex) {
        const canvas = Buffer.alloc(W * H * 4, 0);
        const ordered = frames[frameIndex].cels
            .slice()
            .sort((a, b) => (a.layerIndex + a.zIndex) - (b.layerIndex + b.zIndex) || a.zIndex - b.zIndex);

        for (const raw of ordered) {
            const layer = layers[raw.layerIndex];
            if (!layer || !isDrawable(raw.layerIndex)) continue;
            if (layer.opacity === 0) continue;

            const cel = resolveCel(raw);
            if (!cel || !cel.raw) continue;

            const mul = (layer.opacity / 255) * (cel.opacity / 255);

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

    if (numFrames > 1) {
        const strip = new PNG({ width: W * numFrames, height: H });
        for (let f = 0; f < numFrames; f++) {
            const c = composeFrame(f);
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const srcIdx = (y * W + x) * 4;
                    const dstIdx = (y * (W * numFrames) + (f * W + x)) * 4;
                    c.copy(strip.data, dstIdx, srcIdx, srcIdx + 4);
                }
            }
        }
        const pngBuffer = PNG.sync.write(strip);
        const totalDuration = frames.reduce((sum, f) => sum + (f.duration || 100), 0);
        const avgDuration = totalDuration / numFrames;
        const frameRate = Math.max(1, Math.round(1000 / avgDuration));

        return {
            width: W,
            height: H,
            frameCount: numFrames,
            frameRate,
            dataUri: `data:image/png;base64,${pngBuffer.toString('base64')}`,
        };
    } else {
        const canvas = composeFrame(0);
        const png = new PNG({ width: W, height: H });
        canvas.copy(png.data);
        const pngBuffer = PNG.sync.write(png);
        return {
            width: W,
            height: H,
            dataUri: `data:image/png;base64,${pngBuffer.toString('base64')}`,
        };
    }
}

function readPng(filePath) {
    const fileBuff = fs.readFileSync(filePath);
    const png = PNG.sync.read(fileBuff);
    return {
        width: png.width,
        height: png.height,
        dataUri: `data:image/png;base64,${fileBuff.toString('base64')}`,
    };
}

console.log('Buscando sprites de jefes para actualizar...');
const spriteMap = {};

for (const b of BOSS_DEFS) {
    let result = null;
    let sourceFile = null;

    for (const base of b.baseNames) {
        const aseInAssets = path.join(__dirname, 'assets', `${base}.ase`);
        const pngInAssets = path.join(__dirname, 'assets', `${base}.png`);
        const aseInRoot = path.join(__dirname, `${base}.ase`);
        const pngInRoot = path.join(__dirname, `${base}.png`);

        const asePath = fs.existsSync(aseInAssets) ? aseInAssets : (fs.existsSync(aseInRoot) ? aseInRoot : null);
        const pngPath = fs.existsSync(pngInAssets) ? pngInAssets : (fs.existsSync(pngInRoot) ? pngInRoot : null);

        if (asePath) {
            result = readAseprite(asePath);
            sourceFile = path.relative(__dirname, asePath);
        } else if (pngPath) {
            result = readPng(pngPath);
            sourceFile = path.relative(__dirname, pngPath);
        }

        if (result) break;
    }

    if (result) {
        spriteMap[b.key] = result;
        const animInfo = result.frameCount > 1 ? ` (${result.frameCount} frames @ ${result.frameRate}fps)` : '';
        console.log(`  ✓ ${b.label} (${b.key}): cargado desde ${sourceFile} (${result.width}×${result.height})${animInfo}`);
    } else {
        console.log(`  - ${b.label} (${b.key}): usando dibujo procedural por defecto`);
    }
}

const fileContent = `/**
 * BossSprites.js
 *
 * Sprites Data URI de los jefes para Phaser.
 * Generado automáticamente por update_bosses.cjs.
 */

export const BOSS_SPRITES = ${JSON.stringify(spriteMap, null, 4)};
`;

fs.writeFileSync(BOSS_SPRITES_FILE, fileContent, 'utf-8');
console.log(`\n✓ ${path.relative(process.cwd(), BOSS_SPRITES_FILE)} actualizado con éxito!`);
