/**
 * export_bosses.cjs
 *
 * Exports the procedural boss textures (Titán de Sillar, Ascua Primordial, Rey Velador)
 * as individual 32x32 .png and .ase (Aseprite) files in the root folder.
 *
 * Usage:
 *   node export_bosses.cjs
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PNG } = require('pngjs');
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

/**
 * Creates a valid Aseprite (.ase) binary buffer from 32x32 RGBA pixels.
 */
function createAseFile(rgbaBuffer, width = 32, height = 32, layerName = 'Boss') {
    // 1. Header (128 bytes)
    const header = Buffer.alloc(128);
    // Header size will be filled at the end
    header.writeUInt16LE(0xA5E0, 4); // magic number
    header.writeUInt16LE(1, 6);      // num frames
    header.writeUInt16LE(width, 8);  // width
    header.writeUInt16LE(height, 10); // height
    header.writeUInt16LE(32, 12);    // 32 bpp (RGBA)
    header.writeUInt32LE(1, 14);     // flags (1 = layer valid)
    header.writeUInt16LE(100, 18);   // speed (ms)
    header.writeUInt8(0, 24);        // transparent palette entry
    header.writeUInt16LE(32, 32);    // number of colors
    header.writeUInt8(1, 34);        // pixel width ratio
    header.writeUInt8(1, 35);        // pixel height ratio

    // 2. Layer Chunk (0x2004)
    const nameBytes = Buffer.from(layerName, 'utf-8');
    const layerChunkSize = 24 + nameBytes.length;
    const layerChunk = Buffer.alloc(layerChunkSize);
    layerChunk.writeUInt32LE(layerChunkSize, 0);
    layerChunk.writeUInt16LE(0x2004, 4); // chunk type
    layerChunk.writeUInt16LE(1, 6);      // flags: 1 (visible)
    layerChunk.writeUInt16LE(0, 8);      // type: 0 (image)
    layerChunk.writeUInt16LE(0, 10);     // childLevel
    layerChunk.writeUInt16LE(width, 12); // default width
    layerChunk.writeUInt16LE(height, 14);// default height
    layerChunk.writeUInt16LE(0, 16);     // blend mode: normal
    layerChunk.writeUInt8(255, 18);      // opacity
    // 19..21: future
    layerChunk.writeUInt16LE(nameBytes.length, 22);
    nameBytes.copy(layerChunk, 24);

    // 3. Cel Chunk (0x2005) with compressed raw image data
    const compressedRaw = zlib.deflateSync(rgbaBuffer);
    const celChunkSize = 26 + compressedRaw.length;
    const celChunk = Buffer.alloc(celChunkSize);
    celChunk.writeUInt32LE(celChunkSize, 0);
    celChunk.writeUInt16LE(0x2005, 4);  // chunk type
    celChunk.writeUInt16LE(0, 6);       // layer index 0
    celChunk.writeInt16LE(0, 8);        // xpos
    celChunk.writeInt16LE(0, 10);       // ypos
    celChunk.writeUInt8(255, 12);       // opacity
    celChunk.writeUInt16LE(2, 13);      // celType: 2 (compressed image)
    celChunk.writeInt16LE(0, 15);       // zIndex
    // 17..21: future
    celChunk.writeUInt16LE(width, 22);  // width
    celChunk.writeUInt16LE(height, 24); // height
    compressedRaw.copy(celChunk, 26);

    // 4. Frame Header (16 bytes)
    const frameChunks = Buffer.concat([layerChunk, celChunk]);
    const frameSize = 16 + frameChunks.length;
    const frameHeader = Buffer.alloc(16);
    frameHeader.writeUInt32LE(frameSize, 0); // bytes in frame
    frameHeader.writeUInt16LE(0xF1FA, 4);   // frame magic
    frameHeader.writeUInt16LE(2, 6);        // old chunks: 2
    frameHeader.writeUInt16LE(100, 8);      // frame duration (ms)
    // 10..11: future
    frameHeader.writeUInt32LE(2, 12);       // new chunks: 2

    const fullFrame = Buffer.concat([frameHeader, frameChunks]);
    const totalFileSize = 128 + fullFrame.length;
    header.writeUInt32LE(totalFileSize, 0);

    return Buffer.concat([header, fullFrame]);
}

async function exportBosses() {
    const port = 5195;
    console.log('Starting preview server for texture extraction...');
    const server = spawn('npx.cmd', ['vite', 'preview', '--port', String(port)], {
        cwd: __dirname,
        shell: true,
        stdio: 'pipe',
    });

    await new Promise(resolve => {
        server.stdout.on('data', data => {
            const str = data.toString();
            if (str.includes(String(port)) || str.includes('Local:')) resolve();
        });
        setTimeout(resolve, 2500);
    });

    try {
        console.log('Extracting textures via headless browser...');
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle2' });

        const texturesData = await page.evaluate(async () => {
            await new Promise(r => setTimeout(r, 600));
            const game = window.game;
            if (!game) return null;

            const extractPixels = (key) => {
                const texture = game.textures.get(key);
                if (!texture) return null;
                const src = texture.getSourceImage();
                const canvas = document.createElement('canvas');
                canvas.width = src.width;
                canvas.height = src.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(src, 0, 0);
                const imgData = ctx.getImageData(0, 0, src.width, src.height);
                return {
                    width: src.width,
                    height: src.height,
                    data: Array.from(imgData.data),
                };
            };

            return {
                titan: extractPixels('enemy_boss_titan'),
                dragon: extractPixels('enemy_boss_dragon'),
                specter: extractPixels('enemy_boss_specter'),
            };
        });

        await browser.close();

        if (!texturesData) {
            console.error('Failed to extract textures from game.');
            process.exit(1);
        }

        const bosses = [
            { key: 'boss_titan', name: 'Titán de Sillar', data: texturesData.titan },
            { key: 'boss_dragon', name: 'Ascua Primordial', data: texturesData.dragon },
            { key: 'boss_specter', name: 'Rey Velador', data: texturesData.specter },
        ];

        console.log('\nExporting boss sprite files:');

        for (const b of bosses) {
            if (!b.data) {
                console.warn(`  ⚠ No texture found for ${b.key}`);
                continue;
            }

            const { width, height, data } = b.data;
            const rgbaBuffer = Buffer.from(data);

            // 1. Save PNG file
            const png = new PNG({ width, height });
            rgbaBuffer.copy(png.data);
            const pngBuffer = PNG.sync.write(png);
            const pngPath = path.join(__dirname, `${b.key}.png`);
            fs.writeFileSync(pngPath, pngBuffer);
            console.log(`  ✓ ${b.name}: ${pngPath} (${width}×${height} PNG)`);

            // 2. Save Aseprite (.ase) file
            const aseBuffer = createAseFile(rgbaBuffer, width, height, b.name);
            const asePath = path.join(__dirname, `${b.key}.ase`);
            fs.writeFileSync(asePath, aseBuffer);
            console.log(`  ✓ ${b.name}: ${asePath} (${width}×${height} Aseprite)`);
        }

        console.log('\n¡Exportación completada con éxito!');
        console.log('Podés abrir cualquiera de los archivos .ase o .png directamente en Aseprite para editarlos.');
    } finally {
        server.kill();
    }
}

exportBosses().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
