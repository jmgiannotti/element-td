import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { VIEW_W, VIEW_H, SUPER } from './systems/Viewport.js';
import { installTextResolution } from './systems/Typography.js';

// Room reserved outside the canvas: the frame's border and glow, plus the row
// the size control occupies underneath it.
const RESERVE_X = 24;
const RESERVE_Y = 64;

const STORAGE_KEY = 'elemental-td:scale';

const dpr = () => window.devicePixelRatio || 1;

/**
 * ── Display scale ────────────────────────────────────────
 *
 * Measured in *physical* pixels per game pixel, because that is the grid the
 * screen actually has.
 *
 * Rounding to whole CSS pixels is not enough. Windows commonly runs at 125% or
 * 150%, and the browser multiplies again on the way to the panel — so a tidy CSS
 * 1:1 becomes a physical 1.25:1. Picking the number in physical pixels and
 * handing Phaser whatever fractional CSS zoom lands on it is what makes 125%
 * look identical to 100%.
 */

/** The largest scale that still fits the window. Usually fractional. */
function maxScale() {
    return Math.min(
        ((window.innerWidth - RESERVE_X) * dpr()) / VIEW_W,
        ((window.innerHeight - RESERVE_Y) * dpr()) / VIEW_H
    );
}

/**
 * Sizes the 4K buffer divides into evenly — 4×, 2× and 1× for SUPER of 4.
 *
 * These are the sizes worth aiming at. Halving or quartering the buffer is a
 * plain box average: each output pixel is the mean of an exact 2×2 or 4×4 block,
 * which reconstructs the smaller image with nothing invented and nothing
 * dropped. Any other size makes the filter straddle block boundaries, which is
 * still fine — that is what supersampling is for — but strictly softer.
 *
 * Largest first, so a search can take the first that fits.
 */
const CLEAN_SCALES = (() => {
    const out = [];
    for (let divisor = 1; divisor <= SUPER; divisor++) {
        if (SUPER % divisor === 0) out.push(SUPER / divisor);
    }
    return out;   // [4, 2, 1] for SUPER 4
})();

function isClean(scale) {
    return CLEAN_SCALES.some(s => Math.abs(s - scale) < 0.005);
}

/** The largest artefact-free size that fits the window. */
function crispScale() {
    const max = maxScale();
    return CLEAN_SCALES.find(s => s <= max + 1e-6) ?? max;
}

/** Snapped so the canvas spans a whole number of physical pixels. */
function quantize(scale) {
    return Math.round(VIEW_W * scale) / VIEW_W;
}

/** null means "follow the crisp size as the window changes". */
function readStoredScale() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const n = parseFloat(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;   // private mode, or a sandbox with no storage
    }
}

function writeStoredScale(scale) {
    try {
        if (scale === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, String(scale));
    } catch {
        // Nothing to do — the preference just will not survive a reload.
    }
}

// The buffer the game is rendered into, before the browser resizes it to taste.
const initialScale = quantize(readStoredScale() ?? crispScale());

const config = {
    type: Phaser.AUTO,
    // The supersampled buffer, sized explicitly. `resolution: 4` was the obvious
    // way to ask for this and does nothing — Phaser dropped the option in 3.16
    // and 4.x ignores it silently, leaving a 920×480 canvas that just gets
    // stretched. The cameras are zoomed by the same factor (see Viewport.js), so
    // the game's own coordinates stay 920×480 regardless of what is set here.
    width: VIEW_W * SUPER,
    height: VIEW_H * SUPER,
    parent: 'game-container',
    // Inside the buffer the art is magnified by a whole number, so nearest is
    // right here: it is what keeps each game pixel a uniform block. The smoothing
    // happens afterwards, when the browser takes the buffer down to size.
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#1a1a2e',
    scene: [BootScene, GameScene, UIScene],
    scale: {
        mode: Phaser.Scale.NONE,
        zoom: initialScale / (SUPER * dpr()),
        autoCenter: Phaser.Scale.NO_CENTER,
        expandParent: false,
    },
};

/**
 * Puts a chosen display scale on screen by setting the CSS zoom.
 *
 * The zoom divides by SUPER because the canvas is already SUPER times the world:
 * `scale` is what the player asked for in physical pixels per *game* pixel, and
 * Phaser applies zoom to the buffer's dimensions.
 */
function applyScale(game, scale) {
    const zoom = scale / (SUPER * dpr());
    if (Math.abs(game.scale.zoom - zoom) > 1e-6) game.scale.setZoom(zoom);

    // Nearest-neighbour is only correct when the buffer lands on the screen one
    // pixel to one pixel, which happens at exactly SUPER. Everywhere else the
    // browser's smooth downscale is the entire point of rendering large.
    game.canvas.classList.toggle('crisp', Math.abs(scale - SUPER) < 1e-6);
}

/**
 * Wires the size slider to the scale above and keeps the two in agreement when
 * the window, the monitor or the browser's own zoom changes underneath them.
 */
function installSizeControl(game) {
    const range = document.getElementById('size-range');
    const ticks = document.getElementById('size-ticks');
    const readout = document.getElementById('size-readout');
    const crispBtn = document.getElementById('size-crisp');
    const fillBtn = document.getElementById('size-fill');
    if (!range) return;

    // null → track the crisp size; a number → the size the player chose.
    let chosen = readStoredScale();

    const effective = () => quantize(Math.min(chosen ?? crispScale(), maxScale()));

    /** Ticks at the artefact-free stops, so they are findable by feel. */
    const buildTicks = (max) => {
        ticks.textContent = '';
        for (const s of CLEAN_SCALES) {
            if (s > max + 1e-6) continue;
            const opt = document.createElement('option');
            opt.value = String(s);
            opt.label = `${s}x`;
            ticks.appendChild(opt);
        }
    };

    const render = () => {
        const max = maxScale();
        const scale = effective();

        range.min = String(Math.min(1, max).toFixed(2));
        range.max = String(max.toFixed(2));
        range.value = String(scale);
        buildTicks(max);

        applyScale(game, scale);

        const w = Math.round(VIEW_W * scale);
        const h = Math.round(VIEW_H * scale);
        const clean = isClean(scale);
        // The buffer is always 4K now, so naming it on every size would say
        // nothing. What varies — and what the player can act on — is whether the
        // reduction divides evenly or has to interpolate.
        const ratio = SUPER / scale;
        readout.textContent = clean
            ? `${w}x${h}  ${scale.toFixed(2)}x  exacto (4K/${Math.round(ratio)})`
            : `${w}x${h}  ${scale.toFixed(2)}x  4K interpolado`;
        readout.dataset.crisp = clean ? 'yes' : 'no';
    };

    range.addEventListener('input', () => {
        chosen = parseFloat(range.value);
        writeStoredScale(chosen);
        render();
    });

    crispBtn.addEventListener('click', () => {
        // Back to following the window rather than pinning a number, so a later
        // resize keeps finding the best one-to-one size on its own.
        chosen = null;
        writeStoredScale(null);
        render();
    });

    fillBtn.addEventListener('click', () => {
        chosen = maxScale();
        writeStoredScale(chosen);
        render();
    });

    // Covers window resizes, moving to a monitor with a different scale factor,
    // and the browser's own zoom — all of which move devicePixelRatio or the
    // viewport, and all of which fire this.
    window.addEventListener('resize', render);

    render();
}

/**
 * Phaser measures a Text object once, at construction, and sizes its canvas to
 * that measurement. Boot before Press Start 2P has arrived and every label
 * created in a scene's create() is sized for the fallback font, then repainted
 * with wider glyphs that spill outside the canvas — which is why the longer
 * sidebar lines came out visibly crammed.
 *
 * A webfont is only fetched once something renders in it, so `fonts.ready`
 * alone can resolve before the request is even made: ask for the face first.
 * The race is there so a slow or blocked CDN degrades to the system font
 * instead of hanging on a black page.
 */
async function boot() {
    try {
        await Promise.race([
            document.fonts.load('10px "Press Start 2P"').then(() => document.fonts.ready),
            new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
    } catch {
        // Offline or the face failed to load — start anyway.
    }
    // Before the game exists, so the very first label a scene creates already
    // rasterises at the buffer's resolution.
    installTextResolution();

    const game = new Phaser.Game(config);
    window.game = game;
    installSizeControl(game);
}

boot();
