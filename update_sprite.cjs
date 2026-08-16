/**
 * update_sprite.cjs — Sprite-0002.ase → tira PNG horizontal → HeroSprite.js
 *
 * Uso:
 *   node update_sprite.cjs
 *
 * Parsea el .ase a mano (ase-parser no lee bien este archivo) y compone TODAS
 * las frames del archivo, una al lado de la otra, en una sola tira de
 * `numFrames × 32` píxeles de ancho. Phaser la carga como spritesheet y anima
 * los cuadros; ver `js/scenes/BootScene.js` y `js/data/HeroSprite.js`.
 *
 * Una tira y no un PNG por cuadro: un solo data URI, una sola textura, y el
 * ciclo de caminata pasa a ser una animación de Phaser en vez de cuatro
 * `setTexture` por segundo.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PNG } = require('pngjs');

// ── Configuración ──────────────────────────────────────
const ASE_FILE = path.join(__dirname, 'Sprite-0002.ase');
const HERO_SPRITE_FILE = path.join(__dirname, 'js', 'data', 'HeroSprite.js');
// Fila donde tienen que caer los pies. Hero cuelga la sombra a +14 del centro
// del sprite, así que 30 es donde el personaje toca el piso. El desplazamiento
// se calcula, no se hardcodea: si redibujás la figura más alta o más baja, la
// tira sigue apoyando en el mismo lugar sola.
const FLOOR_Y = 30;

// ── 1. Cabecera ────────────────────────────────────────
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

console.log(`Parseando: ${W}×${H}, ${colorDepth}bpp, ${numFrames} frame(s)`);

// ── 2. Capas y celdas de cada frame ────────────────────
// Los campos de un chunk de capa, según el spec, desde el inicio del chunk:
// flags(2) type(2) childLevel(2) defaultW(2) defaultH(2) blend(2) opacity(1)
// future(3) name(len2 + chars). Leer blend/opacity/nombre tres bytes antes
// —que es lo que hacía este script— da opacity 0 y nombre vacío en todas.
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
                type: buff.readUInt16LE(chunkOffset + 8),      // 0 imagen, 1 grupo
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
                // Imagen sin comprimir
                cel.w = buff.readUInt16LE(chunkOffset + 22);
                cel.h = buff.readUInt16LE(chunkOffset + 24);
                cel.raw = buff.slice(chunkOffset + 26, chunkOffset + 26 + cel.w * cel.h * bpp);
            } else if (cel.celType === 2) {
                // Imagen comprimida
                cel.w = buff.readUInt16LE(chunkOffset + 22);
                cel.h = buff.readUInt16LE(chunkOffset + 24);
                cel.raw = zlib.inflateSync(buff.slice(chunkOffset + 26, chunkOffset + chunkSize));
            } else if (cel.celType === 1) {
                // Celda linkeada: los píxeles viven en otra frame. Aseprite las
                // usa cuando una capa no cambia entre cuadros, así que sin esto
                // media animación sale vacía.
                cel.linkFrame = buff.readUInt16LE(chunkOffset + 22);
            }

            cels.push(cel);
        }

        chunkOffset += chunkSize;
    }

    frames.push({ duration, cels });
    offset += frameBytes;
}

for (const [i, l] of layers.entries()) {
    console.log(`  Capa ${i}: "${l.name}"${l.type === 1 ? ' [grupo]' : ''} `
        + `${l.visible ? '✓' : '✗'} nivel=${l.childLevel} opacity=${l.opacity}`);
}

/**
 * Una capa se dibuja si ella y todos sus grupos padre están visibles. El padre
 * es la capa anterior más cercana con un childLevel menor.
 */
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

/** Sigue una celda linkeada hasta la frame que tiene los píxeles. */
function resolveCel(cel, depth = 0) {
    if (cel.celType !== 1) return cel;
    if (depth > numFrames) return null;              // cadena de links circular
    const src = frames[cel.linkFrame]?.cels.find(c => c.layerIndex === cel.layerIndex);
    if (!src) return null;
    const resolved = resolveCel(src, depth + 1);
    return resolved ? { ...resolved, xpos: cel.xpos, ypos: cel.ypos } : null;
}

// ── 3. Componer cada frame ─────────────────────────────
/** Devuelve un buffer RGBA de W×H con las capas visibles de esa frame. */
function compose(frameIndex, dy) {
    const canvas = Buffer.alloc(W * H * 4, 0);

    const ordered = frames[frameIndex].cels
        .slice()
        .sort((a, b) => (a.layerIndex + a.zIndex) - (b.layerIndex + b.zIndex) || a.zIndex - b.zIndex);

    for (const raw of ordered) {
        const layer = layers[raw.layerIndex];
        if (!layer || !isDrawable(raw.layerIndex)) continue;
        // Una capa de imagen en opacity 0 es una capa invisible. Los grupos no
        // llegan acá porque no tienen celdas, así que no hace falta el viejo
        // "si es 0 tratalo como 255" — ese parche tapaba el offset equivocado.
        if (layer.opacity === 0) continue;

        const cel = resolveCel(raw);
        if (!cel || !cel.raw) continue;

        const mul = (layer.opacity / 255) * (cel.opacity / 255);

        for (let py = 0; py < cel.h; py++) {
            for (let px = 0; px < cel.w; px++) {
                const srcIdx = (py * cel.w + px) * 4;
                const dstX = cel.xpos + px;
                const dstY = cel.ypos + py + dy;
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

/** [minY, maxY] de las filas con algo pintado, o null si está vacío. */
function verticalExtent(canvas) {
    let min = null, max = null;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (canvas[(y * W + x) * 4 + 3] === 0) continue;
            if (min === null) min = y;
            max = y;
            break;
        }
    }
    return min === null ? null : [min, max];
}

// Primera pasada sin desplazar, para saber cuánto hay que bajar la tira. Un
// solo desplazamiento para todas las frames: el rebote entre cuadros es del
// dibujo y hay que conservarlo, así que se alinea el conjunto, no cada frame.
const flat = [];
for (let f = 0; f < numFrames; f++) flat.push(compose(f, 0));
const extents = flat.map(verticalExtent).filter(Boolean);
if (!extents.length) {
    console.error('ERROR: no hay un solo píxel visible en ninguna frame');
    process.exit(1);
}
const lowest = Math.max(...extents.map(e => e[1]));
const highest = Math.min(...extents.map(e => e[0]));
const Y_OFFSET = FLOOR_Y - lowest;

console.log(`\nFilas ocupadas: ${highest}–${lowest} · pies a y=${FLOOR_Y} ⇒ desplazamiento ${Y_OFFSET >= 0 ? '+' : ''}${Y_OFFSET}px`);
if (highest + Y_OFFSET < 0) {
    console.warn(`  ⚠ se recortan ${-(highest + Y_OFFSET)}px arriba: la figura no entra en ${W}×${H}`);
}

// ── 4. Armar la tira ───────────────────────────────────
const strip = new PNG({ width: W * numFrames, height: H });
for (let f = 0; f < numFrames; f++) {
    const canvas = compose(f, Y_OFFSET);
    let visible = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const src = (y * W + x) * 4;
            const dst = (y * strip.width + f * W + x) * 4;
            canvas.copy(strip.data, dst, src, src + 4);
            if (canvas[src + 3] > 0) visible++;
        }
    }
    console.log(`  Frame ${f}: ${visible} px, ${frames[f].duration}ms`);
}

const pngBuffer = PNG.sync.write(strip);
const base64 = pngBuffer.toString('base64');
console.log(`\nTira: ${strip.width}×${strip.height}, ${pngBuffer.length} bytes, base64 ${base64.length} chars`);

// ── 5. Actualizar HeroSprite.js ────────────────────────
let source = fs.readFileSync(HERO_SPRITE_FILE, 'utf-8');

/** Reemplaza un campo de una línea, y avisa si no estaba. */
function setField(name, value) {
    const re = new RegExp(`(\\n\\s*${name}:\\s*)[^,\\n]*(,)`);
    if (!re.test(source)) {
        console.warn(`  ⚠ no encontré el campo \`${name}\` en HeroSprite.js — revisalo a mano`);
        return;
    }
    source = source.replace(re, `$1${value}$2`);
}

const pngRegex = /png:\s*\n?\s*'data:image\/png;base64,[\s\S]*?',/;
if (!pngRegex.test(source)) {
    console.error('ERROR: No se encontró el bloque png: en HeroSprite.js');
    process.exit(1);
}

// Base64 partido en líneas de 100 para que el diff sea legible
const CHUNK = 100;
const chunks = [];
for (let i = 0; i < base64.length; i += CHUNK) chunks.push(base64.slice(i, i + CHUNK));

const replacement = chunks.length <= 1
    ? `png:\n        'data:image/png;base64,${base64}',`
    : `png:\n${chunks.map((c, i) => (i === 0
        ? `        'data:image/png;base64,${c}'`
        : `        '${c}'`)).join(' +\n')},`;

source = source.replace(pngRegex, replacement);

setField('frameCount', String(numFrames));
setField('frameMs', String(frames[0].duration));

fs.writeFileSync(HERO_SPRITE_FILE, source, 'utf-8');

console.log('\n✓ HeroSprite.js actualizado');
console.log('  Recargá el juego en el browser para ver los cambios.');
