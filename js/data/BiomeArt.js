import {
    makeRng, pick, ellipse, profile, rough, volume, line, groundShadow, edgePixel,
} from '../systems/Pixels.js';
import {
    EL, GOLD, SOUL, CITY, ROOFS, TIMBER, WALL, FOLIAGE, AWNING, SACK, HAY,
    VOLCANO, OBSIDIAN, SNOW, DUNGEON, CRYPT,
} from './Palette.js';
import {
    DIRT_VARIANTS, EDGE_VARIANTS, BREAKABLE_VARIANTS, HOUSE_VARIANTS, TREE_VARIANTS,
    STALL_VARIANTS, SIDES, CORNERS, BIOMES, biomeKey, groundVariants,
} from '../systems/Terrain.js';

/**
 * Terrain art for every biome except 'grass' (which BootScene has always drawn
 * itself), plus the town that rings a 'city' board. Same rules as
 * the rest of the board: 32×32, light from the top-left, outlines from the
 * material's own darkest stop.
 *
 * The one rule that outranks the material: buildable ground is dark and the
 * road is light. Snow is still a dark slate field with a bright lane through
 * it, never a white field — the board is read by its values, and a pale floor
 * would swallow every tower and bolt standing on it.
 *
 * And one rule about texture: the floor is a surface, not a pattern. Anything
 * laid edge to edge in a regular grid — bricks, tiles, setts — repeats every
 * 32px and turns the whole board into a bathroom wall. Detail comes in small
 * clusters on a calm field, the way the lawn does it.
 *
 * Doesn't import Phaser, so the offline preview can draw it into a PNG.
 */

// Wood for crates, counters and barrels — the timber ramp lit one stop up.
const WOOD = { deep: TIMBER.deep, dark: TIMBER.mid, mid: TIMBER.light, light: TIMBER.glow, glow: 0x9a7448 };
const IRON = { deep: 0x0a0a10, dark: 0x1c1c26, mid: 0x30303e, light: 0x4a4a5c, glow: 0x6a6a80 };
const OUT = 0x0b0806;

function px(g, color, x, y, w = 1, h = 1, a = 1) {
    g.fillStyle(color, a);
    g.fillRect(x, y, w, h);
}

/** A texture list entry. */
const tex = (key, draw, w = 32, h = 32) => ({ key, w, h, draw });

/** Soft, rounded blotch — the lawn's turf patch, for any floor. */
function patch(g, rnd, color, alpha, minW = 9, spanW = 13, minH = 7, spanH = 9) {
    const w = minW + Math.floor(rnd() * spanW);
    const h = minH + Math.floor(rnd() * spanH);
    const x = Math.floor(rnd() * 32) - (w >> 1);
    const y = Math.floor(rnd() * 32) - (h >> 1);
    for (let k = 0; k < h; k++) {
        const t = 1 - Math.abs((k / Math.max(1, h - 1)) * 2 - 1);
        const inset = Math.round((1 - t) * 3);
        px(g, color, x + inset, y + k, Math.max(1, w - inset * 2), 1, alpha);
    }
}

// ─── Shared transition pieces ───────────────────────────

/** An organic lip — rubble, snowbank — the ground spilling over the road. */
function lipEdge(g, side, v, L, seed, crest = null) {
    const rnd = makeRng(seed + v * 977 + side.charCodeAt(0) * 31);
    for (let i = 0; i < 32; i++) {
        let d = 2 + Math.round(Math.sin((i + v * 9) * 0.55) + Math.sin((i + v * 3) * 0.21) * 1.4);
        if (rnd() < 0.18) d += 1;
        d = Math.max(2, Math.min(5, d));
        for (let k = 0; k < d; k++) {
            // Lit crown, body, and a dark underside that is the road's outline
            const shade = k === d - 1 ? L.shadow
                : k === 0 ? (rnd() < 0.5 ? L.light : L.mid)
                    : pick(rnd, [L.base, L.mid, L.deep]);
            edgePixel(g, side, i, k, shade);
        }
        if (crest && rnd() < crest.chance && d > 2) edgePixel(g, side, i, d - 2, crest.color, crest.alpha);
        edgePixel(g, side, i, d, L.cast, 0.45);
        edgePixel(g, side, i, d + 1, L.cast, 0.2);
    }
}
function lipCorner(g, name, L, seed) {
    const rnd = makeRng(seed + name.charCodeAt(0) * 313 + name.charCodeAt(1) * 17);
    const fx = name[1] === 'r', fy = name[0] === 'b';
    const X = (x) => (fx ? 31 - x : x);
    const Y = (y) => (fy ? 31 - y : y);
    const rows = [5, 5, 4, 3, 2];
    for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y]; x++) {
            px(g, y === 0 || x === 0 ? pick(rnd, [L.mid, L.light]) : pick(rnd, [L.base, L.mid, L.deep]), X(x), Y(y));
        }
        px(g, L.shadow, X(rows[y]), Y(y));
        px(g, L.cast, X(rows[y] + 1), Y(y), 1, 1, 0.35);
    }
}
/**
 * A dressed kerb: straight stones with joints, a lit top, a dark face toward
 * the road and the shadow it throws. Masonry biomes (city, crypt) use it —
 * worked stone does not wander the way a bank of earth does.
 */
function kerbEdge(g, side, v, R) {
    const off = v * 5;
    for (let i = 0; i < 32; i++) {
        const joint = (i + off) % 8 === 0;
        edgePixel(g, side, i, 0, joint ? R.deep : R.dark);
        edgePixel(g, side, i, 1, joint ? R.deep : ((i + off) % 8 === 1 ? R.light : R.mid));
        edgePixel(g, side, i, 2, joint ? R.deep : R.dark);
        edgePixel(g, side, i, 3, R.deep);
        edgePixel(g, side, i, 4, 0x000000, 0.34);
        edgePixel(g, side, i, 5, 0x000000, 0.14);
    }
}
function kerbCorner(g, name, R) {
    const fx = name[1] === 'r', fy = name[0] === 'b';
    const X = (x) => (fx ? 31 - x : x);
    const Y = (y) => (fy ? 31 - y : y);
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            const c = x === 3 || y === 3 ? R.deep : x === 1 && y === 1 ? R.light : y === 1 || x === 1 ? R.mid : R.dark;
            px(g, c, X(x), Y(y));
        }
    }
    for (let k = 0; k < 4; k++) {
        px(g, 0x000000, X(4), Y(k), 1, 1, 0.34);
        px(g, 0x000000, X(k), Y(4), 1, 1, 0.34);
    }
    px(g, 0x000000, X(4), Y(4), 1, 1, 0.34);
}
/** Lane material kicked onto the verge, fading with distance. */
function scatter(g, side, colors, seed, alpha = 0.45) {
    const rnd = makeRng(seed + side.charCodeAt(0) * 61);
    for (let i = 0; i < 18; i++) {
        const p = Math.floor(rnd() * 32);
        const k = Math.floor(rnd() * 6);
        edgePixel(g, side, p, k, pick(rnd, colors), Math.max(0.07, alpha - k * 0.07));
    }
}
/**
 * Inset slabs on a bed, never touching the tile edge — the same reason as
 * BootScene's flagstones: paving that meets the border draws the grid.
 */
function insetSlabs(rnd, count, minW, spanW, minH, spanH) {
    const placed = [];
    for (let i = 0; i < count * 6 && placed.length < count; i++) {
        const w = minW + Math.floor(rnd() * spanW);
        const h = minH + Math.floor(rnd() * spanH);
        const x = 2 + Math.floor(rnd() * (29 - w));
        const y = 2 + Math.floor(rnd() * (29 - h));
        if (placed.some(p => x < p.x + p.w + 2 && x + w + 2 > p.x && y < p.y + p.h + 2 && y + h + 2 > p.y)) continue;
        placed.push({ x, y, w, h });
    }
    return placed;
}

/**
 * Every road but the lawn's: a gravel bed with two or three flagstones of
 * different sizes set into it, never touching the tile edge — the geometry of
 * BootScene's dirt road exactly, so all five biomes are the same road in a
 * different stone. `bed` weights the gravel toward [base, mid, light, deep,
 * joint]; `body` is the slab's face stop; `finish` adds a biome's own marks to
 * each slab (a vent, a glint, a vein).
 */
function pavedRoad(g, v, P, seed, { bed = [0.2, 0.3, 0.4, 0.07], body = 'light', finish = null } = {}) {
    const rnd = makeRng(seed + v * 6151);
    const [b0, b1, b2, b3] = bed;
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
            const r = rnd();
            px(g, r < b0 ? P.base : r < b0 + b1 ? P.mid : r < b0 + b1 + b2 ? P.light
                : r < b0 + b1 + b2 + b3 ? P.deep : P.joint, x, y);
        }
    }
    for (const s of insetSlabs(rnd, 2 + (v % 2), 9, 7, 7, 5)) {
        px(g, P.joint, s.x - 1, s.y - 1, s.w + 2, s.h + 2);
        px(g, P[body], s.x, s.y, s.w, s.h);
        for (let i = 0; i < s.w * s.h * 0.3; i++) {
            px(g, rnd() < 0.6 ? P.mid : P.lit, s.x + Math.floor(rnd() * s.w), s.y + Math.floor(rnd() * s.h));
        }
        // Bevelled to the light, its own shade on the far sides
        px(g, P.lit, s.x, s.y, s.w, 1);
        px(g, P.lit, s.x, s.y, 1, s.h);
        px(g, P.glow, s.x + 1, s.y, Math.max(2, s.w >> 2), 1);
        px(g, P.deep, s.x, s.y + s.h - 1, s.w, 1);
        px(g, P.deep, s.x + s.w - 1, s.y, 1, s.h);
        // Chipped corners, so no slab reads as a rectangle
        for (const [cx, cy] of [[0, 0], [s.w - 1, 0], [0, s.h - 1], [s.w - 1, s.h - 1]]) px(g, P.joint, s.x + cx, s.y + cy);
        if (finish) finish(g, s, rnd);
    }
    // Hairline cracks wandering across the gravel
    for (let i = 0; i < 2; i++) {
        let cx = 2 + Math.floor(rnd() * 28), cy = 2 + Math.floor(rnd() * 28);
        for (let k = 0; k < 6 + Math.floor(rnd() * 6); k++) {
            px(g, P.joint, cx, cy, 1, 1, 0.6);
            cx += rnd() < 0.55 ? 1 : 0;
            cy += rnd() < 0.5 ? 1 : -1;
            if (cx > 30 || cy < 1 || cy > 30) break;
        }
    }
}

/** A hairline running down a slab — a vent in lava rock, a vein in marble. */
function slabHairline(color, chance, alpha = 1) {
    return (g, s, rnd) => {
        if (rnd() >= chance) return;
        let cx = s.x + 2 + Math.floor(rnd() * Math.max(1, s.w - 4)), cy = s.y + 1;
        for (let k = 1; k < s.h - 1; k++) {
            px(g, color, cx, cy, 1, 1, alpha);
            cy++;
            cx += rnd() < 0.5 ? 0 : (rnd() < 0.5 ? 1 : -1);
        }
    };
}

// ═══ CITY — market town ═════════════════════════════════

// Cobbles: rounded stones of uneven size, laid as one seamless 128px patch
// (a weighted Voronoi on a 16×16 jittered lattice, wrapped at the edges). Each
// cell takes the 32px piece under it — see Terrain's `groundTile` — so the
// stones run on across every seam and the pattern only repeats every four
// cells, which the eye does not catch the way it catches a 32px stamp.
const COBBLE = (() => {
    const N = 16, S = 8;
    const rnd = makeRng(0xC0BB1E);
    const seeds = [];
    for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
            seeds.push({ x: i * S + 1 + rnd() * (S - 2), y: j * S + 1 + rnd() * (S - 2), w: rnd() * 2.6, tone: rnd() });
        }
    }
    return { N, S, seeds };
})();

/** The stone under world pixel (wx, wy), and how far that pixel is from its edge. */
function cobbleAt(wx, wy) {
    const { N, S, seeds } = COBBLE;
    const ci = Math.floor(wx / S), cj = Math.floor(wy / S);
    let d1 = Infinity, d2 = Infinity, best = null, bx = 0, by = 0;
    for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
            const a = ci + di, b = cj + dj;
            const i = ((a % N) + N) % N, j = ((b % N) + N) % N;
            const s = seeds[j * N + i];
            const dx = wx + 0.5 - (s.x + (a - i) * S);
            const dy = wy + 0.5 - (s.y + (b - j) * S);
            const d = Math.hypot(dx, dy) - s.w;
            if (d < d1) { d2 = d1; d1 = d; best = s; bx = dx; by = dy; } else if (d < d2) d2 = d;
        }
    }
    return { stone: best, gap: d2 - d1, dx: bx, dy: by };
}

function cityGround(g, v) {
    const P = CITY.ground;
    const ox = (v % 4) * 32, oy = Math.floor(v / 4) * 32;
    const rnd = makeRng(0xC17E + v * 7919);
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
            const { stone, gap, dx, dy } = cobbleAt(ox + x, oy + y);
            let c;
            if (gap < 0.9) c = P.joint;
            else if (gap < 2.0) c = dx + dy < 0 ? P.rim : P.shade;   // rounded: lit top-left, shaded under
            else c = stone.tone < 0.2 ? P.base : stone.tone < 0.65 ? P.face : P.light;
            px(g, c, x, y);
            if (gap >= 2.0 && gap < 3.2 && dx + dy < -2.5) px(g, P.lit, x, y, 1, 1, 0.6);
            else if (gap >= 2.0 && rnd() < 0.08) px(g, rnd() < 0.5 ? P.shade : P.rim, x, y, 1, 1, 0.5);
        }
    }
}

// ─── City breakables: what a market leaves in the street ───

/** A nailed crate in three-quarter view: lit lid, planked front, iron corners. */
function bigCrate(g, x, y, w, h, top) {
    px(g, OUT, x - 1, y - 1, w + 2, h + 2);
    // Lid
    px(g, WOOD.light, x, y, w, top);
    px(g, WOOD.glow, x, y, w, 1);
    for (let xx = x + 3; xx < x + w - 1; xx += 4) px(g, WOOD.mid, xx, y + 1, 1, top - 1);
    px(g, WOOD.deep, x, y + top - 1, w, 1);
    // Front: planks, a brace, nails at the corners
    px(g, WOOD.mid, x, y + top, w, h - top);
    for (let yy = y + top + 2; yy < y + h - 1; yy += 3) px(g, WOOD.dark, x, yy, w, 1);
    line(g, x + 1, y + h - 2, x + w - 2, y + top + 1, WOOD.dark);
    px(g, WOOD.light, x, y + top, 1, h - top);
    px(g, WOOD.dark, x + w - 1, y + top, 1, h - top);
    for (const [nx, ny] of [[1, top + 1], [w - 2, top + 1], [1, h - 2], [w - 2, h - 2]]) px(g, IRON.glow, x + nx, y + ny);
}

/** A barrel standing up: bulging staves, two iron hoops, the lid on top. */
function barrel(g, cx, top, hw, h) {
    const spans = [];
    for (let i = 0; i <= h; i++) {
        const t = Math.abs(i / h - 0.5) * 2;
        const w = hw - Math.round(t * t * 2);
        spans.push([cx - w, cx + w - 1]);
    }
    volume(g, profile(top, spans), WOOD, { lu: 0.25, lv: 0.4, spec: 0.08, band: 0.3 });
    // Staves
    for (const dx of [-Math.round(hw / 2), 0, Math.round(hw / 2)]) {
        px(g, WOOD.dark, cx + dx, top + 2, 1, h - 3, 0.8);
    }
    // Hoops, lit on the left like everything else
    for (const hy of [top + 3, top + h - 3]) {
        const t = Math.abs((hy - top) / h - 0.5) * 2;
        const w = hw - Math.round(t * t * 2);
        px(g, IRON.dark, cx - w, hy, w * 2, 2);
        px(g, IRON.light, cx - w, hy, Math.max(2, w - 1), 1);
    }
    // Lid
    px(g, OUT, cx - hw + 1, top - 2, hw * 2 - 2, 4);
    px(g, WOOD.light, cx - hw + 2, top - 1, hw * 2 - 4, 2);
    px(g, WOOD.glow, cx - hw + 2, top - 1, hw - 1, 1);
    px(g, WOOD.dark, cx - 1, top - 1, 1, 2);
}

/** A burlap sack: a soft lump tied off at the neck. */
function sack(g, cx, top, hw, h) {
    volume(g, rough(ellipse(cx, top + Math.round(h / 2) + 1, hw, Math.round(h / 2)), cx * 31 + top, 1),
        SACK, { lu: 0.3, lv: 0.3, spec: 0.12, band: 0.28 });
    px(g, SACK.deep, cx - 2, top, 4, 2);
    px(g, SACK.mid, cx - 1, top - 2, 2, 2);
    px(g, SACK.light, cx - 1, top - 2, 1, 1);
    px(g, SACK.dark, cx - 1, top + 3, 1, h - 4, 0.6);   // stitched seam
}

/** A bale of straw bound with two cords. */
function bale(g, x, y, w, h) {
    px(g, HAY.deep, x - 1, y - 1, w + 2, h + 2);
    px(g, HAY.light, x, y, w, 3);
    px(g, HAY.glow, x, y, w, 1);
    px(g, HAY.mid, x, y + 3, w, h - 3);
    for (let yy = y + 4; yy < y + h; yy += 2) {
        for (let xx = x + ((yy >> 1) % 3); xx < x + w; xx += 3) px(g, HAY.dark, xx, yy, 2, 1, 0.8);
    }
    for (const bx of [x + 3, x + w - 4]) px(g, WOOD.deep, bx, y, 1, h);
}

function cityCargo(g, v) {
    if (v === 0) {
        // Crates stacked against each other
        groundShadow(g, 17, 28, 14, 3, 0.4);
        bigCrate(g, 4, 13, 13, 14, 4);
        bigCrate(g, 17, 16, 11, 11, 3);
        bigCrate(g, 8, 4, 10, 10, 3);
    } else if (v === 1) {
        // Barrels
        groundShadow(g, 16, 28, 14, 3, 0.4);
        barrel(g, 10, 7, 6, 13);
        barrel(g, 22, 10, 6, 13);
        barrel(g, 15, 15, 6, 12);
    } else {
        // Sacks propped on a bale
        groundShadow(g, 16, 28, 14, 3, 0.4);
        bale(g, 3, 16, 16, 11);
        sack(g, 22, 13, 6, 13);
        sack(g, 11, 6, 6, 11);
    }
}

// ─── City props ─────────────────────────────────────────

/** A stone chimney stack: grey, so it never reads as a hole in the tiles. */
function chimney(g, x, y, h = 6) {
    px(g, OUT, x - 1, y - 1, 6, h + 2);
    px(g, CRYPT.mid, x, y, 4, h);
    px(g, CRYPT.light, x, y, 1, h);
    px(g, CRYPT.dark, x + 3, y + 1, 1, h - 1);
    // The cap and the dark mouth of the flue
    px(g, CRYPT.glow, x, y, 4, 1);
    px(g, 0x050404, x + 1, y, 2, 1);
}

/**
 * A townhouse in three-quarter view, one cell: the top two thirds are the roof
 * sloping toward you, the bottom third the façade under the eave — plaster
 * between timbers, braced in an X or set with studs, windows lit from inside.
 * Party walls at both sides so a row of them reads as one block front, and a
 * shadow thrown down onto whatever stands in front.
 */
function townHouse(g, v) {
    const R = ROOFS[[0, 1, 2][v % 3]];          // terracotta, slate, dark shingle
    const W = v >= 3 ? WALL.dark : WALL.cream;
    const eave = 20;

    // Back slope peeking over the ridge, the ridge cap, then the front slope
    px(g, R.dark, 0, 0, 32, 2);
    px(g, R.deep, 0, 2, 32, 1);
    px(g, R.glow, 0, 3, 32, 1);
    for (let y = 4; y < eave; y++) px(g, y < 9 ? R.light : y < 15 ? R.mid : R.dark, 0, y, 32, 1);
    for (let y = 6; y < eave; y += 3) {
        px(g, y < 15 ? R.dark : R.deep, 0, y, 32, 1);
        const off = (Math.floor(y / 3) % 2) * 2;
        for (let x = off; x < 32; x += 4) px(g, R.deep, x, y - 1, 1, 1, 0.7);
        px(g, R.glow, 0, y + 1, 32, 1, 0.2);
    }
    for (let x = 1; x < 32; x += 4) px(g, R.dark, x, 3);
    // Party wall: the seam to the neighbour, and this gable's lit verge
    px(g, R.deep, 0, 0, 1, eave);
    px(g, R.light, 1, 4, 1, eave - 4, 0.5);
    if (v % 3 !== 1) chimney(g, [22, 0, 6][v % 3], 1, 6);
    px(g, OUT, 0, eave, 32, 1);

    // Façade
    const fy = eave + 1, fh = 10;
    px(g, W.mid, 0, fy, 32, fh);
    px(g, W.dark, 0, fy, 32, 1);                   // under the eave
    px(g, W.light, 2, fy + 2, 8, 1, 0.5);
    px(g, TIMBER.mid, 0, fy + 1, 32, 1);
    px(g, TIMBER.mid, 0, fy + fh - 1, 32, 1);
    for (const x of [0, 11, 21, 31]) px(g, x === 0 ? TIMBER.deep : TIMBER.mid, x, fy + 1, 1, fh - 1);
    if (v % 2 === 0) {
        line(g, 1, fy + 2, 10, fy + fh - 2, TIMBER.mid);
        line(g, 10, fy + 2, 1, fy + fh - 2, TIMBER.mid);
    } else {
        for (const x of [4, 7]) px(g, TIMBER.mid, x, fy + 2, 1, fh - 3);
    }
    const lit = (i) => (v + i) % 3 !== 0;
    townWindow(g, 14, fy + 3, lit(0));
    if (v % 3 === 2) {
        // A door instead of the second window
        px(g, TIMBER.deep, 24, fy + 2, 5, fh - 2);
        px(g, TIMBER.mid, 25, fy + 3, 3, fh - 3);
        px(g, GOLD.mid, 27, fy + 6);
    } else {
        townWindow(g, 24, fy + 3, lit(1));
    }
    px(g, CRYPT.dark, 0, fy + fh, 32, 1);           // stone plinth

    // Cast onto the cell in front
    px(g, 0x000000, 0, 32, 32, 1, 0.38);
    px(g, 0x000000, 0, 33, 32, 1, 0.22);
    px(g, 0x000000, 0, 34, 32, 1, 0.1);
}

function townWindow(g, x, y, lit) {
    px(g, TIMBER.deep, x - 1, y - 1, 5, 5);
    px(g, lit ? 0x8a4a12 : 0x161a24, x, y, 3, 3);
    if (lit) { px(g, GOLD.light, x, y, 2, 2); px(g, GOLD.glow, x, y); }
    px(g, TIMBER.deep, x + 1, y, 1, 3, 0.7);
}

/** A tree in a gap between houses: a lumpy dark canopy over a stub of trunk. */
function townTree(g, v) {
    const T = FOLIAGE;
    groundShadow(g, 18, 29, 13, 3, 0.4);
    px(g, TIMBER.deep, 13, 21, 6, 9);
    px(g, TIMBER.mid, 14, 21, 3, 8);
    const lumps = v === 0
        ? [[9, 15, 6, 5], [23, 15, 6, 5], [16, 7, 7, 5]]
        : [[8, 12, 6, 6], [24, 17, 6, 5], [18, 6, 6, 5]];
    for (const [cx, cy, rx, ry] of lumps) {
        volume(g, rough(ellipse(cx, cy, rx, ry), cx * 7 + cy + v, 1), T, { lu: 0.3, lv: 0.25, spec: 0.1, band: 0.28 });
    }
    volume(g, rough(ellipse(16, 14, 11, 9), 0x7EE + v, 1), T, { lu: 0.3, lv: 0.25, spec: 0.1, band: 0.25 });
    const rnd = makeRng(0x7EE5 + v);
    for (let i = 0; i < 18; i++) {
        const x = 7 + Math.floor(rnd() * 18), y = 6 + Math.floor(rnd() * 15);
        px(g, x + y < 30 ? T.light : T.deep, x, y, 1, 1, 0.7);
    }
}

/**
 * A market stall — the city's breakable block. Striped canvas over a plank
 * counter piled with produce: readable as "a thing in the road you have to
 * smash" without being a boulder.
 */
function marketStall(g, v) {
    const A = [AWNING.red, AWNING.blue, AWNING.green][v % 3];
    const C = AWNING.cream;
    groundShadow(g, 17, 28, 14, 3, 0.38);

    // Posts
    px(g, OUT, 3, 10, 4, 18);
    px(g, OUT, 25, 10, 4, 18);
    px(g, TIMBER.mid, 4, 11, 2, 16);
    px(g, TIMBER.mid, 26, 11, 2, 16);
    px(g, TIMBER.light, 4, 11, 1, 16);

    // Counter: lit top piled with goods, plank front in shade
    px(g, OUT, 2, 16, 28, 13);
    px(g, WOOD.light, 3, 17, 26, 3);
    px(g, WOOD.glow, 3, 17, 26, 1);
    px(g, WOOD.mid, 3, 20, 26, 8);
    for (let y = 22; y < 28; y += 2) px(g, WOOD.dark, 3, y, 26, 1);
    for (const x of [9, 16, 23]) px(g, WOOD.deep, x, 20, 1, 8);
    px(g, WOOD.deep, 3, 20, 26, 1);

    const goods = [
        [[EL.fire, 5], [EL.mud, 11], [EL.fire, 18], [GOLD, 23]],   // apples, cabbages
        [[GOLD, 5], [EL.earth, 11], [GOLD, 17], [EL.fire, 23]],    // loaves, sacks
        [[EL.air, 5], [EL.mud, 11], [EL.water, 17], [EL.air, 23]], // fish, greens
    ][v % 3];
    for (const [r, x] of goods) {
        px(g, r.deep, x, 16, 5, 4);
        px(g, r.mid, x + 1, 16, 3, 3);
        px(g, r.light, x + 1, 16, 2, 1);
        px(g, r.glow, x + 1, 16);
    }

    // Awning: canvas slope seen from above, a valance, scalloped hem
    px(g, OUT, 0, 1, 32, 13);
    for (let x = 1; x < 31; x++) {
        const R = ((x - 1) >> 2) % 2 === 0 ? A : C;
        px(g, R.glow, x, 2);
        px(g, R.light, x, 3, 1, 2);
        px(g, R.mid, x, 5, 1, 5);
        px(g, R.dark, x, 10, 1, 1);
        px(g, R.mid, x, 11, 1, 1);
        px(g, R.dark, x, 12, 1, 1);
        // Hem: every stripe ends in a rounded tongue
        if (((x - 1) & 3) === 1 || ((x - 1) & 3) === 2) {
            px(g, R.dark, x, 13);
            px(g, OUT, x, 14);
        }
    }
    px(g, OUT, 1, 10, 30, 1, 0.45);   // the fold between slope and valance
    px(g, 0x000000, 1, 15, 30, 1, 0.25);
}

// ═══ VOLCANO ════════════════════════════════════════════

function volcanoGround(g, v) {
    const P = VOLCANO.ground;
    const rnd = makeRng(0x7A1C + v * 7919);
    px(g, P.base, 0, 0, 32, 32);

    // Basalt plates: soft-edged blocks of a lighter face, lit on the top-left
    // rim and cracked dark underneath — rock, not noise.
    for (let i = 0; i < 13; i++) {
        const w = 5 + Math.floor(rnd() * 9);
        const h = 4 + Math.floor(rnd() * 6);
        const x = Math.floor(rnd() * 32) - (w >> 1);
        const y = Math.floor(rnd() * 32) - (h >> 1);
        for (let k = 0; k < h; k++) {
            const t = 1 - Math.abs((k / Math.max(1, h - 1)) * 2 - 1);
            const inset = Math.round((1 - t) * 2);
            px(g, P.face, x + inset, y + k, Math.max(1, w - inset * 2), 1, 0.75);
        }
        px(g, P.lit, x + 2, y, Math.max(1, w - 4), 1, 0.6);
        px(g, P.crack, x + 2, y + h, Math.max(1, w - 4), 1, 0.6);
    }
    for (let y = 0; y < 32; y++) {
        for (let x = (y % 2) * 2; x < 32; x += 4) {
            const r = rnd();
            if (r < 0.3) px(g, P.lit, x, y, 1, 1, 0.6);
            else if (r < 0.5) px(g, P.crack, x, y, 1, 1, 0.6);
        }
    }
    // Ash: pale grains, sparse
    for (let i = 0; i < 10; i++) px(g, P.ash, Math.floor(rnd() * 32), Math.floor(rnd() * 32), 1, 1, 0.55);

    if (v === 5) {
        // A cooling seam, glowing faintly from inside
        let cx = 6 + Math.floor(rnd() * 8), cy = 8 + Math.floor(rnd() * 8);
        for (let k = 0; k < 14; k++) {
            px(g, EL.lava.deep, cx, cy + 1);
            px(g, EL.lava.dark, cx, cy);
            if (k % 3 === 1) px(g, EL.lava.mid, cx, cy, 1, 1, 0.8);
            cx += 1; cy += rnd() < 0.5 ? 0 : (rnd() < 0.5 ? 1 : -1);
        }
    } else if (v === 6) {
        const x = 10 + Math.floor(rnd() * 10), y = 12 + Math.floor(rnd() * 8);
        px(g, P.crack, x - 1, y + 4, 6, 1, 0.8);
        volume(g, profile(y, [[x + 1, x + 1], [x, x + 2], [x, x + 3], [x + 1, x + 3]]), OBSIDIAN, { spec: 0.25 });
    } else if (v === 7) {
        for (let i = 0; i < 4; i++) {
            const x = 6 + Math.floor(rnd() * 20), y = 6 + Math.floor(rnd() * 20);
            px(g, P.crack, x, y + 1, 3, 1);
            px(g, P.ash, x, y, 2, 1, 0.8);
            px(g, P.lit, x + 2, y, 1, 1);
        }
    }
}

function volcanoRoad(g, v) {
    pavedRoad(g, v, VOLCANO.road, 0x16E0, { finish: slabHairline(VOLCANO.road.deep, 0.5) });
}

/** Obsidian boulder split by veins of still-molten rock. */
function obsidianRock(g, v) {
    const rnd = makeRng(0x0B51 + v * 4093);
    groundShadow(g, 16, 28, 12, 3, 0.35);
    // Three boulders of one family: round, a little flatter each time.
    const shape = rough(ellipse(16, [18, 18, 19][v], [12, 12, 13][v], [10, 9, 8][v]), 0x0B51 + v, 1);
    volume(g, shape, OBSIDIAN, { lu: 0.28, lv: 0.2, spec: 0.1, band: 0.22 });

    // Conchoidal facets — glass breaks in flat, shining planes
    px(g, OBSIDIAN.light, 9, 11, 6, 2);
    px(g, OBSIDIAN.light, 8, 13, 3, 3);
    px(g, OBSIDIAN.glow, 10, 11, 3, 1);
    line(g, 17, 10, 21, 14, OBSIDIAN.light);
    px(g, OBSIDIAN.glow, 17, 10);

    // Veins of lava: hot core, cooler edges, a little light around them
    const veins = v === 1 ? 3 : 2;
    for (let n = 0; n < veins; n++) {
        let cx = 11 + Math.floor(rnd() * 10);
        let cy = 11 + Math.floor(rnd() * 3);
        for (let k = 0; k < 9 + Math.floor(rnd() * 5); k++) {
            px(g, EL.lava.mid, cx - 1, cy, 3, 1, 0.25);
            px(g, EL.lava.mid, cx + 1, cy);
            px(g, k % 4 === 2 ? EL.lava.glow : EL.lava.light, cx, cy);
            cy++;
            cx += rnd() < 0.5 ? 0 : (rnd() < 0.5 ? 1 : -1);
            if (cy > 25) break;
        }
    }
    // Glow pooling where the veins meet the ground
    for (let i = 0; i < 5; i++) px(g, EL.lava.mid, 9 + Math.floor(rnd() * 14), 26 + Math.floor(rnd() * 2), 2, 1, 0.5);
}

// ═══ SNOW ═══════════════════════════════════════════════

function snowGround(g, v) {
    const P = SNOW.ground;
    const rnd = makeRng(0x5A0F + v * 7919);
    px(g, P.base, 0, 0, 32, 32);

    // Frozen slate in broad plates, each a shade lighter than the cracks
    for (let i = 0; i < 6; i++) {
        const w = 9 + Math.floor(rnd() * 12);
        const h = 6 + Math.floor(rnd() * 8);
        const x = Math.floor(rnd() * 32) - (w >> 1);
        const y = Math.floor(rnd() * 32) - (h >> 1);
        for (let k = 0; k < h; k++) {
            const t = 1 - Math.abs((k / Math.max(1, h - 1)) * 2 - 1);
            const inset = Math.round((1 - t) * 3);
            px(g, P.face, x + inset, y + k, Math.max(1, w - inset * 2), 1, 0.7);
        }
    }
    for (let y = 0; y < 32; y++) {
        for (let x = (y % 2) * 2; x < 32; x += 4) {
            const r = rnd();
            if (r < 0.28) px(g, P.lit, x, y, 1, 1, 0.55);
            else if (r < 0.5) px(g, P.shade, x, y, 1, 1, 0.7);
        }
    }
    // Hairline cracks in the ice skin
    for (let i = 0; i < 2; i++) {
        let cx = Math.floor(rnd() * 30), cy = Math.floor(rnd() * 30);
        for (let k = 0; k < 7; k++) {
            px(g, P.crack, cx, cy);
            cx += 1; cy += rnd() < 0.5 ? 1 : -1;
            if (cy < 0 || cy > 31) break;
        }
    }
    // Hoarfrost: cold grains catching starlight
    for (let i = 0; i < 12; i++) px(g, P.frost, Math.floor(rnd() * 32), Math.floor(rnd() * 32), 1, 1, 0.6);

    if (v === 5) {
        // Dead grass poking through the frost
        for (let i = 0; i < 8; i++) {
            const x = 8 + Math.floor(rnd() * 16), y = 9 + Math.floor(rnd() * 14);
            px(g, 0x1e3a3a, x, y, 1, 3);
            px(g, P.frost, x, y);
        }
    } else if (v === 6) {
        const x = 11 + Math.floor(rnd() * 10), y = 12 + Math.floor(rnd() * 8);
        px(g, P.crack, x - 1, y + 4, 6, 1);
        volume(g, profile(y, [[x + 1, x + 1], [x, x + 2], [x, x + 2], [x, x + 3], [x + 1, x + 2]]), EL.ice, { spec: 0.22, band: 0.3 });
    } else if (v === 7) {
        // A small drift caught in a hollow — kept low so the floor stays dark
        const x = 7 + Math.floor(rnd() * 14), y = 10 + Math.floor(rnd() * 12);
        px(g, P.crack, x, y + 3, 9, 1, 0.8);
        px(g, P.frost, x + 1, y + 1, 7, 2);
        px(g, 0x5a7a92, x + 2, y + 1, 4, 1);
    }
}

/** Packed snow with slabs of clear ice set in it — a glint says "ice". */
function snowRoad(g, v) {
    const P = SNOW.road;
    pavedRoad(g, v, P, 0x1CE0, {
        bed: [0.4, 0.3, 0.16, 0.14],
        body: 'mid',
        finish: (g2, s, rnd) => {
            const gx = s.x + 2 + Math.floor(rnd() * Math.max(1, s.w - 6));
            line(g2, gx, s.y + s.h - 3, gx + 3, s.y + 2, P.lit);
            px(g2, 0xffffff, gx + 3, s.y + 2, 1, 1, 0.8);
        },
    });
}

/** A block of old ice with crystals forcing their way out of it. */
function iceBlock(g, v) {
    const R = EL.ice;
    const rnd = makeRng(0x1CEB + v * 4093);
    groundShadow(g, 16, 28, 12, 3, 0.35);
    volume(g, rough(ellipse(16, 21, 11, 7), 0x1CEB + v, 1), R, { lu: 0.28, lv: 0.25, spec: 0.12, band: 0.28 });

    // Prisms: pointed tops, straight flanks, lit on the left face
    const prisms = [
        [[9, 7, 3], [16, 3, 4], [22, 8, 3]],
        [[11, 4, 4], [19, 6, 3], [24, 11, 2]],
        [[8, 9, 3], [14, 5, 3], [20, 2, 4]],
    ][v % 3];
    for (const [cx, top, hw] of prisms) {
        const spans = [];
        for (let y = top; y <= 21; y++) {
            const w = Math.min(hw, Math.floor((y - top) * 0.9) + 1);
            spans.push([cx - w, cx + w - 1]);
        }
        volume(g, profile(top, spans), R, { lu: 0.2, lv: 0.3, spec: 0.12, band: 0.3 });
        px(g, R.glow, cx - 1, top + 2, 1, Math.max(2, 18 - top - 6), 0.7);
    }
    // Snow caked on the base
    for (let x = 6; x < 27; x++) {
        if (rnd() < 0.75) px(g, x % 3 === 0 ? 0xbfd6e6 : 0xd9ecf7, x, 24 + Math.floor(rnd() * 2));
    }
    px(g, 0xffffff, 15, 6, 1, 1, 0.9);
}

// ═══ DUNGEON ════════════════════════════════════════════

// Big crypt flags in two courses per cell, staggered, joints barely darker than
// the stone. The layout repeats every 32px so slabs carry across the seam; the
// stone itself is one shade everywhere, so a slab cut by the seam never shows
// two halves.
const CRYPT_COURSES = [
    { y: 0, h: 13, joints: [5, 22] },
    { y: 14, h: 17, joints: [13] },
];

function dungeonGround(g, v) {
    const P = DUNGEON.ground;
    const rnd = makeRng(0xD06E + v * 7919);
    px(g, P.face, 0, 0, 32, 32);
    for (let i = 0; i < 5; i++) patch(g, rnd, rnd() < 0.5 ? P.base : P.lit, 0.35, 10, 12, 8, 8);
    for (let y = 0; y < 32; y++) {
        for (let x = (y % 2) * 2; x < 32; x += 4) {
            const r = rnd();
            if (r < 0.25) px(g, P.lit, x, y, 1, 1, 0.45);
            else if (r < 0.45) px(g, P.shade, x, y, 1, 1, 0.6);
        }
    }
    for (const c of CRYPT_COURSES) {
        const jy = c.y + c.h;
        px(g, P.joint, 0, jy, 32, 1, 0.45);
        px(g, P.lit, 0, (jy + 1) % 32, 32, 1, 0.15);
        for (const jx of c.joints) {
            px(g, P.joint, jx, c.y, 1, c.h, 0.45);
            px(g, P.lit, jx + 1, c.y, 1, c.h, 0.15);
        }
    }
    if (rnd() < 0.5) {
        let cx = 3 + Math.floor(rnd() * 26), cy = 1 + Math.floor(rnd() * 10);
        for (let k = 0; k < 9; k++) { px(g, P.crack, cx, cy); cy++; cx += rnd() < 0.5 ? 0 : (rnd() < 0.5 ? 1 : -1); }
    }

    if (v === 13) {
        // A ring of rune marks worn into the flag, still faintly lit from below
        const x = 8 + Math.floor(rnd() * 12), y = 8 + Math.floor(rnd() * 12);
        for (const [dx, dy] of [[0, -3], [2, -2], [3, 0], [2, 2], [0, 3], [-2, 2], [-3, 0], [-2, -2]]) {
            px(g, SOUL.dark, x + dx, y + dy, 1, 1, 0.8);
        }
        px(g, SOUL.mid, x, y, 1, 1, 0.6);
    } else if (v === 14) {
        // Bones
        const x = 8 + Math.floor(rnd() * 12), y = 10 + Math.floor(rnd() * 10);
        line(g, x, y + 4, x + 6, y + 1, 0x4c4760);
        line(g, x, y + 3, x + 6, y, 0x6f6a8c);
        px(g, 0x6f6a8c, x - 1, y + 3, 2, 2);
        px(g, 0x6f6a8c, x + 6, y - 1, 2, 2);
    } else if (v === 15) {
        // A candle stub and the light it still throws
        const x = 12 + Math.floor(rnd() * 8), y = 10 + Math.floor(rnd() * 8);
        for (const [r, a] of [[6, 0.05], [4, 0.07]]) px(g, GOLD.mid, x - r + 1, y + 4 - (r >> 1), r * 2, r, a);
        px(g, 0x6f6a8c, x, y + 2, 2, 4);
        px(g, 0x9e99bc, x, y + 2, 1, 4);
        px(g, GOLD.mid, x, y, 1, 2);
        px(g, GOLD.glow, x, y + 1);
    }
}

function dungeonRoad(g, v) {
    pavedRoad(g, v, DUNGEON.road, 0x3A9B, { finish: slabHairline(DUNGEON.road.vein, 0.7, 0.9) });
}

/** A standing column, or the stump of one with its rubble at its foot. */
function pillar(g, v) {
    const R = CRYPT;
    const rnd = makeRng(0x9111 + v * 4093);
    groundShadow(g, 17, 29, 12, 3, 0.4);
    // Plinth
    px(g, R.deep, 5, 23, 22, 8);
    px(g, R.light, 6, 24, 20, 2);
    px(g, R.mid, 6, 26, 20, 4);
    px(g, R.dark, 6, 29, 20, 1);
    const top = v === 1 ? 12 : 7;
    // Shaft: a cylinder, lit on the left, fluted
    px(g, R.deep, 9, top, 14, 24 - top);
    for (let x = 10; x < 22; x++) {
        const u = (x - 10) / 11;
        px(g, u < 0.2 ? R.light : u < 0.5 ? R.mid : u < 0.85 ? R.dark : R.deep, x, top, 1, 23 - top);
    }
    for (const x of [13, 16, 19]) px(g, R.dark, x, top + 1, 1, 22 - top, 0.7);
    px(g, R.glow, 11, top + 1, 1, 22 - top, 0.6);
    if (v === 1) {
        // Broken: a jagged stump and its rubble
        for (let x = 9; x < 23; x++) {
            const d = Math.floor(rnd() * 3);
            px(g, R.deep, x, top - 1 + d, 1, 1);
            px(g, R.light, x, top + d, 1, 1);
        }
        rubbleBlock(g, 3, 25, 5, 4);
        rubbleBlock(g, 24, 24, 5, 5);
    } else {
        // Capital: a wide block whose top face catches the light
        px(g, R.deep, 6, 2, 20, 7);
        px(g, R.glow, 7, 3, 18, 1);
        px(g, R.light, 7, 4, 18, 2);
        px(g, R.mid, 7, 6, 18, 2);
        px(g, R.dark, 7, 7, 18, 1);
        // A crack climbing the shaft
        let cx = 16, cy = top + 3;
        for (let k = 0; k < 10; k++) { px(g, R.deep, cx, cy); cy++; cx += rnd() < 0.5 ? 0 : (rnd() < 0.5 ? 1 : -1); }
    }
}

/** One dressed block fallen out of a wall: lit top, shaded front. */
function rubbleBlock(g, x, y, w, h) {
    const R = CRYPT;
    px(g, R.deep, x - 1, y - 1, w + 2, h + 2);
    px(g, R.mid, x, y, w, h);
    px(g, R.light, x, y, w, Math.max(1, h >> 1));
    px(g, R.glow, x, y, Math.max(1, w - 2), 1);
    px(g, R.dark, x, y + h - 1, w, 1);
    px(g, R.dark, x + w - 1, y + 1, 1, h - 1);
}

/** A heap of fallen masonry — the crypt's boulder. */
function rubbleHeap(g) {
    groundShadow(g, 16, 28, 13, 3, 0.4);
    for (const [x, y, w, h] of [
        [4, 18, 10, 8], [15, 19, 12, 7], [9, 11, 11, 8], [20, 12, 7, 7],
        [6, 25, 5, 3], [24, 25, 4, 3], [14, 6, 6, 5],
    ]) rubbleBlock(g, x, y, w, h);
}

// ═══ Registry ═══════════════════════════════════════════

const ART = {
    city: {
        ground: cityGround,
        road: (g, v) => pavedRoad(g, v, CITY.road, 0x5E77),
        breakable: cityCargo,
        edge: (g, side, v) => kerbEdge(g, side, v, CITY.rim),
        corner: (g, name) => kerbCorner(g, name, CITY.rim),
    },
    volcano: {
        ground: volcanoGround, road: volcanoRoad, breakable: obsidianRock,
        edge: (g, side, v) => lipEdge(g, side, v, VOLCANO.rim, 0x7ED6,
            { chance: 0.12, color: EL.lava.dark, alpha: 0.9 }),
        corner: (g, name) => lipCorner(g, name, VOLCANO.rim, 0x7C0F),
        scatter: (g, side) => scatter(g, side, [VOLCANO.road.base, VOLCANO.road.deep, VOLCANO.road.mid], 0x75CA, 0.35),
    },
    snow: {
        ground: snowGround, road: snowRoad, breakable: iceBlock,
        edge: (g, side, v) => lipEdge(g, side, v, SNOW.rim, 0x5ED6,
            { chance: 0.25, color: SNOW.rim.light, alpha: 1 }),
        corner: (g, name) => lipCorner(g, name, SNOW.rim, 0x5C0F),
        scatter: (g, side) => scatter(g, side, [SNOW.road.base, SNOW.road.light, SNOW.ground.frost], 0x55CA, 0.3),
    },
    dungeon: {
        ground: dungeonGround, road: dungeonRoad,
        breakable: (g, v) => (v === 2 ? rubbleHeap(g) : pillar(g, v)),
        edge: (g, side, v) => kerbEdge(g, side, v, DUNGEON.rim),
        corner: (g, name) => kerbCorner(g, name, DUNGEON.rim),
    },
};

/**
 * Every texture a biome needs, as { key, w, h, draw(g) }. BootScene draws them
 * and lists them in its boot check; 'grass' returns nothing because BootScene
 * draws the lawn itself.
 */
export function biomeTextures(biome) {
    const art = ART[biome];
    if (!art) return [];
    const spec = BIOMES[biome];
    const k = (key) => biomeKey(biome, key);
    const list = [];
    for (let v = 0; v < groundVariants(biome); v++) list.push(tex(k(`grass_${v}`), (g) => art.ground(g, v)));
    for (let v = 0; v < DIRT_VARIANTS; v++) list.push(tex(k(`dirt_${v}`), (g) => art.road(g, v)));
    for (let v = 0; v < BREAKABLE_VARIANTS; v++) list.push(tex(k(`breakable_${v}`), (g) => art.breakable(g, v)));
    for (const side of SIDES) {
        for (let v = 0; v < EDGE_VARIANTS; v++) list.push(tex(k(`edge_${side}_${v}`), (g) => art.edge(g, side, v)));
        if (spec.scatter && art.scatter) list.push(tex(k(`scat_${side}`), (g) => art.scatter(g, side)));
    }
    for (const c of CORNERS) list.push(tex(k(`corner_${c}`), (g) => art.corner(g, c)));
    return list;
}

/** The town ring around a 'city' board: houses, trees and stalls. */
export function townTextures() {
    const list = [];
    for (let v = 0; v < HOUSE_VARIANTS; v++) list.push(tex(`town_house_${v}`, (g) => townHouse(g, v), 32, 35));
    for (let v = 0; v < TREE_VARIANTS; v++) list.push(tex(`town_tree_${v}`, (g) => townTree(g, v)));
    for (let v = 0; v < STALL_VARIANTS; v++) list.push(tex(`town_stall_${v}`, (g) => marketStall(g, v)));
    return list;
}
