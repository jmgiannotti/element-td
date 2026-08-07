import * as Phaser from 'phaser';

/**
 * BootScene — generates ALL pixel-art textures at runtime.
 * No external assets needed.
 */

// How many interchangeable variants exist per terrain texture family.
// GameScene picks one per cell from a positional hash so the map looks
// varied but stays identical between renders of the same cell.
export const GRASS_VARIANTS = 8;
export const DIRT_VARIANTS = 6;
export const EDGE_VARIANTS = 2;
export const RUT_VARIANTS = 2;
export const BREAKABLE_VARIANTS = 3;

// ─── Terrain palettes ───────────────────────────────────
const GRASS_BASES = [0x2E7D32, 0x2C7730, 0x307D34, 0x2D742F, 0x2F7A33, 0x2E8035];
const GRASS_BLOTCH = [0x2C7730, 0x318034, 0x2A7430, 0x2F7B36, 0x2D7A33];
const GRASS_SPECK = [0x388E3C, 0x256A2A, 0x43A047, 0x33691E, 0x4CAF50, 0x1B5E20, 0x558B2F];

const DIRT_BASES = [0x8D6E63, 0x8A6A5F, 0x917468, 0x86655A, 0x8B6C60, 0x947A6D];
const DIRT_BLOTCH = [0x795548, 0x9C8479, 0x82635A, 0x8F7063, 0x8A6E62];
const DIRT_SPECK = [0x795548, 0xA1887F, 0x6D4C41, 0x9C8479, 0x5D4037, 0xB09287];

export const TOWER_KEYS = ['water', 'air', 'fire', 'earth', 'ice', 'storm', 'lava', 'mud'];
const ENEMY_KEYS = ['slime', 'golem', 'specter', 'dragon'];
const SIDES = ['top', 'bottom', 'left', 'right'];

/** Every texture key the game can request once BootScene has finished. */
export function expectedTextureKeys() {
    const keys = ['hero', 'hero_shadow', 'mana_mote', 'tile_barricade',
        'btn_bg', 'btn_bg_sel', 'btn_bg_off', 'btn_build', 'btn_build_sel'];

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

/** Small deterministic PRNG so textures look the same every run. */
function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function pick(rnd, arr) {
    return arr[Math.floor(rnd() * arr.length) % arr.length];
}

/**
 * Plots a pixel addressed by (i = position along an edge, k = depth inward)
 * so one routine can draw the same motif on all four sides of a tile.
 */
function edgePixel(g, side, i, k, color, alpha = 1) {
    if (i < 0 || i > 31 || k < 0 || k > 31) return;
    g.fillStyle(color, alpha);
    if (side === 'top') g.fillRect(i, k, 1, 1);
    else if (side === 'bottom') g.fillRect(i, 31 - k, 1, 1);
    else if (side === 'left') g.fillRect(k, i, 1, 1);
    else g.fillRect(31 - k, i, 1, 1);
}

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
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

        this.scene.start('GameScene');
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

    // ─── Grass (32×32) ─────────────────────────────────
    _generateGrass() {
        for (let v = 0; v < GRASS_VARIANTS; v++) {
            this._draw(`grass_${v}`, 32, 32, (g) => {
                const rnd = makeRng(0xA11CE + v * 7919);

                g.fillStyle(GRASS_BASES[v % GRASS_BASES.length]);
                g.fillRect(0, 0, 32, 32);

                // Small, low-contrast blotches break up the flat fill without
                // drawing attention to where one tile ends and the next begins
                for (let i = 0; i < 9; i++) {
                    g.fillStyle(pick(rnd, GRASS_BLOTCH));
                    const w = 4 + Math.floor(rnd() * 7);
                    const h = 3 + Math.floor(rnd() * 6);
                    g.fillRect(
                        Math.floor(rnd() * 32) - (w >> 1),
                        Math.floor(rnd() * 32) - (h >> 1),
                        w, h
                    );
                }

                // Fine speckle
                for (let i = 0; i < 40; i++) {
                    g.fillStyle(pick(rnd, GRASS_SPECK));
                    const s = rnd() < 0.22 ? 2 : 1;
                    g.fillRect(Math.floor(rnd() * 32), Math.floor(rnd() * 32), s, s);
                }

                // Blades
                for (let i = 0; i < 7; i++) {
                    g.fillStyle(rnd() < 0.5 ? 0x43A047 : 0x1B5E20);
                    g.fillRect(1 + Math.floor(rnd() * 30), 2 + Math.floor(rnd() * 27), 1, 2);
                }

                // Flora lives on a few variants only, so it stays sparse map-wide
                if (v === 5) {
                    for (let i = 0; i < 2; i++) {
                        const fx = 4 + Math.floor(rnd() * 24);
                        const fy = 5 + Math.floor(rnd() * 21);
                        g.fillStyle(0x1B5E20); g.fillRect(fx, fy + 2, 1, 2);
                        g.fillStyle(0xE6C229); g.fillRect(fx - 1, fy, 3, 2);
                        g.fillStyle(0xF5E08A); g.fillRect(fx, fy, 1, 1);
                    }
                } else if (v === 6) {
                    const rx = 8 + Math.floor(rnd() * 14);
                    const ry = 10 + Math.floor(rnd() * 12);
                    g.fillStyle(0x33691E); g.fillRect(rx - 1, ry + 3, 7, 1);
                    g.fillStyle(0x757575); g.fillRect(rx, ry, 5, 3);
                    g.fillStyle(0x9E9E9E); g.fillRect(rx + 1, ry, 3, 1);
                    g.fillStyle(0x616161); g.fillRect(rx, ry + 2, 5, 1);
                } else if (v === 7) {
                    for (let i = 0; i < 10; i++) {
                        g.fillStyle(rnd() < 0.5 ? 0x1B5E20 : 0x33691E);
                        g.fillRect(6 + Math.floor(rnd() * 18), 8 + Math.floor(rnd() * 14), 1, 3);
                    }
                    const fx = 5 + Math.floor(rnd() * 22);
                    const fy = 5 + Math.floor(rnd() * 20);
                    g.fillStyle(0xECEFF1); g.fillRect(fx, fy, 2, 2);
                    g.fillStyle(0xFFFFFF); g.fillRect(fx, fy, 1, 1);
                }
            });
        }
    }

    // ─── Dirt road (32×32) ─────────────────────────────
    _generateDirt() {
        for (let v = 0; v < DIRT_VARIANTS; v++) {
            this._draw(`dirt_${v}`, 32, 32, (g) => {
                const rnd = makeRng(0xD137 + v * 6151);

                g.fillStyle(DIRT_BASES[v % DIRT_BASES.length]);
                g.fillRect(0, 0, 32, 32);

                for (let i = 0; i < 5; i++) {
                    g.fillStyle(pick(rnd, DIRT_BLOTCH));
                    const w = 8 + Math.floor(rnd() * 14);
                    const h = 6 + Math.floor(rnd() * 12);
                    g.fillRect(
                        Math.floor(rnd() * 32) - (w >> 1),
                        Math.floor(rnd() * 32) - (h >> 1),
                        w, h
                    );
                }

                for (let i = 0; i < 42; i++) {
                    g.fillStyle(pick(rnd, DIRT_SPECK));
                    const s = rnd() < 0.2 ? 2 : 1;
                    g.fillRect(Math.floor(rnd() * 32), Math.floor(rnd() * 32), s, s);
                }

                // Pebbles with a one-pixel drop shadow
                for (let i = 0; i < 5; i++) {
                    const px = 1 + Math.floor(rnd() * 28);
                    const py = 1 + Math.floor(rnd() * 27);
                    const pw = rnd() < 0.4 ? 2 : 3;
                    g.fillStyle(0x5D4037); g.fillRect(px, py + 2, pw, 1);
                    g.fillStyle(0xBCAAA4); g.fillRect(px, py, pw, 2);
                    g.fillStyle(0xD7CCC8); g.fillRect(px, py, 1, 1);
                }

                // Dried-out cracks
                for (let i = 0; i < 3; i++) {
                    let cx = 2 + Math.floor(rnd() * 28);
                    let cy = 2 + Math.floor(rnd() * 28);
                    const len = 3 + Math.floor(rnd() * 5);
                    for (let k = 0; k < len; k++) {
                        g.fillStyle(0x5D4037, 0.6);
                        g.fillRect(cx, cy, 1, 1);
                        cx += rnd() < 0.5 ? 1 : 0;
                        cy += rnd() < 0.5 ? 1 : -1;
                    }
                }
            });
        }
    }

    // ─── Wheel ruts, drawn along the direction of travel ───
    _generateRuts() {
        for (let v = 0; v < RUT_VARIANTS; v++) {
            for (const dir of ['h', 'v']) {
                this._draw(`rut_${dir}_${v}`, 32, 32, (g) => {
                    const rnd = makeRng(0xB00B + v * 131 + (dir === 'h' ? 7 : 19));

                    for (const off of [-6, 6]) {
                        for (let i = 0; i < 32; i++) {
                            const wob = Math.round(Math.sin((i + v * 5) * 0.28) * 1.4);
                            const j = 16 + off + wob;
                            if (dir === 'h') {
                                g.fillStyle(0x6D4C41, 0.5); g.fillRect(i, j, 1, 2);
                                g.fillStyle(0xA1887F, 0.22); g.fillRect(i, j + 2, 1, 1);
                            } else {
                                g.fillStyle(0x6D4C41, 0.5); g.fillRect(j, i, 2, 1);
                                g.fillStyle(0xA1887F, 0.22); g.fillRect(j + 2, i, 1, 1);
                            }
                        }
                    }

                    // Scuffs down the middle of the lane
                    for (let i = 0; i < 9; i++) {
                        g.fillStyle(0x6D4C41, 0.28);
                        if (dir === 'h') {
                            g.fillRect(Math.floor(rnd() * 29), 13 + Math.floor(rnd() * 6), 3, 1);
                        } else {
                            g.fillRect(13 + Math.floor(rnd() * 6), Math.floor(rnd() * 29), 1, 3);
                        }
                    }
                });
            }
        }
    }

    // ─── Grass lip overlaid on road tiles that touch grass ───
    _generateEdges() {
        for (const side of ['top', 'bottom', 'left', 'right']) {
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
                            const shade = k === d - 1
                                ? 0x1B5E20
                                : pick(rnd, [0x2E7D32, 0x388E3C, 0x256A2A]);
                            edgePixel(g, side, i, k, shade);
                        }
                        // Dirt darkens where the grass overhangs it
                        edgePixel(g, side, i, d, 0x5D4037, 0.45);
                        edgePixel(g, side, i, d + 1, 0x6D4C41, 0.22);
                    }

                    // Stray blades reaching out over the road
                    for (let i = 0; i < 6; i++) {
                        const p = Math.floor(rnd() * 32);
                        const k = 4 + Math.floor(rnd() * 3);
                        edgePixel(g, side, p, k, 0x388E3C);
                        edgePixel(g, side, p, k - 1, 0x2E7D32);
                    }
                });
            }
        }
    }

    // ─── Grass nubs for inside corners of the road ───────
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
                        g.fillStyle(pick(rnd, [0x2E7D32, 0x388E3C, 0x256A2A]));
                        g.fillRect(px(x), py(y), 1, 1);
                    }
                    g.fillStyle(0x1B5E20); g.fillRect(px(rows[y]), py(y), 1, 1);
                    g.fillStyle(0x5D4037, 0.4); g.fillRect(px(rows[y] + 1), py(y), 1, 1);
                }
            });
        }
    }

    // ─── Dirt spilling onto grass tiles beside the road ───
    _generateScatter() {
        for (const side of ['top', 'bottom', 'left', 'right']) {
            this._draw(`scat_${side}`, 32, 32, (g) => {
                const rnd = makeRng(0x5CA7 + side.charCodeAt(0) * 61);
                for (let i = 0; i < 18; i++) {
                    const p = Math.floor(rnd() * 32);
                    const k = Math.floor(rnd() * 6);
                    const a = Math.max(0.08, 0.5 - k * 0.07);
                    edgePixel(g, side, p, k, pick(rnd, [0x795548, 0x6D4C41, 0xA1887F]), a);
                }
            });
        }
    }

    // ─── Breakable boulders & barricades ────────────────
    _generateObstacles() {
        for (let v = 0; v < BREAKABLE_VARIANTS; v++) {
            this._draw(`breakable_${v}`, 32, 32, (g) => {
                const rnd = makeRng(0xB4EA + v * 4093);

                // Irregular silhouette — a grid of rectangles read as a brick
                // wall, a lumpy rock reads as rubble you have to smash through.
                const top = 3 + Math.floor(rnd() * 2);
                const bottom = 27 + Math.floor(rnd() * 2);
                const prof = [];
                for (let y = top; y <= bottom; y++) {
                    const t = (y - top) / (bottom - top);
                    const bulge = Math.sin(t * Math.PI) * 0.42 + 0.58;
                    const half = 7.5 + bulge * 6.5;
                    const jit = Math.floor(rnd() * 3) - 1;
                    prof.push([
                        Math.max(1, Math.round(16 - half) + jit),
                        Math.min(30, Math.round(16 + half) + jit),
                    ]);
                }

                // Ground shadow
                g.fillStyle(0x000000, 0.22);
                g.fillRect(prof[prof.length - 1][0], bottom, prof[prof.length - 1][1] - prof[prof.length - 1][0] + 1, 3);

                // Outline pass
                g.fillStyle(0x3E2723);
                prof.forEach(([x0, x1], i) => g.fillRect(x0 - 1, top + i, x1 - x0 + 3, 1));
                g.fillRect(prof[0][0], top - 1, prof[0][1] - prof[0][0] + 1, 1);

                // Body, lit from the top-left
                prof.forEach(([x0, x1], i) => {
                    const t = i / (prof.length - 1);
                    g.fillStyle(t < 0.32 ? 0x8D6E63 : t < 0.7 ? 0x795548 : 0x6D4C41);
                    g.fillRect(x0, top + i, x1 - x0 + 1, 1);
                });

                // Highlight facet
                g.fillStyle(0xA1887F);
                g.fillRect(prof[1][0] + 2, top + 1, 7, 3);
                g.fillRect(prof[2][0] + 2, top + 4, 4, 2);

                // Cracks — a short random walk down the face
                g.lineStyle(1, 0x3E2723);
                g.beginPath();
                let cx = 12 + Math.floor(rnd() * 8);
                let cy = top + 2;
                g.moveTo(cx, cy);
                for (let k = 0; k < 3; k++) {
                    cx += Math.floor(rnd() * 9) - 4;
                    cy += 4 + Math.floor(rnd() * 5);
                    g.lineTo(cx, Math.min(cy, bottom - 1));
                }
                g.moveTo(cx, Math.min(cy, bottom - 1));
                g.lineTo(cx + (rnd() < 0.5 ? -7 : 7), Math.min(cy, bottom - 1) - 4);
                g.strokePath();

                // Chips and moss
                for (let i = 0; i < 8; i++) {
                    const row = 2 + Math.floor(rnd() * (prof.length - 4));
                    const [x0, x1] = prof[row];
                    g.fillStyle(rnd() < 0.7 ? 0x4E342E : 0x33691E);
                    g.fillRect(x0 + 1 + Math.floor(rnd() * (x1 - x0 - 2)), top + row, 2, 1);
                }
            });
        }

        // Barricade — transparent background so the road shows around it
        this._draw('tile_barricade', 32, 32, (g) => {
            g.fillStyle(0x000000, 0.22); g.fillRect(5, 26, 23, 3);
            g.fillStyle(0x3E2723);
            g.fillRect(4, 8, 24, 4);
            g.fillRect(4, 20, 24, 4);
            g.fillRect(8, 4, 4, 24);
            g.fillRect(20, 4, 4, 24);
            g.fillStyle(0x5D4037);
            g.fillRect(4, 8, 24, 1);
            g.fillRect(4, 20, 24, 1);
            g.fillRect(8, 4, 1, 24);
            g.fillRect(20, 4, 1, 24);
            g.fillStyle(0x9E9E9E);
            g.fillRect(9, 9, 2, 2);
            g.fillRect(21, 9, 2, 2);
            g.fillRect(9, 21, 2, 2);
            g.fillRect(21, 21, 2, 2);
        });
    }

    // ─── Towers (16×16) ─────────────────────────────────
    // Every tower keeps at least a 1px transparent margin so neighbouring
    // towers never bleed into each other, even mid-recoil.
    _generateTowers() {
        // Water — blue droplet on stone
        this._draw('tower_water', 16, 16, (g) => {
            g.fillStyle(0x5D4037);
            g.fillRect(4, 9, 8, 6);
            g.fillStyle(0x795548);
            g.fillRect(5, 10, 6, 4);
            g.fillStyle(0x0288D1);
            g.fillRect(5, 2, 6, 8);
            g.fillRect(4, 4, 8, 4);
            g.fillStyle(0x4FC3F7);
            g.fillRect(6, 3, 4, 6);
            g.fillStyle(0x81D4FA);
            g.fillRect(7, 4, 2, 2);
        });

        // Air — swirl pillar
        this._draw('tower_air', 16, 16, (g) => {
            g.fillStyle(0x78909C);
            g.fillRect(5, 9, 6, 6);
            g.fillStyle(0xB0BEC5);
            g.fillRect(4, 2, 8, 8);
            g.fillRect(5, 1, 6, 2);
            g.fillStyle(0xECEFF1);
            g.fillRect(5, 3, 6, 5);
            g.fillStyle(0xFFFFFF);
            g.fillRect(6, 4, 1, 1);
            g.fillRect(8, 5, 1, 1);
            g.fillRect(7, 3, 1, 1);
            g.fillRect(9, 6, 1, 1);
        });

        // Fire — flame on dark base
        this._draw('tower_fire', 16, 16, (g) => {
            g.fillStyle(0x4E342E);
            g.fillRect(4, 10, 8, 5);
            g.fillStyle(0xE64A19);
            g.fillRect(5, 4, 6, 7);
            g.fillRect(6, 2, 4, 3);
            g.fillStyle(0xFF7043);
            g.fillRect(6, 5, 4, 4);
            g.fillStyle(0xFFCA28);
            g.fillRect(7, 3, 2, 4);
            g.fillStyle(0xFFF176);
            g.fillRect(7, 1, 2, 2);
        });

        // Earth — rocky monolith
        this._draw('tower_earth', 16, 16, (g) => {
            g.fillStyle(0x3E2723);
            g.fillRect(3, 3, 10, 12);
            g.fillStyle(0x5D4037);
            g.fillRect(4, 4, 8, 10);
            g.fillStyle(0x8D6E63);
            g.fillRect(5, 5, 6, 4);
            g.fillRect(5, 11, 6, 2);
            g.fillStyle(0x4E342E);
            g.fillRect(6, 9, 4, 1);
            g.fillRect(5, 7, 1, 2);
            g.fillRect(10, 6, 1, 3);
        });

        // Ice — crystal spire
        this._draw('tower_ice', 16, 16, (g) => {
            g.fillStyle(0x4DD0E1);
            g.fillRect(6, 9, 4, 6);
            g.fillRect(5, 11, 6, 4);
            g.fillStyle(0x80DEEA);
            g.fillRect(5, 2, 6, 8);
            g.fillRect(4, 4, 8, 5);
            g.fillRect(6, 1, 4, 2);
            g.fillStyle(0xE0F7FA);
            g.fillRect(6, 3, 3, 5);
            g.fillRect(7, 2, 2, 1);
            g.fillStyle(0xFFFFFF);
            g.fillRect(7, 3, 1, 1);
            g.fillRect(8, 5, 1, 1);
        });

        // Storm — lightning pillar
        this._draw('tower_storm', 16, 16, (g) => {
            g.fillStyle(0x4A148C);
            g.fillRect(4, 9, 8, 6);
            g.fillStyle(0x7C4DFF);
            g.fillRect(5, 3, 6, 7);
            g.fillRect(6, 2, 4, 2);
            g.fillStyle(0xFFD54F);
            g.fillRect(7, 1, 3, 2);
            g.fillRect(6, 3, 3, 2);
            g.fillRect(7, 5, 3, 2);
            g.fillRect(6, 7, 3, 2);
            g.fillStyle(0xFFFF8D);
            g.fillRect(7, 2, 2, 1);
            g.fillRect(7, 6, 2, 1);
        });

        // Lava — magma pillar
        this._draw('tower_lava', 16, 16, (g) => {
            g.fillStyle(0xBF360C);
            g.fillRect(3, 3, 10, 12);
            g.fillStyle(0xDD2C00);
            g.fillRect(4, 4, 8, 10);
            g.fillStyle(0xFF6E40);
            g.fillRect(5, 5, 2, 3);
            g.fillRect(9, 7, 2, 3);
            g.fillRect(6, 10, 3, 2);
            g.fillStyle(0xFFAB40);
            g.fillRect(5, 6, 1, 1);
            g.fillRect(10, 8, 1, 1);
            g.fillRect(7, 11, 1, 1);
            g.fillStyle(0xFFD54F);
            g.fillRect(6, 5, 1, 1);
        });

        // Mud — earthy blob
        this._draw('tower_mud', 16, 16, (g) => {
            g.fillStyle(0x5D4037);
            g.fillRect(3, 8, 10, 7);
            g.fillStyle(0x795548);
            g.fillRect(4, 5, 8, 8);
            g.fillStyle(0x4DB6AC);
            g.fillRect(5, 3, 6, 7);
            g.fillRect(4, 5, 8, 3);
            g.fillStyle(0x80CBC4);
            g.fillRect(6, 4, 4, 4);
            g.fillStyle(0x4DB6AC);
            g.fillRect(4, 10, 2, 3);
            g.fillRect(10, 9, 2, 3);
        });
    }

    // ─── Temples (16×16) ────────────────────────────────
    /**
     * Every temple shares one stone shell — plinth, four columns, pediment —
     * and differs only in the element burning in the cella and set in the
     * gable stone. They have to read as the same institution consecrated to
     * eight different powers, not as eight unrelated buildings.
     */
    _generateTemples() {
        const PALETTES = {
            water: [0x81D4FA, 0x4FC3F7, 0x0288D1],
            air: [0xECEFF1, 0xB0BEC5, 0x78909C],
            fire: [0xFFCA28, 0xFF7043, 0xE64A19],
            earth: [0xBCAAA4, 0x8D6E63, 0x5D4037],
            ice: [0xE0F7FA, 0x80DEEA, 0x4DD0E1],
            storm: [0xFFFF8D, 0xFFD54F, 0x7C4DFF],
            lava: [0xFFAB40, 0xFF6E40, 0xDD2C00],
            mud: [0x80CBC4, 0x4DB6AC, 0x00897B],
        };

        const STONE_LIT = 0xCFD8DC;
        const STONE = 0x90A4AE;
        const STONE_DARK = 0x546E7A;
        const STONE_DEEP = 0x37474F;

        // Columns are 2px wide on a 16px sprite, spaced so the row reads
        // symmetrically about the centre line at x = 7.5.
        const COLUMNS = [1, 5, 9, 13];

        for (const [el, [light, mid, dark]] of Object.entries(PALETTES)) {
            this._draw(`temple_${el}`, 16, 16, (g) => {
                // Ground shadow
                g.fillStyle(0x000000, 0.25);
                g.fillRect(2, 15, 12, 1);

                // Stepped plinth
                g.fillStyle(STONE_DEEP); g.fillRect(0, 14, 16, 1);
                g.fillStyle(STONE_DARK); g.fillRect(0, 13, 16, 1);
                g.fillStyle(STONE); g.fillRect(1, 12, 14, 1);
                g.fillStyle(STONE_LIT); g.fillRect(1, 12, 14, 1);
                g.fillStyle(STONE); g.fillRect(1, 13, 14, 1);

                // Cella — the element itself, glowing behind the colonnade
                g.fillStyle(0x10101e); g.fillRect(1, 6, 14, 6);
                g.fillStyle(dark); g.fillRect(2, 7, 12, 5);
                g.fillStyle(mid); g.fillRect(3, 8, 10, 4);
                g.fillStyle(light); g.fillRect(5, 9, 6, 3);
                g.fillStyle(0xFFFFFF, 0.55); g.fillRect(7, 10, 2, 1);

                // Colonnade
                for (const x of COLUMNS) {
                    g.fillStyle(STONE_DARK); g.fillRect(x, 6, 2, 6);
                    g.fillStyle(STONE); g.fillRect(x, 6, 1, 6);
                    g.fillStyle(STONE_LIT); g.fillRect(x, 6, 1, 1);
                    g.fillStyle(STONE_DEEP); g.fillRect(x, 11, 2, 1);
                }

                // Architrave — the last stone band before the roof
                g.fillStyle(STONE_LIT); g.fillRect(0, 5, 16, 1);

                // Pediment. Roofed in the element rather than in stone: at the
                // 30px the sidebar button gives it, the gable is the only part
                // big enough to tell four temples apart at a glance.
                g.fillStyle(dark); g.fillRect(1, 4, 14, 1);
                g.fillStyle(mid); g.fillRect(1, 4, 7, 1);
                g.fillStyle(dark); g.fillRect(3, 3, 10, 1);
                g.fillStyle(mid); g.fillRect(3, 3, 5, 1);
                g.fillStyle(dark); g.fillRect(5, 2, 6, 1);
                g.fillStyle(mid); g.fillRect(5, 2, 3, 1);
                g.fillStyle(light); g.fillRect(7, 1, 2, 1);

                // Gable stone set in the centre of the tympanum
                g.fillStyle(light); g.fillRect(7, 3, 2, 2);
                g.fillStyle(0xFFFFFF); g.fillRect(7, 3, 1, 1);

                // Braziers flanking the steps
                g.fillStyle(mid); g.fillRect(0, 11, 1, 1);
                g.fillStyle(mid); g.fillRect(15, 11, 1, 1);
            });
        }
    }

    // ─── Enemies (16×16) ────────────────────────────────
    _generateEnemies() {
        // Slime
        this._draw('enemy_slime', 16, 16, (g) => {
            g.fillStyle(0x388E3C);
            g.fillRect(3, 8, 10, 6);
            g.fillRect(2, 10, 12, 4);
            g.fillStyle(0x66BB6A);
            g.fillRect(4, 6, 8, 6);
            g.fillRect(5, 5, 6, 2);
            g.fillStyle(0x81C784);
            g.fillRect(5, 7, 4, 3);
            // Eyes
            g.fillStyle(0xFFFFFF);
            g.fillRect(5, 8, 2, 2);
            g.fillRect(9, 8, 2, 2);
            g.fillStyle(0x1B5E20);
            g.fillRect(6, 9, 1, 1);
            g.fillRect(10, 9, 1, 1);
        });

        // Golem
        this._draw('enemy_golem', 16, 16, (g) => {
            g.fillStyle(0x616161);
            g.fillRect(3, 3, 10, 13);
            g.fillStyle(0x9E9E9E);
            g.fillRect(4, 4, 8, 11);
            g.fillStyle(0xBDBDBD);
            g.fillRect(5, 5, 6, 4);
            g.fillStyle(0xFF6F00);
            g.fillRect(5, 6, 2, 2);
            g.fillRect(9, 6, 2, 2);
            g.fillStyle(0x757575);
            g.fillRect(2, 7, 2, 5);
            g.fillRect(12, 7, 2, 5);
        });

        // Specter
        this._draw('enemy_specter', 16, 16, (g) => {
            g.fillStyle(0xAB47BC);
            g.fillRect(4, 3, 8, 10);
            g.fillRect(3, 5, 10, 6);
            g.fillStyle(0xCE93D8);
            g.fillRect(5, 4, 6, 7);
            // Wavy bottom
            g.fillStyle(0xAB47BC);
            g.fillRect(3, 12, 2, 2);
            g.fillRect(7, 12, 2, 2);
            g.fillRect(11, 12, 2, 2);
            g.fillRect(5, 13, 2, 3);
            g.fillRect(9, 13, 2, 3);
            // Eyes
            g.fillStyle(0xFFFFFF);
            g.fillRect(5, 6, 2, 2);
            g.fillRect(9, 6, 2, 2);
            g.fillStyle(0xE1BEE7);
            g.fillRect(6, 7, 1, 1);
            g.fillRect(10, 7, 1, 1);
        });

        // Dragon
        this._draw('enemy_dragon', 16, 16, (g) => {
            // Body
            g.fillStyle(0xC62828);
            g.fillRect(4, 5, 8, 8);
            g.fillRect(5, 4, 6, 2);
            g.fillStyle(0xEF5350);
            g.fillRect(5, 6, 6, 6);
            // Wings
            g.fillStyle(0xE53935);
            g.fillRect(1, 4, 3, 5);
            g.fillRect(12, 4, 3, 5);
            g.fillRect(0, 5, 2, 3);
            g.fillRect(14, 5, 2, 3);
            // Head
            g.fillStyle(0xD32F2F);
            g.fillRect(5, 2, 6, 3);
            // Eyes
            g.fillStyle(0xFFD54F);
            g.fillRect(6, 3, 2, 1);
            g.fillRect(10, 3, 2, 1);
            // Belly
            g.fillStyle(0xFFCA28);
            g.fillRect(6, 9, 4, 3);
            // Tail
            g.fillStyle(0xC62828);
            g.fillRect(4, 12, 2, 2);
            g.fillRect(3, 13, 2, 2);
        });
    }

    // ─── Hero (16×16) ───────────────────────────────────
    _generateHero() {
        this._draw('hero', 16, 16, (g) => {
            // Cape
            g.fillStyle(0x7E57C2);
            g.fillRect(3, 5, 2, 8);
            g.fillRect(2, 8, 2, 5);
            // Body armor
            g.fillStyle(0x5C6BC0);
            g.fillRect(5, 4, 6, 9);
            g.fillStyle(0x7986CB);
            g.fillRect(6, 5, 4, 7);
            // Head
            g.fillStyle(0xFFCC80);
            g.fillRect(6, 1, 4, 4);
            g.fillStyle(0xFFE0B2);
            g.fillRect(7, 2, 2, 2);
            // Hair
            g.fillStyle(0x4E342E);
            g.fillRect(6, 0, 4, 2);
            g.fillRect(5, 1, 2, 2);
            // Eyes
            g.fillStyle(0x283593);
            g.fillRect(7, 3, 1, 1);
            g.fillRect(9, 3, 1, 1);
            // Sword
            g.fillStyle(0xE0E0E0);
            g.fillRect(11, 2, 1, 8);
            g.fillStyle(0xBDBDBD);
            g.fillRect(11, 10, 1, 2);
            g.fillStyle(0xFFD54F);
            g.fillRect(10, 5, 3, 1);
            // Legs
            g.fillStyle(0x3949AB);
            g.fillRect(6, 13, 2, 3);
            g.fillRect(8, 13, 2, 3);
            // Boots
            g.fillStyle(0x5D4037);
            g.fillRect(5, 14, 3, 2);
            g.fillRect(8, 14, 3, 2);
        });

        // Soft shadow so the hero reads as standing on the ground
        this._draw('hero_shadow', 20, 8, (g) => {
            g.fillStyle(0x000000, 0.28);
            g.fillEllipse(10, 4, 18, 7);
        });
    }

    // ─── Projectiles (5×5) ──────────────────────────────
    _generateProjectiles() {
        const colors = {
            water: 0x4FC3F7, air: 0xECEFF1, fire: 0xFF7043, earth: 0x8D6E63,
            ice: 0x80DEEA, storm: 0xFFD54F, lava: 0xFF6E40, mud: 0x4DB6AC,
        };
        for (const [el, col] of Object.entries(colors)) {
            this._draw(`proj_${el}`, 5, 5, (g) => {
                g.fillStyle(col);
                g.fillCircle(2, 2, 2);
                g.fillStyle(0xFFFFFF, 0.6);
                g.fillRect(1, 1, 1, 1);
            });
        }
    }

    // ─── Mana Mote (8×8) ────────────────────────────────
    _generateManaMote() {
        this._draw('mana_mote', 8, 8, (g) => {
            g.fillStyle(0xFFA000);
            g.fillCircle(4, 4, 4);
            g.fillStyle(0xFFD700);
            g.fillCircle(4, 4, 3);
            g.fillStyle(0xFFF176);
            g.fillCircle(3, 3, 2);
            g.fillStyle(0xFFFFFF);
            g.fillRect(2, 2, 2, 2);
        });
    }

    // ─── UI textures ────────────────────────────────────
    _generateUI() {
        // Normal button bg
        this._draw('btn_bg', 40, 40, (g) => {
            g.fillStyle(0x1e1e3a);
            g.fillRect(0, 0, 40, 40);
            g.lineStyle(2, 0x3a3a5a);
            g.strokeRect(1, 1, 38, 38);
        });

        // Selected button bg
        this._draw('btn_bg_sel', 40, 40, (g) => {
            g.fillStyle(0x2a2a5a);
            g.fillRect(0, 0, 40, 40);
            g.lineStyle(2, 0xFFD54F);
            g.strokeRect(1, 1, 38, 38);
        });

        // Build buttons carry a 16px icon at 2.4x plus a price line beneath it,
        // so they are sized for both rather than for the icon alone.
        this._draw('btn_build', 56, 62, (g) => {
            g.fillStyle(0x1e1e3a);
            g.fillRect(0, 0, 56, 62);
            g.lineStyle(2, 0x3a3a5a);
            g.strokeRect(1, 1, 54, 60);
        });

        this._draw('btn_build_sel', 56, 62, (g) => {
            g.fillStyle(0x2a2a5a);
            g.fillRect(0, 0, 56, 62);
            g.lineStyle(2, 0xFFD54F);
            g.strokeRect(1, 1, 54, 60);
        });

        // Disabled button bg
        this._draw('btn_bg_off', 40, 40, (g) => {
            g.fillStyle(0x151525);
            g.fillRect(0, 0, 40, 40);
            g.lineStyle(2, 0x252535);
            g.strokeRect(1, 1, 38, 38);
        });
    }
}
