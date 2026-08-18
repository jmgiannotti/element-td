import * as Phaser from 'phaser';
import {
    ramp, makeRng, pick, ellipse, taper, teardrop, profile, rough,
    volume, blit, line, groundShadow, edgePixel,
} from '../systems/Pixels.js';
import {
    EL, STONE, STONE_HI, MARBLE, BASALT, GOLD, BANNER, SOUL, GRASS, ROAD,
} from '../data/Palette.js';
import {
    DEFAULT_LOOK, LANTERN_TIERS, POSE_NAMES, HERO_GLOW_KEY, HERO_SLASH_KEY,
    bakeHeroTexture, composedHeroKey, drawLanternGlow, drawSlash,
} from '../data/HeroLook.js';
import { HERO_SPRITE } from '../data/HeroSprite.js';
import { COIN_SPRITE } from '../data/CoinSprite.js';
import { MANA_SPRITE } from '../data/ManaSprite.js';
import { SPELLS, SPELL_ORDER } from '../data/SpellData.js';

/**
 * BootScene — generates ALL pixel-art textures at runtime. No external assets.
 *
 * ART DIRECTION — "Runas Arcanas"
 *
 *  · ONE PIXEL DENSITY. A texel is a world pixel everywhere: terrain tiles are
 *    32×32 and so is every creature and building, all drawn at scale 1. Nothing
 *    on the board has chunkier pixels than anything beside it.
 *  · ONE LIGHT, from the top-left. Lit faces, cast shadows and rim highlights
 *    all agree on it, which is most of what makes a set of sprites look drawn
 *    by the same hand.
 *  · NO FREEHAND COLOUR. Every element owns a five-stop ramp (EL); every piece
 *    of masonry the same stone ramp. A sprite is assembled out of ramp stops,
 *    never out of a colour invented for that one sprite.
 *  · OUTLINES ARE THE SPRITE'S OWN DARKEST STOP, not black — a shape then reads
 *    against the dark forest without punching a hole in it.
 *  · SILHOUETTE FIRST. Each tower is a different shape before it is a different
 *    colour — basin, spire, brazier, menhir, shard, rod, cone, cauldron — so
 *    the board stays readable with the colour turned off.
 */

// How many interchangeable variants exist per terrain texture family.
// GameScene picks one per cell from a positional hash so the map looks
// varied but stays identical between renders of the same cell.
export const GRASS_VARIANTS = 8;
export const DIRT_VARIANTS = 6;
export const EDGE_VARIANTS = 2;
export const RUT_VARIANTS = 2;
export const BREAKABLE_VARIANTS = 3;

export const TOWER_KEYS = ['water', 'air', 'fire', 'earth', 'ice', 'storm', 'lava', 'mud'];
const ENEMY_KEYS = ['slime', 'golem', 'specter', 'dragon'];
const SIDES = ['top', 'bottom', 'left', 'right'];

/** Every texture key the game can request once BootScene has finished. */
export function expectedTextureKeys() {
    const keys = ['hero_shadow', 'mana_mote', 'tile_barricade',
        'gate_spawn', 'gate_exit', HERO_GLOW_KEY, HERO_SLASH_KEY,
        'spell_moon', 'spell_moon_ring',
        'btn_bg', 'btn_bg_sel', 'btn_bg_off', 'btn_build', 'btn_build_sel'];

    // One icon per spell, named off the table so a new spell fails the boot
    // check loudly instead of showing Phaser's placeholder square on a button.
    for (const key of SPELL_ORDER) keys.push(SPELLS[key].icon);

    // Listed so the boot check catches a data URI that did not decode. The
    // hero still runs if this is missing — it falls back to the composed
    // sprite — but silently wearing the wrong art is worth a warning.
    if (HERO_SPRITE.enabled) keys.push(HERO_SPRITE.key);
    keys.push(COIN_SPRITE.key);

    // The starting look is pre-baked across every lantern tier and every pose:
    // both change several times a wave, and a first-time bake mid-swing would
    // be a stutter at exactly the wrong moment. Everything the hero grows into
    // later bakes on demand instead. Baked even while the imported sprite is
    // switched on — they are what it falls back to, and fifteen 32×32 textures
    // is a cheap price for the swap being free to undo.
    for (const tier of LANTERN_TIERS) {
        for (const pose of POSE_NAMES) {
            keys.push(composedHeroKey({ ...DEFAULT_LOOK, lantern: tier }, pose));
        }
    }

    for (let v = 0; v < GRASS_VARIANTS; v++) keys.push(`grass_${v}`);
    for (let v = 0; v < DIRT_VARIANTS; v++) keys.push(`dirt_${v}`);
    for (let v = 0; v < RUT_VARIANTS; v++) keys.push(`rut_h_${v}`, `rut_v_${v}`);
    for (let v = 0; v < BREAKABLE_VARIANTS; v++) keys.push(`breakable_${v}`);
    for (const side of SIDES) {
        keys.push(`scat_${side}`);
        for (let v = 0; v < EDGE_VARIANTS; v++) keys.push(`edge_${side}_${v}`);
    }
    for (const c of ['tl', 'tr', 'bl', 'br']) keys.push(`corner_${c}`);
    for (const el of TOWER_KEYS) keys.push(`tower_${el}`, `proj_${el}`, `temple_${el}`);
    for (const e of ENEMY_KEYS) keys.push(`enemy_${e}`);

    return keys;
}

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    /**
     * The one thing in the game that is loaded rather than drawn: the hand-drawn
     * hero strip. It goes through the loader as a data URI so there is still no
     * external file — and so it is decoded and registered before create() runs,
     * which is the contract everything downstream relies on.
     *
     * As a spritesheet rather than an image, always: `frameCount` is 1 for
     * single-frame art, and a one-frame sheet behaves exactly like an image
     * while keeping one code path here.
     */
    preload() {
        if (HERO_SPRITE.enabled && !this.textures.exists(HERO_SPRITE.key)) {
            this.load.spritesheet(HERO_SPRITE.key, HERO_SPRITE.png, {
                frameWidth: 32, frameHeight: 32,
            });
        }
        if (!this.textures.exists(COIN_SPRITE.key)) {
            this.load.image(COIN_SPRITE.key, COIN_SPRITE.png);
        }
        if (!this.textures.exists(MANA_SPRITE.key)) {
            this.load.image(MANA_SPRITE.key, MANA_SPRITE.png);
        }
    }

    create() {
        this._generateAll();

        // A texture that fails to register renders as Phaser's placeholder — a
        // black square with a green diagonal — with no error anywhere. Verify
        // and retry once rather than shipping that to the screen.
        let missing = this._missingTextures();
        if (missing.length > 0) {
            console.warn('[BootScene] Texturas no registradas, reintentando:', missing);
            this._generateAll();
            missing = this._missingTextures();
            if (missing.length > 0) {
                console.error('[BootScene] Siguen faltando texturas:', missing);
            }
        }

        this.scene.start('TitleScene');
    }

    _generateAll() {
        this._generateGrass();
        this._generateDirt();
        this._generateRuts();
        this._generateEdges();
        this._generateCorners();
        this._generateScatter();
        this._generateObstacles();
        this._generateTowers();
        this._generateTemples();
        this._generateEnemies();
        this._generateHero();
        this._generateProjectiles();
        this._generateManaMote();
        this._generateSpells();
        this._generateGates();
        this._generateUI();
    }

    /** Every key the game can ask for at runtime, minus the ones that exist. */
    _missingTextures() {
        return expectedTextureKeys().filter(k => !this.textures.exists(k));
    }

    // ─── Helpers ────────────────────────────────────────
    _draw(key, w, h, fn) {
        const g = this.add.graphics();
        fn(g);
        g.generateTexture(key, w, h);
        g.destroy();
    }

    // ─── Grass — dark mystical forest floor (32×32) ─────
    _generateGrass() {
        for (let v = 0; v < GRASS_VARIANTS; v++) {
            this._draw(`grass_${v}`, 32, 32, (g) => {
                const rnd = makeRng(0xA11CE + v * 7919);

                g.fillStyle(GRASS.base);
                g.fillRect(0, 0, 32, 32);

                // Broad, soft turf patches, kept faint on purpose. Anything
                // with real contrast here draws the 32px tile boundary for the
                // player, and the ground must never compete with a building.
                for (let i = 0; i < 5; i++) {
                    const shade = rnd() < 0.5 ? GRASS.mid : GRASS.deep;
                    const w = 9 + Math.floor(rnd() * 13);
                    const h = 7 + Math.floor(rnd() * 9);
                    const x = Math.floor(rnd() * 32) - (w >> 1);
                    const y = Math.floor(rnd() * 32) - (h >> 1);
                    // Rounded, not rectangular — the corners are what read as a
                    // stamp when a tile repeats across the lawn.
                    for (let k = 0; k < h; k++) {
                        const t = 1 - Math.abs((k / (h - 1)) * 2 - 1);
                        const inset = Math.round((1 - t) * 3);
                        g.fillStyle(shade, 0.45);
                        g.fillRect(x + inset, y + k, Math.max(1, w - inset * 2), 1);
                    }
                }

                // Ordered dither over the patches, so the noise has a weave
                // rather than a spatter. All of the lawn's readable texture
                // lives at this scale: detail smaller than a tile is what a
                // repeated tile can carry without announcing its own edges.
                for (let y = 0; y < 32; y++) {
                    for (let x = (y % 2) * 2; x < 32; x += 4) {
                        const r = rnd();
                        if (r < 0.34) { g.fillStyle(GRASS.light, 0.55); g.fillRect(x, y, 1, 1); }
                        else if (r < 0.60) { g.fillStyle(GRASS.deep, 0.55); g.fillRect(x, y, 1, 1); }
                    }
                }
                for (let y = 1; y < 32; y += 2) {
                    for (let x = ((y >> 1) % 2) * 2 + 1; x < 32; x += 4) {
                        if (rnd() < 0.22) { g.fillStyle(GRASS.mid, 0.6); g.fillRect(x, y, 1, 1); }
                    }
                }

                // Blade tufts: two pixels and a lit tip, scattered thickly.
                for (let i = 0; i < 24; i++) {
                    const bx = 1 + Math.floor(rnd() * 30);
                    const by = 1 + Math.floor(rnd() * 29);
                    g.fillStyle(GRASS.deep); g.fillRect(bx, by + 1, 1, 2);
                    g.fillStyle(rnd() < 0.3 ? GRASS.lit : GRASS.light);
                    g.fillRect(bx, by, 1, 1);
                }

                // Shadow pockets — the ground has depth or it has nothing.
                for (let i = 0; i < 7; i++) {
                    const sx = Math.floor(rnd() * 30);
                    const sy = Math.floor(rnd() * 30);
                    g.fillStyle(GRASS.shadow, 0.45);
                    g.fillRect(sx, sy, 2, 1); g.fillRect(sx + 1, sy + 1, 2, 1);
                }

                // Landmarks, on three of the eight variants only. One in eight
                // tiles carrying a visible object is already close to the limit:
                // beyond that the lawn stops being ground and becomes a pattern.
                if (v === 5) this._mushrooms(g, rnd);
                else if (v === 6) this._crystalShard(g, rnd);
                else if (v === 7) this._ferns(g, rnd);
            });
        }
    }

    /** A small clump of toadstools, in the violet the UI spends on maná. */
    _mushrooms(g, rnd) {
        const x = 8 + Math.floor(rnd() * 16);
        const y = 12 + Math.floor(rnd() * 10);
        for (const [ox, oy, w] of [[0, 0, 4], [5, 2, 3]]) {
            const cx = x + ox;
            const cy = y + oy;
            g.fillStyle(GRASS.shadow, 0.6); g.fillRect(cx, cy + 3, w, 1);
            g.fillStyle(0xc9b8e4, 0.85); g.fillRect(cx + 1, cy + 2, 1, 2);
            g.fillStyle(0x3d1a66); g.fillRect(cx, cy + 1, w, 1);
            g.fillStyle(0x6d34a8); g.fillRect(cx, cy, w, 1);
            g.fillStyle(0x9a63d4); g.fillRect(cx + 1, cy, w - 2, 1);
        }
    }

    /** A single shard pushing up out of the turf. Muted — it is scenery. */
    _crystalShard(g, rnd) {
        const x = 11 + Math.floor(rnd() * 11);
        const y = 14 + Math.floor(rnd() * 8);
        const cold = ramp(0x0a2e3a, 0x156072, 0x2b93a5, 0x62c2cf, 0xa8e8ef);
        g.fillStyle(GRASS.shadow, 0.6); g.fillRect(x - 1, y + 4, 5, 1);
        volume(g, profile(y, [[x + 1, x + 1], [x, x + 2], [x, x + 2], [x, x + 3], [x + 1, x + 2]]),
            cold, { spec: 0.22 });
        g.fillStyle(0xd8f6fa, 0.7); g.fillRect(x + 1, y + 1, 1, 1);
    }

    /** Denser undergrowth: taller blades, no object. */
    _ferns(g, rnd) {
        for (let i = 0; i < 12; i++) {
            const x = 3 + Math.floor(rnd() * 26);
            const y = 5 + Math.floor(rnd() * 21);
            g.fillStyle(GRASS.shadow, 0.55); g.fillRect(x, y + 1, 1, 3);
            g.fillStyle(GRASS.mid); g.fillRect(x, y, 1, 2);
            g.fillStyle(GRASS.light, 0.8); g.fillRect(x, y, 1, 1);
            g.fillStyle(GRASS.deep, 0.7); g.fillRect(x + 1, y + 2, 1, 1);
        }
    }

    // ─── The road (32×32) ───────────────────────────────
    // Warm gravel with laid flagstones set into it. The stones are inset rather
    // than tiled edge to edge on purpose: a paving pattern that meets the tile
    // border turns the 32px grid into a visible lattice across the whole map.
    _generateDirt() {
        for (let v = 0; v < DIRT_VARIANTS; v++) {
            this._draw(`dirt_${v}`, 32, 32, (g) => {
                const rnd = makeRng(0xD137 + v * 6151);

                g.fillStyle(ROAD.deep);
                g.fillRect(0, 0, 32, 32);

                // Packed gravel bed
                for (let y = 0; y < 32; y++) {
                    for (let x = 0; x < 32; x++) {
                        const r = rnd();
                        g.fillStyle(r < 0.30 ? ROAD.base : r < 0.52 ? ROAD.mid : r < 0.6 ? ROAD.joint : ROAD.deep);
                        g.fillRect(x, y, 1, 1);
                    }
                }

                // Two or three flagstones, never touching an edge.
                const stones = 2 + (v % 2);
                const placed = [];
                for (let i = 0; i < stones * 4 && placed.length < stones; i++) {
                    const w = 9 + Math.floor(rnd() * 7);
                    const h = 7 + Math.floor(rnd() * 5);
                    const x = 2 + Math.floor(rnd() * (27 - w));
                    const y = 2 + Math.floor(rnd() * (27 - h));
                    if (placed.some(p => x < p.x + p.w + 2 && x + w + 2 > p.x &&
                        y < p.y + p.h + 2 && y + h + 2 > p.y)) continue;
                    placed.push({ x, y, w, h });
                    this._flagstone(g, x, y, w, h, rnd);
                }

                // Hairline cracks wandering across the gravel
                for (let i = 0; i < 2; i++) {
                    let cx = 2 + Math.floor(rnd() * 28);
                    let cy = 2 + Math.floor(rnd() * 28);
                    for (let k = 0; k < 6 + Math.floor(rnd() * 6); k++) {
                        g.fillStyle(ROAD.joint, 0.7);
                        g.fillRect(cx, cy, 1, 1);
                        cx += rnd() < 0.55 ? 1 : 0;
                        cy += rnd() < 0.5 ? 1 : -1;
                        if (cx > 30 || cy < 1 || cy > 30) break;
                    }
                }

                // Moss creeping out of the joints, and pale worn scuffs
                for (let i = 0; i < 5; i++) {
                    g.fillStyle(GRASS.deep, 0.30);
                    g.fillRect(Math.floor(rnd() * 30), Math.floor(rnd() * 30), 2, 1);
                }
                for (let i = 0; i < 4; i++) {
                    g.fillStyle(ROAD.lit, 0.22);
                    g.fillRect(Math.floor(rnd() * 26), Math.floor(rnd() * 30), 3 + Math.floor(rnd() * 4), 1);
                }
            });
        }
    }

    /** One laid stone: bevelled to the light, chipped at every corner. */
    _flagstone(g, x, y, w, h, rnd) {
        g.fillStyle(ROAD.joint); g.fillRect(x - 1, y - 1, w + 2, h + 2);
        g.fillStyle(ROAD.base);  g.fillRect(x, y, w, h);

        for (let i = 0; i < w * h * 0.35; i++) {
            g.fillStyle(rnd() < 0.5 ? ROAD.mid : ROAD.deep);
            g.fillRect(x + Math.floor(rnd() * w), y + Math.floor(rnd() * h), 1, 1);
        }

        g.fillStyle(ROAD.light); g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
        g.fillStyle(ROAD.lit);   g.fillRect(x + 1, y, Math.max(2, w >> 2), 1);
        g.fillStyle(ROAD.deep);  g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
        g.fillStyle(ROAD.joint); g.fillRect(x + 1, y + h - 1, w - 2, 1);

        // Chipped corners, so no stone reads as a rectangle
        g.fillStyle(ROAD.joint);
        g.fillRect(x, y, 1, 1);
        g.fillRect(x + w - 1, y, 1, 1);
        g.fillRect(x, y + h - 1, 1, 1);
        g.fillRect(x + w - 1, y + h - 1, 1, 1);
    }

    // ─── Worn wheel tracks along the road ───────────────
    _generateRuts() {
        for (let v = 0; v < RUT_VARIANTS; v++) {
            for (const dir of ['h', 'v']) {
                this._draw(`rut_${dir}_${v}`, 32, 32, (g) => {
                    const rnd = makeRng(0xB00B + v * 131 + (dir === 'h' ? 7 : 19));

                    for (const off of [-7, 7]) {
                        for (let i = 0; i < 32; i++) {
                            const wob = Math.round(Math.sin((i + v * 5) * 0.26) * 1.3);
                            const j = 16 + off + wob;
                            if (dir === 'h') {
                                g.fillStyle(ROAD.joint, 0.40); g.fillRect(i, j, 1, 2);
                                g.fillStyle(ROAD.lit, 0.18); g.fillRect(i, j + 2, 1, 1);
                            } else {
                                g.fillStyle(ROAD.joint, 0.40); g.fillRect(j, i, 2, 1);
                                g.fillStyle(ROAD.lit, 0.18); g.fillRect(j + 2, i, 1, 1);
                            }
                        }
                    }

                    // Polish where the traffic actually falls
                    for (let i = 0; i < 10; i++) {
                        g.fillStyle(ROAD.lit, 0.14);
                        if (dir === 'h') g.fillRect(Math.floor(rnd() * 28), 8 + Math.floor(rnd() * 17), 4, 1);
                        else g.fillRect(8 + Math.floor(rnd() * 17), Math.floor(rnd() * 28), 1, 4);
                    }
                });
            }
        }
    }

    // ─── Forest lip overlaid on the road where it meets grass ───
    _generateEdges() {
        for (const side of SIDES) {
            for (let v = 0; v < EDGE_VARIANTS; v++) {
                this._draw(`edge_${side}_${v}`, 32, 32, (g) => {
                    const rnd = makeRng(0xED6E + v * 977 + side.charCodeAt(0) * 31);

                    for (let i = 0; i < 32; i++) {
                        let d = 2 + Math.round(
                            Math.sin((i + v * 9) * 0.55) + Math.sin((i + v * 3) * 0.21) * 1.4
                        );
                        if (rnd() < 0.18) d += 1;
                        d = Math.max(1, Math.min(5, d));

                        for (let k = 0; k < d; k++) {
                            // Lit crown, body, dark underside — the lip is a
                            // little bank of earth, not a flat green stripe.
                            const shade = k === d - 1 ? GRASS.shadow
                                : k === 0 ? (rnd() < 0.5 ? GRASS.light : GRASS.mid)
                                    : pick(rnd, [GRASS.base, GRASS.mid, GRASS.deep]);
                            edgePixel(g, side, i, k, shade);
                        }
                        // Shadow the overhang throws onto the road
                        edgePixel(g, side, i, d, 0x0a1a0e, 0.45);
                        edgePixel(g, side, i, d + 1, 0x0a1a0e, 0.22);
                    }

                    // Stray blades reaching over the paving
                    for (let i = 0; i < 7; i++) {
                        const p = Math.floor(rnd() * 32);
                        const k = 4 + Math.floor(rnd() * 3);
                        edgePixel(g, side, p, k, GRASS.light);
                        edgePixel(g, side, p, k - 1, GRASS.mid);
                    }
                });
            }
        }
    }

    // ─── Forest nubs for the inside corners of the road ─
    _generateCorners() {
        const spec = { tl: [0, 0], tr: [1, 0], bl: [0, 1], br: [1, 1] };
        for (const [name, [fx, fy]] of Object.entries(spec)) {
            this._draw(`corner_${name}`, 32, 32, (g) => {
                const rnd = makeRng(0xC0F1 + name.charCodeAt(0) * 313 + name.charCodeAt(1) * 17);
                const px = (x) => (fx ? 31 - x : x);
                const py = (y) => (fy ? 31 - y : y);
                const rows = [5, 5, 4, 3, 2];

                for (let y = 0; y < rows.length; y++) {
                    for (let x = 0; x < rows[y]; x++) {
                        g.fillStyle(y === 0 || x === 0
                            ? pick(rnd, [GRASS.mid, GRASS.light])
                            : pick(rnd, [GRASS.base, GRASS.mid, GRASS.deep]));
                        g.fillRect(px(x), py(y), 1, 1);
                    }
                    g.fillStyle(GRASS.shadow); g.fillRect(px(rows[y]), py(y), 1, 1);
                    g.fillStyle(0x0a1a0e, 0.35); g.fillRect(px(rows[y] + 1), py(y), 1, 1);
                }
            });
        }
    }

    // ─── Gravel spilled onto the verge ──────────────────
    _generateScatter() {
        for (const side of SIDES) {
            this._draw(`scat_${side}`, 32, 32, (g) => {
                const rnd = makeRng(0x5CA7 + side.charCodeAt(0) * 61);
                for (let i = 0; i < 20; i++) {
                    const p = Math.floor(rnd() * 32);
                    const k = Math.floor(rnd() * 6);
                    const a = Math.max(0.07, 0.5 - k * 0.07);
                    edgePixel(g, side, p, k, pick(rnd, [ROAD.base, ROAD.deep, ROAD.mid]), a);
                }
            });
        }
    }

    // ─── Breakable boulders & the barricade ─────────────
    _generateObstacles() {
        for (let v = 0; v < BREAKABLE_VARIANTS; v++) {
            this._draw(`breakable_${v}`, 32, 32, (g) => {
                const rnd = makeRng(0xB4EA + v * 4093);

                groundShadow(g, 16, 28, 12, 3, 0.3);

                // A boulder is an ellipse with its silhouette chewed away, so
                // the three variants share a mass and differ in their chips.
                const rock = rough(ellipse(16, 17, 12, 11), 0xB4EA + v, 1);
                volume(g, rock, BASALT, { lu: 0.3, lv: 0.22, spec: 0.15 });

                // Facets: two flat planes catching the light, which is what
                // stops a rock from reading as a potato.
                g.fillStyle(BASALT.light);
                g.fillRect(9, 9, 7, 3); g.fillRect(8, 12, 5, 2);
                g.fillStyle(BASALT.glow);
                g.fillRect(10, 9, 4, 1);

                // Fissure — the seam the enemies are hammering at
                let cx = 13 + Math.floor(rnd() * 5);
                let cy = 8;
                for (let k = 0; k < 5; k++) {
                    const len = 3 + Math.floor(rnd() * 4);
                    for (let s = 0; s < len; s++) {
                        g.fillStyle(BASALT.deep); g.fillRect(cx, cy, 1, 1);
                        g.fillStyle(0x9d6bff, 0.35); g.fillRect(cx + 1, cy, 1, 1);
                        cy++;
                    }
                    cx += rnd() < 0.5 ? -1 : 1;
                    if (cy > 24) break;
                }

                // Arcane crystals wedged in the cracks, plus moss on the north face
                for (let i = 0; i < 4; i++) {
                    const gx = 7 + Math.floor(rnd() * 18);
                    const gy = 10 + Math.floor(rnd() * 12);
                    g.fillStyle(EL.storm.mid, 0.5); g.fillRect(gx - 1, gy - 1, 3, 3);
                    g.fillStyle(EL.storm.light); g.fillRect(gx, gy, 1, 2);
                    g.fillStyle(EL.storm.glow); g.fillRect(gx, gy, 1, 1);
                }
                for (let i = 0; i < 6; i++) {
                    g.fillStyle(GRASS.deep, 0.5);
                    g.fillRect(6 + Math.floor(rnd() * 18), 20 + Math.floor(rnd() * 6), 2, 1);
                }
            });
        }

        // Barricade — a rune-locked gate of granite and gold. Reads as "closed"
        // at a glance, which is the only thing it has to say.
        this._draw('tile_barricade', 32, 32, (g) => {
            groundShadow(g, 16, 29, 12, 2, 0.28);

            // Two posts
            for (const x of [3, 24]) {
                g.fillStyle(STONE.deep);  g.fillRect(x, 3, 5, 26);
                g.fillStyle(STONE.mid);   g.fillRect(x + 1, 4, 3, 24);
                g.fillStyle(STONE.light); g.fillRect(x + 1, 4, 1, 24);
                g.fillStyle(STONE.dark);  g.fillRect(x + 3, 4, 1, 24);
                g.fillStyle(STONE.glow);  g.fillRect(x + 1, 4, 3, 1);
                g.fillStyle(STONE.deep);  g.fillRect(x + 1, 15, 3, 1);
            }

            // Three cross beams
            for (const y of [7, 15, 23]) {
                g.fillStyle(STONE.deep);  g.fillRect(2, y, 28, 6);
                g.fillStyle(STONE.mid);   g.fillRect(3, y + 1, 26, 4);
                g.fillStyle(STONE.light); g.fillRect(3, y + 1, 26, 1);
                g.fillStyle(STONE.dark);  g.fillRect(3, y + 4, 26, 1);
                for (let x = 6; x < 27; x += 6) {
                    g.fillStyle(STONE.deep); g.fillRect(x, y + 1, 1, 4);
                }
            }

            // Gold rivets and the seal in the middle
            for (const [x, y] of [[4, 8], [26, 8], [4, 24], [26, 24]]) {
                g.fillStyle(GOLD.dark);  g.fillRect(x, y, 3, 3);
                g.fillStyle(GOLD.light); g.fillRect(x, y, 2, 2);
                g.fillStyle(GOLD.glow);  g.fillRect(x, y, 1, 1);
            }
            g.fillStyle(GOLD.mid, 0.22); g.fillRect(11, 12, 10, 10);
            volume(g, profile(12, [
                [15, 16], [14, 17], [13, 18], [12, 19], [13, 18], [14, 17], [15, 16],
            ]), GOLD, { spec: 0.22 });
        });
    }

    // ─── Towers (32×32) ─────────────────────────────────
    // Every tower is one runic pedestal — cornice, shaft, footing, and the
    // element's own rune carved into the front — carrying a differently shaped
    // manifestation of its element. Shared base, distinct silhouette.
    _generateTowers() {
        const heads = {
            water: (g) => this._headWater(g),
            air: (g) => this._headAir(g),
            fire: (g) => this._headFire(g),
            earth: (g) => this._headEarth(g),
            ice: (g) => this._headIce(g),
            storm: (g) => this._headStorm(g),
            lava: (g) => this._headLava(g),
            mud: (g) => this._headMud(g),
        };

        for (const el of TOWER_KEYS) {
            this._draw(`tower_${el}`, 32, 32, (g) => {
                this._pedestal(g, EL[el]);
                heads[el](g);
            });
        }
    }

    /** The pedestal all eight towers stand on. */
    _pedestal(g, p) {
        groundShadow(g, 16, 29, 13, 3, 0.3);

        // Footing, rows 25-29
        g.fillStyle(STONE.deep);  g.fillRect(5, 24, 22, 6);
        g.fillStyle(STONE.mid);   g.fillRect(6, 25, 20, 4);
        g.fillStyle(STONE.light); g.fillRect(6, 25, 20, 1);
        g.fillStyle(STONE.dark);  g.fillRect(6, 28, 20, 1);
        g.fillStyle(STONE.light, 0.55); g.fillRect(6, 26, 1, 2);
        g.fillStyle(STONE.deep);  g.fillRect(25, 26, 1, 2);
        for (const x of [11, 16, 21]) {
            g.fillStyle(STONE.deep); g.fillRect(x, 25, 1, 4);
        }

        // Shaft, rows 20-24
        g.fillStyle(STONE.deep);  g.fillRect(9, 19, 14, 6);
        g.fillStyle(STONE.mid);   g.fillRect(10, 20, 12, 4);
        g.fillStyle(STONE.light); g.fillRect(10, 20, 2, 4);
        g.fillStyle(STONE.dark);  g.fillRect(20, 20, 2, 4);
        g.fillStyle(STONE.deep);  g.fillRect(10, 24, 12, 1);

        // The element's rune, carved and lit from within. Same slot on all
        // eight towers: it is the badge that says which of the eight this is.
        g.fillStyle(p.mid, 0.20); g.fillRect(12, 19, 8, 6);
        g.fillStyle(p.deep); g.fillRect(14, 20, 4, 4);
        blit(g, [
            '..aa..',
            '.abba.',
            'abccba',
            '.abba.',
            '..aa..',
        ], { a: p.dark, b: p.mid, c: p.glow }, 13, 19);

        // Cornice, rows 16-18 — overhangs the shaft, which is what makes the
        // pedestal read as built rather than extruded.
        g.fillStyle(STONE.deep);  g.fillRect(7, 16, 18, 4);
        g.fillStyle(STONE.glow);  g.fillRect(8, 16, 16, 1);
        g.fillStyle(STONE.light); g.fillRect(8, 17, 16, 1);
        g.fillStyle(STONE.mid);   g.fillRect(8, 18, 16, 1);
        g.fillStyle(STONE.dark);  g.fillRect(8, 19, 16, 1);
        g.fillStyle(0x000000, 0.25); g.fillRect(9, 19, 14, 1);
    }

    /** WATER — a brimming basin under a hovering drop. */
    _headWater(g) {
        const p = EL.water;
        // Basin
        volume(g, taper(10, 15, 9, 6, 16, 1.4), STONE_HI, { lu: 0.28, lv: 0.2 });
        // The water it holds, brimming over the lip
        volume(g, ellipse(16, 11, 7, 1), p, { outline: false, spec: 0.24 });
        g.fillStyle(p.mid); g.fillRect(8, 10, 16, 1);
        g.fillStyle(p.light); g.fillRect(9, 11, 8, 1);
        g.fillStyle(p.glow, 0.85); g.fillRect(10, 11, 4, 1);

        // The drop, held above the basin
        volume(g, teardrop(16, 0, 9, 6), p, { lu: 0.3, lv: 0.3, spec: 0.19 });
        g.fillStyle(p.glow); g.fillRect(13, 4, 2, 3); g.fillRect(14, 3, 1, 1);

        // Falling beads
        g.fillStyle(p.light); g.fillRect(7, 7, 1, 2); g.fillRect(24, 5, 1, 2);
        g.fillStyle(p.glow, 0.7); g.fillRect(7, 7, 1, 1); g.fillRect(24, 5, 1, 1);
    }

    /** AIR — a slender obelisk with wind streaking past it. */
    _headAir(g) {
        const p = EL.air;
        volume(g, taper(5, 15, 2, 5, 16, 1.5), p, { lu: 0.25, lv: 0.3, spec: 0.13 });

        // Carved flutes down the shaft
        g.fillStyle(p.glow, 0.5); g.fillRect(14, 8, 1, 7);
        g.fillStyle(p.deep, 0.6); g.fillRect(18, 8, 1, 7);
        for (const y of [8, 11, 14]) {
            g.fillStyle(p.deep, 0.45); g.fillRect(13, y, 6, 1);
        }

        // The orb it holds aloft
        volume(g, ellipse(16, 2, 3, 2), p, { spec: 0.22 });
        g.fillStyle(0xffffff); g.fillRect(14, 1, 1, 1);

        // Wind, curling past on both sides. Short and close in: at this size a
        // long streak stops reading as motion and starts reading as a shelf.
        const gust = (x, y, len, dir) => {
            g.fillStyle(p.mid, 0.7);  g.fillRect(x, y, len, 1);
            g.fillStyle(p.light, 0.9); g.fillRect(dir > 0 ? x + len - 3 : x, y, 3, 1);
            g.fillStyle(p.mid, 0.45); g.fillRect(dir > 0 ? x + 2 : x - 1, y + 1, 2, 1);
        };
        gust(6, 6, 5, -1);
        gust(21, 9, 5, 1);
        gust(7, 12, 4, -1);
    }

    /** FIRE — an open brazier with a flame standing in it. */
    _headFire(g) {
        const p = EL.fire;
        // Pan
        volume(g, taper(11, 15, 9, 5, 16, 1.3), STONE_HI, { lu: 0.28, lv: 0.2 });
        g.fillStyle(STONE_HI.glow); g.fillRect(7, 11, 18, 1);
        // Embers in it
        g.fillStyle(p.dark);  g.fillRect(8, 11, 16, 2);
        g.fillStyle(p.mid);   g.fillRect(10, 11, 12, 1);
        g.fillStyle(p.light); g.fillRect(13, 11, 5, 1);

        // Flame. No outline — fire is the one thing on the board that emits
        // rather than reflects, so it gets a hot core and a soft dark fringe.
        volume(g, teardrop(16, 0, 12, 6), p, { outline: false, lu: 0.42, lv: 0.55, spec: 0.2, band: 0.2 });
        volume(g, teardrop(16, 3, 11, 3), ramp(p.mid, p.light, p.glow, p.glow, 0xffffff),
            { outline: false, lu: 0.45, lv: 0.6, spec: 0.3, band: 0.3 });

        // Sparks lifting off, and the light the fire throws on its own pedestal
        g.fillStyle(p.light); g.fillRect(11, 2, 1, 1); g.fillRect(21, 5, 1, 1);
        g.fillStyle(p.glow, 0.8); g.fillRect(20, 1, 1, 1);
        g.fillStyle(p.mid, 0.16); g.fillRect(8, 16, 16, 2);
    }

    /** EARTH — a rough menhir shot through with amber. */
    _headEarth(g) {
        const p = EL.earth;
        volume(g, rough(taper(1, 15, 4, 7, 16, 0.8), 0xEA27, 1), BASALT,
            { lu: 0.26, lv: 0.2, spec: 0.12 });

        // Cut planes. A standing stone is dressed, not rolled — without flats
        // it reads as a sack.
        g.fillStyle(BASALT.light); g.fillRect(13, 2, 5, 5); g.fillRect(11, 7, 5, 4);
        g.fillStyle(BASALT.glow);  g.fillRect(13, 2, 4, 1); g.fillRect(11, 7, 3, 1);
        g.fillStyle(BASALT.dark);  g.fillRect(19, 5, 3, 9);
        g.fillStyle(BASALT.deep);  g.fillRect(18, 4, 1, 11);

        // Strata — horizontal, because that is what says "sedimentary rock"
        // and what keeps this from reading as a boulder that rolled here.
        for (const y of [5, 9, 13]) {
            g.fillStyle(BASALT.deep, 0.7); g.fillRect(10, y, 12, 1);
            g.fillStyle(BASALT.light, 0.35); g.fillRect(10, y + 1, 12, 1);
        }

        // An ore seam broken open in the middle of the face. A blob of amber,
        // not a jagged streak: a streak here reads as lightning, which is the
        // storm tower's job.
        g.fillStyle(p.mid, 0.16); g.fillRect(11, 5, 11, 8);
        blit(g, [
            '..aaa...',
            '.abbba..',
            'abbccba.',
            'abbcbba.',
            '.abbbba.',
            '..abba..',
        ], { a: p.dark, b: p.mid, c: p.light }, 12, 6);
        g.fillStyle(p.glow); g.fillRect(15, 8, 2, 1); g.fillRect(15, 9, 1, 1);
        g.fillStyle(p.light); g.fillRect(19, 11, 1, 2);

        // Rubble at the foot
        g.fillStyle(BASALT.deep);  g.fillRect(6, 12, 4, 3); g.fillRect(23, 11, 4, 4);
        g.fillStyle(BASALT.mid);   g.fillRect(6, 12, 3, 1); g.fillRect(23, 11, 3, 1);
        g.fillStyle(BASALT.light); g.fillRect(6, 12, 1, 1); g.fillRect(23, 11, 1, 1);
    }

    /** ICE — a cluster of shards, the tallest reaching off the top. */
    _headIce(g) {
        const p = EL.ice;
        volume(g, taper(9, 15, 2, 4, 10, 1.2), p, { lu: 0.3, lv: 0.35, spec: 0.16 });
        volume(g, taper(7, 15, 2, 4, 23, 1.2), p, { lu: 0.3, lv: 0.35, spec: 0.16 });
        volume(g, taper(0, 15, 2, 6, 16, 1.25), p, { lu: 0.3, lv: 0.22, spec: 0.18 });

        // Facet edges — a crystal is a set of planes, so it needs hard lines
        g.fillStyle(p.glow); g.fillRect(14, 2, 1, 12);
        g.fillStyle(p.light, 0.8); g.fillRect(17, 4, 1, 10);
        g.fillStyle(p.deep, 0.6); g.fillRect(19, 6, 1, 9);
        g.fillStyle(0xffffff); g.fillRect(14, 3, 1, 3); g.fillRect(8, 12, 1, 2); g.fillRect(22, 10, 1, 2);

        // Frost settling on the cornice below
        g.fillStyle(p.light, 0.30); g.fillRect(9, 16, 14, 1);
    }

    /** STORM — a pylon holding a charged orb, arcing. */
    _headStorm(g) {
        const p = EL.storm;
        // Pylon, slim and dark, so the orb is what the eye lands on
        volume(g, taper(11, 15, 2, 5, 16, 1.4), p, { lu: 0.26, lv: 0.4, spec: 0.1 });
        g.fillStyle(p.light, 0.65); g.fillRect(14, 12, 1, 3);
        g.fillStyle(p.deep, 0.7); g.fillRect(18, 12, 1, 3);

        // Conductor rod between orb and pylon
        g.fillStyle(STONE_HI.deep);  g.fillRect(15, 8, 3, 4);
        g.fillStyle(STONE_HI.light); g.fillRect(15, 8, 1, 4);
        g.fillStyle(STONE_HI.mid);   g.fillRect(16, 8, 1, 4);
        // Prongs reaching up around the orb
        for (const [x, lit] of [[11, 1], [20, 0]]) {
            g.fillStyle(STONE_HI.deep); g.fillRect(x, 5, 2, 6);
            g.fillStyle(lit ? STONE_HI.light : STONE_HI.mid); g.fillRect(x, 5, 1, 6);
            g.fillStyle(p.glow); g.fillRect(x, 4, 2, 1);
        }

        // Charged orb, floating clear of the rod
        g.fillStyle(p.mid, 0.16); g.fillRect(9, 0, 14, 10);
        volume(g, ellipse(16, 4, 4, 4), p, { spec: 0.2 });
        g.fillStyle(p.glow); g.fillRect(15, 3, 3, 1); g.fillRect(16, 2, 1, 3);
        g.fillStyle(0xffffff, 0.9); g.fillRect(14, 2, 2, 1);

        // Bolts leaving the orb — zigzag, one pixel wide, with a violet halo
        const bolt = (pts) => {
            g.fillStyle(p.dark, 0.6);
            for (const [x, y] of pts) g.fillRect(x - 1, y, 3, 1);
            g.fillStyle(p.glow);
            for (const [x, y] of pts) g.fillRect(x, y, 1, 1);
        };
        bolt([[8, 2], [9, 3], [8, 4], [9, 5], [8, 6], [9, 7]]);
        bolt([[24, 3], [23, 4], [24, 5], [23, 6], [24, 7], [23, 8]]);
    }

    /** LAVA — a basalt cone with a molten crater. */
    _headLava(g) {
        const p = EL.lava;
        volume(g, taper(4, 15, 3, 10, 16, 1.05), BASALT, { lu: 0.3, lv: 0.28, spec: 0.13 });

        // Crater lip, then the mouth inside it
        g.fillStyle(BASALT.light); g.fillRect(12, 4, 8, 1);
        g.fillStyle(BASALT.glow);  g.fillRect(12, 4, 4, 1);
        volume(g, ellipse(16, 6, 4, 2), p, { outline: false, spec: 0.24 });
        g.fillStyle(p.deep); g.fillRect(12, 5, 8, 1);
        g.fillStyle(p.glow); g.fillRect(14, 6, 4, 1);

        // Magma running down the flanks, widening as it goes
        blit(g, [
            '...aba....',
            '..abbba...',
            '..abba....',
            '.abbba....',
            '.abba..a..',
            'abbba.aba.',
            'abba..abba',
        ], { a: p.dark, b: p.mid }, 11, 8);
        g.fillStyle(p.light); g.fillRect(13, 9, 1, 4); g.fillRect(19, 13, 1, 2);
        g.fillStyle(p.glow); g.fillRect(13, 9, 1, 1);
        g.fillStyle(p.mid, 0.14); g.fillRect(8, 4, 16, 12);

        // Cinders spat out of the crater
        g.fillStyle(p.light); g.fillRect(11, 1, 1, 1); g.fillRect(21, 2, 1, 1);
        g.fillStyle(p.glow, 0.8); g.fillRect(19, 0, 1, 1);
    }

    /** MUD — a stone rim holding a bog that will not stop bubbling. */
    _headMud(g) {
        const p = EL.mud;
        // Rim
        volume(g, taper(9, 15, 10, 7, 16, 1.4), STONE_HI, { lu: 0.28, lv: 0.18 });
        g.fillStyle(STONE_HI.glow); g.fillRect(7, 9, 18, 1);
        g.fillStyle(STONE_HI.light); g.fillRect(6, 10, 4, 1); g.fillRect(22, 10, 4, 1);

        // The bog itself
        volume(g, ellipse(16, 10, 8, 1), p, { outline: false, spec: 0.24 });
        g.fillStyle(p.dark);  g.fillRect(8, 9, 16, 1);
        g.fillStyle(p.mid);   g.fillRect(9, 10, 14, 1);
        g.fillStyle(p.light); g.fillRect(10, 10, 6, 1);
        g.fillStyle(p.glow, 0.8); g.fillRect(11, 10, 3, 1);

        // Bubbles, largest at the surface and thinning as they rise
        volume(g, ellipse(13, 6, 3, 3), p, { spec: 0.24 });
        volume(g, ellipse(21, 4, 2, 2), p, { spec: 0.26 });
        volume(g, ellipse(17, 1, 2, 2), p, { spec: 0.26 });
        g.fillStyle(p.glow); g.fillRect(11, 4, 1, 1); g.fillRect(20, 3, 1, 1); g.fillRect(16, 0, 1, 1);
        g.fillStyle(p.mid, 0.13); g.fillRect(9, 0, 15, 9);
    }

    // ─── Temples (32×32) ────────────────────────────────
    // One marble shell — stepped stylobate, four columns, architrave, pediment,
    // corner braziers — with the element burning in the cella and set in the
    // tympanum. Eight buildings, one architecture.
    _generateTemples() {
        for (const el of TOWER_KEYS) {
            const p = EL[el];
            this._draw(`temple_${el}`, 32, 32, (g) => {
                groundShadow(g, 16, 30, 15, 2, 0.3);

                // Stylobate — two steps
                g.fillStyle(MARBLE.deep);  g.fillRect(1, 26, 30, 5);
                g.fillStyle(MARBLE.mid);   g.fillRect(2, 26, 28, 3);
                g.fillStyle(MARBLE.light); g.fillRect(2, 26, 28, 1);
                g.fillStyle(MARBLE.dark);  g.fillRect(2, 29, 28, 1);
                g.fillStyle(MARBLE.deep);  g.fillRect(3, 23, 26, 4);
                g.fillStyle(MARBLE.mid);   g.fillRect(4, 23, 24, 3);
                g.fillStyle(MARBLE.light); g.fillRect(4, 23, 24, 1);
                for (let x = 6; x < 28; x += 5) {
                    g.fillStyle(MARBLE.deep, 0.5); g.fillRect(x, 27, 1, 2);
                }

                // Cella: the element itself, banked so it reads as depth
                g.fillStyle(0x05060f); g.fillRect(5, 11, 22, 12);
                g.fillStyle(p.deep);   g.fillRect(6, 12, 20, 11);
                g.fillStyle(p.dark);   g.fillRect(7, 14, 18, 9);
                g.fillStyle(p.mid);    g.fillRect(8, 16, 16, 7);
                g.fillStyle(p.light);  g.fillRect(10, 18, 12, 5);
                g.fillStyle(p.glow, 0.85); g.fillRect(13, 20, 6, 3);
                g.fillStyle(0xffffff, 0.5); g.fillRect(14, 21, 4, 1);

                // Colonnade — four fluted columns with capitals and bases
                for (const x of [5, 11, 18, 24]) {
                    g.fillStyle(MARBLE.deep);  g.fillRect(x, 11, 3, 12);
                    g.fillStyle(MARBLE.mid);   g.fillRect(x, 12, 3, 10);
                    g.fillStyle(MARBLE.light); g.fillRect(x, 12, 1, 10);
                    g.fillStyle(MARBLE.dark);  g.fillRect(x + 2, 12, 1, 10);
                    g.fillStyle(MARBLE.glow);  g.fillRect(x, 11, 3, 1);
                    g.fillStyle(MARBLE.light); g.fillRect(x - 1, 10, 5, 1);   // capital
                    g.fillStyle(MARBLE.deep);  g.fillRect(x - 1, 22, 5, 1);   // base
                    g.fillStyle(MARBLE.mid);   g.fillRect(x - 1, 21, 5, 1);
                }

                // Architrave
                g.fillStyle(MARBLE.deep);  g.fillRect(1, 8, 30, 3);
                g.fillStyle(MARBLE.mid);   g.fillRect(2, 8, 28, 2);
                g.fillStyle(MARBLE.glow);  g.fillRect(2, 8, 28, 1);
                g.fillStyle(MARBLE.dark);  g.fillRect(2, 10, 28, 1);

                // Pediment — a real triangle, lit on its left slope
                for (let i = 0; i < 7; i++) {
                    const x0 = 2 + i * 2;
                    const w = 28 - i * 4;
                    if (w <= 0) break;
                    g.fillStyle(MARBLE.deep);  g.fillRect(x0, 7 - i, w, 1);
                    g.fillStyle(MARBLE.mid);   g.fillRect(x0 + 1, 7 - i, w - 2, 1);
                    g.fillStyle(MARBLE.light); g.fillRect(x0 + 1, 7 - i, Math.max(1, (w >> 1) - 1), 1);
                }
                g.fillStyle(MARBLE.glow); g.fillRect(14, 1, 4, 1);

                // Tympanum gem — the badge that names the temple
                g.fillStyle(p.mid, 0.30); g.fillRect(11, 3, 10, 5);
                blit(g, [
                    '..aa..',
                    '.abba.',
                    'abccba',
                    '.abba.',
                    '..aa..',
                ], { a: p.deep, b: p.mid, c: p.glow }, 13, 3);

                // Corner braziers, lit with the element
                for (const x of [1, 29]) {
                    g.fillStyle(MARBLE.dark);  g.fillRect(x, 21, 2, 2);
                    g.fillStyle(MARBLE.light); g.fillRect(x, 21, 2, 1);
                    g.fillStyle(p.mid, 0.35);  g.fillRect(x - 1, 18, 4, 4);
                    g.fillStyle(p.light);      g.fillRect(x, 19, 2, 2);
                    g.fillStyle(p.glow);       g.fillRect(x, 19, 1, 1);
                }
            });
        }
    }

    // ─── Enemies (32×32) ────────────────────────────────
    _generateEnemies() {
        this._enemySlime();
        this._enemyGolem();
        this._enemySpecter();
        this._enemyDragon();
    }

    /** Two glowing eyes on a dark plate — the one feature every enemy shares. */
    _eyes(g, lx, rx, y, iris, pupil) {
        for (const x of [lx, rx]) {
            g.fillStyle(0x080810); g.fillRect(x - 1, y - 1, 5, 4);
            g.fillStyle(iris);     g.fillRect(x, y, 3, 2);
            g.fillStyle(pupil);    g.fillRect(x, y, 1, 1);
        }
    }

    /** CUAJO — fuego fatuo nobody drank, gone thick. The motes are still in it. */
    _enemySlime() {
        const GEL = ramp(0x0a2e12, 0x1d6127, 0x3ba342, 0x74d06a, 0xc9f5a6);
        this._draw('enemy_slime', 32, 32, (g) => {
            groundShadow(g, 16, 28, 11, 2, 0.28);

            // A blob is an ellipse that sat down: flat-bottomed, wobbling at
            // the shoulders. Two bulges keep it from reading as a ball.
            const spans = [];
            for (let y = 0; y < 20; y++) {
                const t = y / 19;
                const w = Math.round(6 + 6 * Math.sin(Math.pow(t, 0.7) * Math.PI * 0.62)
                    + 2 * Math.sin(t * 7.2));
                spans.push([16 - w, 15 + w]);
            }
            volume(g, profile(8, spans), GEL, { lu: 0.3, lv: 0.28, spec: 0.17 });

            // Gel: brighter core seen through the skin, and a hard gloss
            g.fillStyle(GEL.light, 0.35); g.fillRect(11, 17, 11, 6);
            g.fillStyle(GEL.glow); g.fillRect(9, 12, 3, 2); g.fillRect(12, 11, 2, 1);
            g.fillStyle(0xffffff, 0.75); g.fillRect(9, 12, 2, 1);

            // The motes it swallowed, still in there and still violet. This is
            // the whole character: it is the resource, spoiled, and the player
            // can see exactly what was lost inside it.
            for (const [x, y, deep] of [[12, 15, 0], [20, 19, 1], [10, 22, 1], [17, 24, 0], [22, 14, 1]]) {
                const a = deep ? 0.55 : 1;
                // Drawn as a lit core inside a halo, not as a tinted pixel: at
                // one pixel and half alpha over bright green they simply were
                // not there, which cost the character its entire idea.
                g.fillStyle(SOUL.deep, a * 0.55); g.fillRect(x - 2, y - 2, 5, 5);
                g.fillStyle(SOUL.mid, a * 0.85);  g.fillRect(x - 1, y - 1, 3, 3);
                g.fillStyle(SOUL.light, a);       g.fillRect(x, y, 2, 2);
                g.fillStyle(SOUL.glow, a);        g.fillRect(x, y, 1, 1);
            }

            // Drips running off the rim
            for (const [x, y, h] of [[6, 23, 3], [24, 21, 4], [19, 26, 2]]) {
                g.fillStyle(GEL.deep); g.fillRect(x - 1, y, 3, h + 1);
                g.fillStyle(GEL.mid);  g.fillRect(x, y, 1, h);
                g.fillStyle(GEL.light); g.fillRect(x, y, 1, 1);
            }

            this._eyes(g, 10, 19, 16, 0xfff6b0, 0xffffff);
            g.fillStyle(0x081a0c); g.fillRect(13, 21, 6, 2);
            g.fillStyle(GEL.deep); g.fillRect(14, 23, 4, 1);
            g.fillStyle(0xffffff, 0.8); g.fillRect(14, 21, 1, 1); g.fillRect(17, 21, 1, 1);
        });
    }

    /**
     * SILLAR — a block of the fallen temple that remembered how to walk.
     *
     * Built out of the temple's own vocabulary on purpose: the same marble, the
     * same fluted drum, the same gold in the seams. A player who has put a
     * temple on the board should recognise what this used to be part of.
     */
    _enemyGolem() {
        const RUNE = EL.earth;
        this._draw('enemy_golem', 32, 32, (g) => {
            groundShadow(g, 16, 29, 12, 2, 0.3);

            // Arms: hanging blocks of masonry, jointed rather than limbed
            for (const [cx, lit] of [[4, 1], [27, 0]]) {
                volume(g, taper(11, 26, 3, 3, cx, 1), MARBLE,
                    { lu: lit ? 0.28 : 0.68, lv: 0.2, spec: 0.12 });
                g.fillStyle(MARBLE.deep); g.fillRect(cx - 4, 18, 8, 1);
                g.fillStyle(RUNE.mid, 0.75); g.fillRect(cx - 1, 22, 2, 3);
                g.fillStyle(RUNE.glow, 0.8); g.fillRect(cx - 1, 22, 1, 1);
            }

            // Shoulders, and the column drum they sit on. Narrower than the
            // arms reach: shoulders as wide as the sprite made the whole thing
            // read as a little building rather than as something walking.
            volume(g, profile(9, [
                [7, 24], [6, 25], [6, 25], [7, 24],
                [9, 22], [9, 22], [9, 22], [9, 22], [9, 22], [9, 22],
                [9, 22], [9, 22], [9, 22], [9, 22], [8, 23],
            ]), MARBLE, { lu: 0.3, lv: 0.2, spec: 0.14 });

            // Fluting, exactly as on the temple columns
            for (const x of [11, 14, 17, 20]) {
                g.fillStyle(MARBLE.deep, 0.5); g.fillRect(x, 15, 1, 8);
                g.fillStyle(MARBLE.glow, 0.22); g.fillRect(x + 1, 15, 1, 8);
            }
            g.fillStyle(MARBLE.deep);  g.fillRect(7, 12, 18, 1);
            g.fillStyle(MARBLE.light); g.fillRect(8, 13, 16, 1);

            // Gold in the seams — the mortar of a building that is not one any
            // more, in the same two stops as the towers' runes.
            g.fillStyle(RUNE.mid, 0.16); g.fillRect(9, 15, 14, 9);
            for (const [x, y, w] of [[10, 20, 5], [17, 22, 6]]) {
                g.fillStyle(RUNE.dark); g.fillRect(x, y, w, 1);
                g.fillStyle(RUNE.mid);  g.fillRect(x + 1, y, w - 2, 1);
            }
            blit(g, [
                '..a..',
                '.aba.',
                'abcba',
                '.aba.',
                '..a..',
            ], { a: RUNE.dark, b: RUNE.mid, c: RUNE.glow }, 14, 16);

            // Head: a broken capital, chipped at the corners
            volume(g, rough(profile(2, [
                [12, 19], [11, 20], [11, 20], [11, 20], [11, 20], [12, 19],
            ]), 0x51AA, 1), MARBLE, { lu: 0.3, lv: 0.3, spec: 0.16 });
            g.fillStyle(MARBLE.deep);  g.fillRect(10, 0, 12, 3);
            g.fillStyle(MARBLE.mid);   g.fillRect(11, 0, 10, 2);
            g.fillStyle(MARBLE.light); g.fillRect(11, 0, 10, 1);
            g.fillStyle(MARBLE.glow);  g.fillRect(11, 0, 4, 1);

            this._eyes(g, 12, 17, 6, RUNE.light, RUNE.glow);

            // Legs: two short pillars with real daylight between them. The gap
            // is what turns a plinth into a pair of legs.
            for (const x of [8, 18]) {
                g.fillStyle(MARBLE.deep);  g.fillRect(x, 23, 6, 6);
                g.fillStyle(MARBLE.mid);   g.fillRect(x, 24, 6, 4);
                g.fillStyle(MARBLE.light); g.fillRect(x, 24, 1, 4);
                g.fillStyle(MARBLE.deep);  g.fillRect(x, 26, 6, 1);
                g.fillStyle(MARBLE.mid);   g.fillRect(x - 1, 28, 8, 2);
                g.fillStyle(MARBLE.light); g.fillRect(x - 1, 28, 8, 1);
            }
        });
    }

    /**
     * VELADOR — a vigilante of Vesper's own order who would not put the lantern
     * down. Hooded like the hero, hollow inside, carrying a lamp that went out.
     *
     * Drawn as the hero's dark mirror deliberately: same cowl, same ash, same
     * lantern at the same height on the same hip. What the player is meant to
     * notice is that the light in this one is dead.
     */
    _enemySpecter() {
        const R = ramp(0x181428, 0x2e2547, 0x4a3d6d, 0x6f5f96, 0x9c8cc0);
        this._draw('enemy_specter', 32, 32, (g) => {
            // Hovers, so no contact shadow — a faint pool of light instead
            g.fillStyle(R.mid, 0.10); g.fillRect(9, 26, 14, 3);
            g.fillStyle(R.mid, 0.06); g.fillRect(6, 24, 20, 6);

            // Tatters first, so the robe hangs over where they attach
            for (const [cx, top, len] of [[10, 20, 7], [16, 22, 6], [22, 20, 8]]) {
                volume(g, taper(top, top + len, 3, 0, cx, 1.8), R,
                    { lu: 0.3, lv: 0.2, spec: 0.2, alpha: 0.92 });
            }

            // The robe: a pointed cowl that swells into a body
            volume(g, profile(1, [
                [15, 16], [14, 17], [13, 18], [12, 19], [11, 20], [10, 21],
                [10, 21], [9, 22], [9, 22], [8, 23], [8, 23], [8, 23],
                [8, 23], [8, 23], [8, 23], [8, 23], [9, 22], [9, 22],
                [10, 21], [10, 21], [11, 20], [12, 19],
            ]), R, { lu: 0.3, lv: 0.2, spec: 0.15 });

            // The hood is empty. Two cold lights and nothing behind them.
            g.fillStyle(0x0b0714); g.fillRect(11, 7, 10, 9);
            g.fillStyle(0x140d22); g.fillRect(12, 6, 8, 2);
            g.fillStyle(0x9fe8ff, 0.14); g.fillRect(11, 9, 10, 5);
            for (const x of [12, 18]) {
                g.fillStyle(0x6ec8e8, 0.5); g.fillRect(x - 1, 9, 4, 4);
                g.fillStyle(0xdff6ff); g.fillRect(x, 10, 2, 2);
                g.fillStyle(0xffffff); g.fillRect(x, 10, 1, 1);
            }

            // Cowl rim and the fold down the front
            g.fillStyle(R.light); g.fillRect(13, 4, 3, 2); g.fillRect(11, 6, 2, 3);
            g.fillStyle(R.glow);  g.fillRect(14, 3, 2, 1);
            g.fillStyle(R.dark, 0.8); g.fillRect(21, 8, 2, 11);

            // The dead lantern. The same cage Vesper carries, blackened, with
            // one dim ember in it instead of a held flame.
            g.fillStyle(R.dark);   g.fillRect(6, 15, 1, 3);
            g.fillStyle(0x3a2f16); g.fillRect(4, 18, 5, 7);
            g.fillStyle(0x5c4a22); g.fillRect(5, 18, 3, 1); g.fillRect(5, 24, 3, 1);
            g.fillStyle(0x0a0716); g.fillRect(5, 19, 3, 5);
            g.fillStyle(SOUL.dark, 0.85); g.fillRect(5, 21, 3, 3);
            g.fillStyle(SOUL.mid, 0.7);   g.fillRect(6, 22, 1, 1);
            g.fillStyle(0x3a2f16);        g.fillRect(5, 21, 3, 1);
            g.fillStyle(SOUL.mid, 0.09);  g.fillRect(2, 16, 9, 11);

            // Wisps peeling off the shoulders
            for (const [x, y] of [[5, 12], [27, 12], [26, 19]]) {
                g.fillStyle(R.mid, 0.45); g.fillRect(x, y, 1, 3);
                g.fillStyle(R.light, 0.65); g.fillRect(x, y, 1, 1);
            }
        });
    }

    /**
     * ASCUA — what was sleeping under the fire temple.
     *
     * Cooled basalt hide with the magma still showing through every seam, in
     * the lava tower's own ramp. "Molten" then means exactly one thing on this
     * board, whether it is coming out of a tower or walking up the road at you.
     */
    _enemyDragon() {
        const R = ramp(0x180c0c, 0x33201c, 0x4e2f26, 0x6f4535, 0x966149);
        const MEMBRANE = ramp(0x100708, 0x241211, 0x3a1e19, 0x552d22, 0x77432f);
        const MAGMA = EL.lava;
        this._draw('enemy_dragon', 32, 32, (g) => {
            groundShadow(g, 16, 29, 10, 2, 0.28);
            // The heat it stands in
            g.fillStyle(MAGMA.mid, 0.10); g.fillRect(6, 22, 20, 8);

            // Wings, swept up behind the shoulders and kept deliberately small
            // and dark. Big pale wings on a small body is a moth; the beast has
            // to be the biggest, brightest mass in the sprite.
            const WING = [
                [6, 10], [4, 10], [2, 10], [1, 10], [1, 10], [2, 10],
                [1, 10], [2, 10], [1, 10], [3, 10], [2, 10], [5, 10],
                [7, 10],
            ];
            for (const dir of [-1, 1]) {
                const at = (x) => (dir < 0 ? x : 31 - x);
                const spans = WING.map(([a, b]) => (dir < 0 ? [a, b] : [at(b), at(a)]));
                // A membrane is backlit, not modelled: one soft top-to-bottom
                // gradient reads far better here than a rounded volume.
                volume(g, profile(5, spans), MEMBRANE,
                    { lu: 0.55, lv: 0.05, spec: 0.05, band: 0.4 });

                // Arm bone along the leading edge, then three fingers fanning out
                line(g, at(10), 7, at(1), 8, R.dark);
                for (const [fx, fy] of [[1, 10], [1, 13], [4, 16]]) {
                    line(g, at(10), 8, at(fx), fy, MEMBRANE.deep);
                }
                g.fillStyle(MAGMA.mid, 0.7); g.fillRect(at(1), 6, 1, 2);
            }

            // Tail, curling out behind
            for (const [x, y, w] of [[12, 26, 5], [9, 27, 5], [5, 28, 5], [3, 29, 3]]) {
                g.fillStyle(R.deep); g.fillRect(x - 1, y - 1, w + 2, 3);
                g.fillStyle(R.mid);  g.fillRect(x, y, w, 1);
            }

            // Hind legs
            for (const [x, lit] of [[8, 1], [19, 0]]) {
                g.fillStyle(R.deep);  g.fillRect(x - 1, 22, 7, 7);
                g.fillStyle(R.dark);  g.fillRect(x, 22, 5, 6);
                g.fillStyle(lit ? R.mid : R.dark); g.fillRect(x, 22, 3, 5);
                g.fillStyle(MAGMA.light); g.fillRect(x, 28, 1, 1); g.fillRect(x + 2, 28, 1, 1);
                g.fillStyle(MAGMA.glow); g.fillRect(x + 4, 28, 1, 1);
            }

            // Body — the mass everything else hangs off
            volume(g, profile(8, [
                [12, 19], [11, 20], [10, 21], [9, 22], [9, 22], [9, 22],
                [9, 22], [9, 22], [10, 21], [10, 21], [10, 21], [10, 21],
                [11, 20], [11, 20], [11, 20], [12, 19], [12, 19], [13, 18],
            ]), R, { lu: 0.3, lv: 0.22, spec: 0.15 });

            // Head and muzzle
            volume(g, profile(0, [
                [12, 19], [11, 20], [10, 21], [10, 21], [10, 21], [10, 21],
                [11, 20], [12, 19],
            ]), R, { lu: 0.3, lv: 0.3, spec: 0.18 });
            g.fillStyle(R.dark); g.fillRect(13, 6, 6, 2);
            g.fillStyle(0x1a0508); g.fillRect(14, 7, 4, 1);
            g.fillStyle(0x1a0508); g.fillRect(12, 4, 1, 1); g.fillRect(19, 4, 1, 1);

            // Horns
            for (const [x, d] of [[10, -1], [21, 1]]) {
                g.fillStyle(R.deep);      g.fillRect(x, 0, 1, 3);
                g.fillStyle(R.light);     g.fillRect(x + d, 0, 1, 2);
                g.fillStyle(MAGMA.light); g.fillRect(x + d, 0, 1, 1);
            }

            this._eyes(g, 11, 18, 3, MAGMA.light, MAGMA.glow);

            // The seam down the belly, where the rock never finished cooling
            g.fillStyle(MAGMA.mid, 0.20); g.fillRect(11, 12, 10, 13);
            // Tapering, and irregular. Five identical bars stacked square read
            // as a ladder painted on the front of the animal.
            for (const [i, w] of [[0, 6], [1, 6], [2, 5], [3, 4], [4, 2]]) {
                const x = 16 - Math.ceil(w / 2);
                g.fillStyle(MAGMA.deep);  g.fillRect(x, 14 + i * 2, w, 2);
                g.fillStyle(MAGMA.dark);  g.fillRect(x, 14 + i * 2, w, 1);
                g.fillStyle(MAGMA.mid);   g.fillRect(x + 1, 14 + i * 2, Math.max(1, w - 2), 1);
                if (i < 3) { g.fillStyle(MAGMA.light); g.fillRect(x + 1, 14 + i * 2, 2, 1); }
            }
            // Cracks opening across the flanks and the throat
            for (const [x, y, w] of [[10, 11, 4], [19, 13, 3], [11, 22, 5], [12, 8, 3]]) {
                g.fillStyle(MAGMA.dark); g.fillRect(x, y, w, 1);
                g.fillStyle(MAGMA.mid);  g.fillRect(x + 1, y, w - 2, 1);
            }
            for (const [x, y] of [[9, 12], [9, 16], [10, 20], [21, 12], [21, 16], [20, 20]]) {
                g.fillStyle(R.deep);  g.fillRect(x, y, 2, 2);
                g.fillStyle(R.light); g.fillRect(x, y, 1, 1);
            }
        });
    }

    // ─── Hero ───────────────────────────────────────────
    /**
     * Vesper is not drawn here. The figure itself is the hand-drawn strip that
     * preload() brought in; the composable look — mantle, crown, blade, lantern —
     * is baked from a recipe by HeroLook, which is also where the character's
     * fiction and its upgrade slots live. Boot only has to register the walk
     * animation and put the starting recipe, the halo and the shadow on the atlas.
     */
    _generateHero() {
        for (const tier of LANTERN_TIERS) {
            for (const pose of POSE_NAMES) {
                bakeHeroTexture(this, { ...DEFAULT_LOOK, lantern: tier }, pose);
            }
        }
        this._registerHeroAnims();

        this._draw(HERO_GLOW_KEY, 26, 26, (g) => drawLanternGlow(g));
        this._draw(HERO_SLASH_KEY, 32, 28, (g) => drawSlash(g));

        // Shadow, drawn separately so it can squash while Vesper walks
        this._draw('hero_shadow', 24, 10, (g) => {
            groundShadow(g, 12, 5, 11, 4, 0.34);
        });
    }

    /**
     * The walk cycle of the drawn hero, on the timing the artist set in the .ase.
     *
     * Animations live on the game's animation manager rather than on a scene, so
     * one registration here serves GameScene for the rest of the run. Guarded on
     * the texture actually existing: if the data URI failed to decode, the hero
     * falls back to the composed sprite, and an animation pointing at a texture
     * that is not there throws the moment anything plays it.
     */
    _registerHeroAnims() {
        if (!HERO_SPRITE.enabled || !this.textures.exists(HERO_SPRITE.key)) return;
        if (HERO_SPRITE.frameCount < 2 || this.anims.exists(HERO_SPRITE.walkAnim)) return;

        this.anims.create({
            key: HERO_SPRITE.walkAnim,
            frames: this.anims.generateFrameNumbers(HERO_SPRITE.key, {
                frames: HERO_SPRITE.walkFrames,
            }),
            frameRate: 1000 / HERO_SPRITE.frameMs,
            repeat: -1,
        });
    }

    // ─── Projectiles (18×12) — bolts of the element ─────
    /**
     * Every bolt is drawn as a comet pointing RIGHT: a head at x≈13 and a tail
     * fading back to x=0. Projectile.js then rotates the sprite onto its flight
     * vector and hangs it off the head, so the tail trails correctly in every
     * direction for free — no per-frame trail objects, no particle system.
     *
     * The heads differ in silhouette, not just in hue: a bead, a crescent, a
     * flame, a chip of rock, a shard, a bolt, a molten glob, a heavy splat. At
     * a glance across a busy lane you can tell which tower is firing.
     */
    _generateProjectiles() {
        const shapes = {
            water: (g, p) => {
                volume(g, ellipse(13, 6, 4, 4), p, { spec: 0.24, band: 0.24 });
                g.fillStyle(p.glow); g.fillRect(15, 3, 2, 2);
                g.fillStyle(p.light, 0.7); g.fillRect(8, 5, 2, 2);
            },
            air: (g, p) => {
                // A crescent, edge forward
                volume(g, profile(2, [
                    [13, 15], [15, 16], [16, 17], [16, 17], [15, 16], [13, 15],
                ]), p, { spec: 0.2 });
                g.fillStyle(p.glow, 0.9); g.fillRect(15, 4, 1, 4);
                g.fillStyle(p.light, 0.55); g.fillRect(10, 5, 3, 1); g.fillRect(11, 7, 3, 1);
            },
            fire: (g, p) => {
                volume(g, teardrop(11, 10, 1, 4), p, { outline: false, lu: 0.6, lv: 0.5, spec: 0.22 });
                volume(g, ellipse(13, 6, 4, 3), p, { outline: false, spec: 0.26, band: 0.2 });
                g.fillStyle(p.glow); g.fillRect(12, 5, 3, 2);
                g.fillStyle(0xffffff, 0.8); g.fillRect(13, 5, 1, 1);
            },
            earth: (g, p) => {
                volume(g, rough(ellipse(13, 6, 4, 4), 0xEA12, 1), BASALT, { spec: 0.16 });
                g.fillStyle(p.mid); g.fillRect(12, 4, 2, 2);
                g.fillStyle(p.glow); g.fillRect(12, 4, 1, 1);
            },
            ice: (g, p) => {
                // A shard, point forward
                volume(g, profile(2, [
                    [15, 16], [14, 16], [12, 15], [11, 15], [11, 14], [12, 13], [13, 14],
                ]), p, { spec: 0.22 });
                g.fillStyle(0xffffff); g.fillRect(14, 4, 1, 3);
                g.fillStyle(p.light, 0.6); g.fillRect(9, 5, 2, 1);
            },
            storm: (g, p) => {
                for (const [x, y] of [[16, 5], [15, 6], [14, 5], [13, 6], [12, 5], [11, 6]]) {
                    g.fillStyle(p.dark, 0.7); g.fillRect(x - 1, y - 1, 3, 3);
                }
                for (const [x, y] of [[16, 5], [15, 6], [14, 5], [13, 6], [12, 5], [11, 6]]) {
                    g.fillStyle(p.glow); g.fillRect(x, y, 1, 1);
                }
                g.fillStyle(p.light, 0.8); g.fillRect(15, 4, 2, 1);
            },
            lava: (g, p) => {
                volume(g, rough(ellipse(13, 6, 4, 4), 0x1A7A, 1), p, { spec: 0.24, band: 0.22 });
                g.fillStyle(p.glow); g.fillRect(12, 4, 3, 2);
                g.fillStyle(0xffffff, 0.7); g.fillRect(13, 4, 1, 1);
                g.fillStyle(p.dark, 0.8); g.fillRect(9, 4, 2, 1); g.fillRect(8, 7, 2, 1);
            },
            mud: (g, p) => {
                volume(g, rough(ellipse(13, 6, 4, 4), 0x33DD, 1), p, { spec: 0.22 });
                // Splatter, because a heavy shot should look heavy
                g.fillStyle(p.mid); g.fillRect(9, 3, 2, 1); g.fillRect(8, 8, 2, 1);
                g.fillStyle(p.light); g.fillRect(11, 4, 2, 2);
                g.fillStyle(p.glow); g.fillRect(11, 4, 1, 1);
            },
        };

        for (const el of TOWER_KEYS) {
            const p = EL[el];
            this._draw(`proj_${el}`, 18, 12, (g) => {
                // Tail first: a wedge of the element's own light, thinning and
                // fading backwards from the head.
                for (let i = 0; i < 11; i++) {
                    const t = i / 10;
                    const h = Math.max(1, Math.round(4 * (1 - t)));
                    g.fillStyle(p.mid, 0.42 * (1 - t) * (1 - t));
                    g.fillRect(11 - i, 6 - (h >> 1), 1, h);
                    if (t < 0.45) {
                        g.fillStyle(p.light, 0.5 * (1 - t * 2));
                        g.fillRect(11 - i, 6 - (h >> 2), 1, Math.max(1, h - 2));
                    }
                }
                g.fillStyle(p.mid, 0.22); g.fillCircle(13, 6, 6);
                shapes[el](g, p);
            });
        }
    }

    // ─── Mana mote (12×12) — a spark of life force ──────
    // Violet, because every readout that counts maná in the UI is violet.
    _generateManaMote() {
        if (this.textures.exists('mana_mote')) return;
        const M = ramp(0x2a1060, 0x5b2bb0, 0x8f5ce8, 0xb388ff, 0xf1e6ff);
        this._draw('mana_mote', 12, 12, (g) => {
            g.fillStyle(M.mid, 0.18); g.fillCircle(6, 6, 6);
            g.fillStyle(M.mid, 0.30); g.fillCircle(6, 6, 4);
            volume(g, ellipse(6, 6, 4, 4), M, { spec: 0.26, band: 0.24 });
            // Four-point sparkle, so a mote never reads as a bullet
            g.fillStyle(M.glow);
            g.fillRect(5, 0, 2, 2); g.fillRect(5, 10, 2, 2);
            g.fillRect(0, 5, 2, 2); g.fillRect(10, 5, 2, 2);
            g.fillStyle(0xffffff); g.fillRect(4, 4, 2, 1); g.fillRect(4, 5, 1, 1);
        });
    }

    // ─── Spells ─────────────────────────────────────────
    /**
     * LUNA — the moon that falls, the rings that wrap the hero, and the crescent
     * on the button.
     *
     * Same masonry as the temples, two stops brighter: the moon and the marble
     * are meant to look like the same white stone, because the fiction says the
     * monoliths remember the light Vesper carries and this is where it comes
     * from. The only other colour on any of the three is the maná violet, which
     * is the resource the spell just spent — so the cast is visibly made of the
     * thing it cost.
     */
    _generateSpells() {
        // MARBLE lifted two stops. A moon has to out-light the board it lands on.
        const MOON = ramp(0x2a3550, 0x53637f, 0x8ba0bc, 0xcfdde9, 0xffffff);

        this._draw('spell_moon', 48, 48, (g) => {
            // Halo first, so the disc sits inside its own light
            for (let r = 23; r > 18; r--) {
                g.fillStyle(MOON.light, 0.05 * (24 - r));
                g.fillCircle(24, 24, r);
            }
            g.fillStyle(SOUL.mid, 0.14); g.fillCircle(24, 24, 21);

            volume(g, ellipse(24, 24, 18, 18), MOON, { lu: 0.32, lv: 0.28, spec: 0.2, band: 0.3 });

            // Maria. Two big, three small, none touching the rim — a crater on
            // the edge breaks the silhouette and the disc stops reading as round.
            for (const [cx, cy, r] of [[19, 20, 5], [30, 29, 4]]) {
                g.fillStyle(MOON.mid, 0.75); g.fillCircle(cx, cy, r);
                g.fillStyle(MOON.dark, 0.5); g.fillCircle(cx, cy + 1, r - 2);
            }
            // The small ones are rectangles, not tiny circles: a two-pixel
            // radius comes out of fillCircle as a plus sign, and three plus
            // signs on a disc read as stars rather than as pitting.
            for (const [cx, cy, w, h] of [[27, 16, 3, 2], [15, 29, 3, 2], [33, 21, 2, 2]]) {
                g.fillStyle(MOON.mid, 0.7); g.fillRect(cx, cy, w, h);
                g.fillStyle(MOON.dark, 0.45); g.fillRect(cx, cy + 1, w, 1);
            }

            // Lit limb along the top-left, and the violet the spell is made of
            // bleeding around the shaded one.
            g.fillStyle(MOON.glow, 0.85);
            for (let a = -2.5; a < -0.7; a += 0.06) {
                g.fillRect(Math.round(24 + Math.cos(a) * 17), Math.round(24 + Math.sin(a) * 17), 2, 2);
            }
            g.fillStyle(SOUL.light, 0.5);
            for (let a = 0.5; a < 2.2; a += 0.06) {
                g.fillRect(Math.round(24 + Math.cos(a) * 18), Math.round(24 + Math.sin(a) * 18), 2, 2);
            }
        });

        // The ring that closes onto the hero. Dashed and squashed on purpose:
        // a solid circle shows nothing when it spins, and a flat one reads as a
        // puddle rather than as something being wound around a body.
        this._draw('spell_moon_ring', 44, 44, (g) => {
            const RX = 20, RY = 16;
            for (let i = 0; i < 220; i++) {
                const a = (i / 220) * Math.PI * 2;
                // Three arcs, three gaps
                if (((a * 3) % (Math.PI * 2)) > Math.PI * 1.45) continue;
                const x = Math.round(22 + Math.cos(a) * RX);
                const y = Math.round(22 + Math.sin(a) * RY);
                g.fillStyle(MOON.light, 0.85); g.fillRect(x, y, 2, 2);
                g.fillStyle(MOON.glow, 0.5); g.fillRect(x, y, 1, 1);
            }
            // Four beads on the ring, so the spin has something to count
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + 0.4;
                const x = Math.round(22 + Math.cos(a) * RX);
                const y = Math.round(22 + Math.sin(a) * RY);
                g.fillStyle(SOUL.light, 0.9); g.fillCircle(x, y, 2);
                g.fillStyle(MOON.glow); g.fillRect(x, y, 1, 1);
            }
        });

        // Button icon: a crescent, carved rather than drawn — the bite is a
        // second disc's worth of pixels left out, which keeps the inner edge as
        // clean as the outer one at this size.
        this._draw('spell_luna', 24, 24, (g) => {
            const R = 10, BITE = 9.2, OX = 4.5, OY = -0.5;
            for (let y = -R; y <= R; y++) {
                for (let x = -R; x <= R; x++) {
                    const d = Math.hypot(x, y);
                    if (d > R) continue;
                    if (Math.hypot(x - OX, y - OY) <= BITE) continue;
                    // Brightest along the outer rim, falling away inward
                    const t = d / R;
                    g.fillStyle(t > 0.86 ? MOON.glow : t > 0.62 ? MOON.light : MOON.mid);
                    g.fillRect(12 + x, 12 + y, 1, 1);
                }
            }
            g.fillStyle(SOUL.light, 0.55); g.fillRect(4, 10, 1, 4);
        });
    }

    // ─── Route gates (32×32) ────────────────────────────
    _generateGates() {
        // Where they come from: a cracked arch with something green behind it.
        this._draw('gate_spawn', 32, 32, (g) => {
            groundShadow(g, 16, 29, 12, 2, 0.3);
            // Voussoirs — the arch ring — then the jambs under it. Curved, not
            // square: a square hole is a door, an arch is a ruin they come out of.
            volume(g, profile(3, [
                [13, 18], [11, 20], [9, 22], [8, 23], [7, 24], [6, 25],
            ]), BASALT, { lu: 0.3, lv: 0.45, spec: 0.12 });
            g.fillStyle(BASALT.deep); g.fillRect(5, 8, 22, 22);
            for (const [x, lit] of [[6, 1], [23, 0]]) {
                g.fillStyle(BASALT.mid); g.fillRect(x, 8, 3, 21);
                g.fillStyle(lit ? BASALT.light : BASALT.dark); g.fillRect(x, 8, 1, 21);
                for (let y = 12; y < 29; y += 5) {
                    g.fillStyle(BASALT.deep); g.fillRect(x, y, 3, 1);
                }
            }
            // Keystone
            g.fillStyle(BASALT.deep);  g.fillRect(13, 1, 6, 5);
            g.fillStyle(BASALT.light); g.fillRect(14, 1, 4, 4);
            g.fillStyle(BASALT.glow);  g.fillRect(14, 1, 3, 1);

            // The way through, following the arch, with something green in it
            const mouth = [[15, 16], [13, 18], [11, 20], [10, 21], [9, 22]];
            mouth.forEach(([a, b], i) => {
                g.fillStyle(0x061c11); g.fillRect(a, 4 + i, b - a + 1, 1);
            });
            g.fillStyle(0x061c11); g.fillRect(9, 9, 14, 20);
            g.fillStyle(0x0d3a22); g.fillRect(10, 10, 12, 19);
            g.fillStyle(0x14562f, 0.9); g.fillRect(11, 13, 10, 16);
            g.fillStyle(0x2d8c4a, 0.5); g.fillRect(12, 18, 8, 11);
            g.fillStyle(0x6fe08a, 0.3); g.fillRect(14, 23, 4, 6);
            for (const [x, y] of [[12, 15], [19, 19], [15, 25]]) {
                g.fillStyle(0x9fffb8, 0.55); g.fillRect(x, y, 1, 1);
            }
            g.fillStyle(GRASS.deep); g.fillRect(5, 28, 22, 2);
        });

        // Where they must not get to: a warded keep with a gold seal.
        this._draw('gate_exit', 32, 32, (g) => {
            groundShadow(g, 16, 29, 12, 2, 0.3);
            // Keep body
            volume(g, profile(9, [
                [7, 24], [6, 25], [6, 25], [6, 25], [6, 25], [6, 25],
                [6, 25], [6, 25], [6, 25], [6, 25], [6, 25], [5, 26],
                [5, 26], [5, 26], [5, 26], [5, 26], [5, 26], [5, 26],
                [5, 26], [5, 26],
            ]), MARBLE, { lu: 0.28, lv: 0.2, spec: 0.14 });
            // Crenellations
            for (const x of [5, 10, 15, 20, 25]) {
                g.fillStyle(MARBLE.deep);  g.fillRect(x, 5, 3, 5);
                g.fillStyle(MARBLE.mid);   g.fillRect(x, 5, 3, 4);
                g.fillStyle(MARBLE.glow);  g.fillRect(x, 5, 3, 1);
                g.fillStyle(MARBLE.light); g.fillRect(x, 6, 1, 3);
            }
            // Masonry courses
            for (let y = 13; y < 29; y += 4) {
                g.fillStyle(MARBLE.deep, 0.55); g.fillRect(6, y, 20, 1);
            }
            for (let y = 15; y < 29; y += 8) {
                for (let x = 8; x < 26; x += 6) {
                    g.fillStyle(MARBLE.deep, 0.4); g.fillRect(x, y - 2, 1, 2);
                }
            }
            // Warded doorway
            g.fillStyle(0x0a0c16); g.fillRect(12, 18, 8, 12);
            g.fillStyle(GOLD.dark, 0.35); g.fillRect(12, 18, 8, 12);
            g.fillStyle(GOLD.mid, 0.30); g.fillRect(13, 20, 6, 10);
            volume(g, profile(21, [
                [15, 16], [14, 17], [13, 18], [14, 17], [15, 16],
            ]), GOLD, { spec: 0.24 });
            // Banner
            g.fillStyle(GOLD.mid); g.fillRect(15, 1, 2, 5);
            g.fillStyle(BANNER.mid);   g.fillRect(17, 1, 7, 5);
            g.fillStyle(BANNER.light); g.fillRect(17, 1, 7, 1);
            g.fillStyle(BANNER.deep);  g.fillRect(17, 5, 7, 1);
            g.fillStyle(GOLD.glow); g.fillRect(19, 2, 2, 2);
        });
    }

    // ─── UI textures — beveled panels ───────────────────
    _generateUI() {
        const panel = (key, w, h, border, fill, bevel) => {
            this._draw(key, w, h, (g) => {
                g.fillStyle(fill);
                g.fillRect(0, 0, w, h);
                g.fillStyle(bevel, 0.5);
                g.fillRect(1, 1, w - 2, 1);
                g.fillRect(1, 1, 1, h - 2);
                g.fillStyle(0x0a0a18, 0.55);
                g.fillRect(1, h - 2, w - 2, 1);
                g.fillRect(w - 2, 1, 1, h - 2);
                g.lineStyle(2, border);
                g.strokeRect(1, 1, w - 2, h - 2);
                // Corner studs, the same gold as the rest of the chrome
                g.fillStyle(border, 0.85);
                g.fillRect(2, 2, 2, 2); g.fillRect(w - 4, 2, 2, 2);
                g.fillRect(2, h - 4, 2, 2); g.fillRect(w - 4, h - 4, 2, 2);
            });
        };

        panel('btn_bg', 40, 40, 0x3a3a5e, 0x1a1a34, 0x2a2a4e);
        panel('btn_bg_sel', 40, 40, GOLD.light, 0x22224a, 0x32325a);
        panel('btn_build', 56, 62, 0x3a3a5e, 0x1a1a34, 0x2a2a4e);
        panel('btn_build_sel', 56, 62, GOLD.light, 0x22224a, 0x32325a);

        this._draw('btn_bg_off', 40, 40, (g) => {
            g.fillStyle(0x121228);
            g.fillRect(0, 0, 40, 40);
            g.lineStyle(2, 0x1e1e35);
            g.strokeRect(1, 1, 38, 38);
        });
    }
}
