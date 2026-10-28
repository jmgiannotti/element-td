import { TILE } from './GridSystem.js';

/**
 * Which terrain sprites a cell is made of, for every biome.
 *
 * Kept free of Phaser on purpose: GameScene turns the layer list into images,
 * and the offline preview composites the very same list into a PNG — so what
 * gets measured for contrast is what the game actually draws.
 *
 * The contract every biome keeps, whatever it is made of: buildable ground is
 * dark (luma 12–20 %) and the road is light (60–75 %) with a dark rim where
 * they meet. Towers, enemies and bolts all read against that split, so a biome
 * may change the material but never the values.
 */

// How many interchangeable variants exist per terrain texture family.
// GameScene picks one per cell from a positional hash so the map looks
// varied but stays identical between renders of the same cell.
export const GRASS_VARIANTS = 8;
export const DIRT_VARIANTS = 6;
export const EDGE_VARIANTS = 2;
export const RUT_VARIANTS = 2;
export const BREAKABLE_VARIANTS = 3;
// The town ring in 'city' (see townProps).
export const HOUSE_VARIANTS = 6;
export const TREE_VARIANTS = 2;
export const STALL_VARIANTS = 3;

export const SIDES = ['top', 'bottom', 'left', 'right'];
export const CORNERS = ['tl', 'tr', 'bl', 'br'];

/**
 * Per-biome switches for the layers that only some materials have.
 *  flipGround/flipRoad — mirroring turns N variants into 4N, but only works on
 *    organic textures: a slab pattern laid across the tile mirrored at the seam
 *    breaks, and the break draws the 32px grid across the whole map.
 *  ruts/scatter — wheel tracks and spilled gravel belong to a dirt road.
 *  groundVariants — more plain variants dilute the ones carrying an object.
 *  groundTile — the ground is one seamless n×n-cell pattern instead of loose
 *    variants: each cell takes its piece by position, so a regular material
 *    (cobbles) runs on across the seams without repeating every 32px.
 *  town — houses, trees and stalls along the top row and in the level's
 *    `townBlocks` (see townProps).
 */
export const BIOMES = {
    grass:   { flipGround: true,  flipRoad: true, ruts: true,  scatter: true },
    city:    { flipGround: false, flipRoad: true, ruts: false, scatter: false, groundTile: 4, town: true },
    volcano: { flipGround: true,  flipRoad: true, ruts: false, scatter: true },
    snow:    { flipGround: true,  flipRoad: true, ruts: false, scatter: true },
    dungeon: { flipGround: false, flipRoad: true, ruts: false, scatter: false, groundVariants: 16 },
};
export const BIOME_IDS = Object.keys(BIOMES);
export const DEFAULT_BIOME = 'grass';

/** How many buildable-ground variants a biome draws. */
export function groundVariants(biome) {
    const spec = BIOMES[biome];
    if (spec?.groundTile) return spec.groundTile * spec.groundTile;
    return spec?.groundVariants ?? GRASS_VARIANTS;
}

export function resolveBiome(biome) {
    return BIOMES[biome] ? biome : DEFAULT_BIOME;
}

/**
 * Texture key of a terrain family in a biome. 'grass' keeps the bare names it
 * always had (`grass_0`, `dirt_3`, `edge_top_1`…); every other biome prefixes
 * them, so `city_dirt_3` is the city's road. The family names stay those of
 * the grid tiles — "grass" is buildable ground, "dirt" is road — whatever the
 * biome paints them with.
 */
export function biomeKey(biome, key) {
    return biome === DEFAULT_BIOME ? key : `${biome}_${key}`;
}

/** Stable per-cell hash — same cell always draws the same variant. */
export function cellHash(col, row) {
    let h = Math.imul(col + 1, 374761393) ^ Math.imul(row + 1, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
}

// Depth budget for the terrain layers (all below entities at depth ≥ 1).
export const TERRAIN_DEPTH = {
    BASE: 0,
    RUT: 0.1,
    SCATTER: 0.15,
    EDGE: 0.2,
    CORNER: 0.25,
};

/** The breakable block sprite for a cell. */
export function breakableKey(biome, col, row) {
    return biomeKey(biome, `breakable_${cellHash(col, row) % BREAKABLE_VARIANTS}`);
}

/**
 * The layers one cell is drawn from, bottom to top: base tile plus whatever
 * transition overlays its neighbours call for. `grid` is a GridSystem (only
 * `grid`, `cols`, `rows` and `inBounds` are read).
 *
 * @returns {{key: string, depth: number, flipX?: boolean, flipY?: boolean}[]}
 */
export function cellLayers(grid, biome, col, row) {
    biome = resolveBiome(biome);
    const spec = BIOMES[biome];
    const k = (key) => biomeKey(biome, key);
    const h = cellHash(col, row);
    const D = TERRAIN_DEPTH;
    const layers = [];
    const put = (key, depth) => layers.push({ key: k(key), depth });
    // Mirroring the full-bleed base tile turns N variants into 4N patterns,
    // which is what stops the lawn from reading as a repeated stamp.
    const putBase = (key, flip) => layers.push({
        key: k(key), depth: D.BASE,
        flipX: flip && ((h >>> 17) & 1) === 1,
        flipY: flip && ((h >>> 18) & 1) === 1,
    });

    const isGrass = (c, r) => grid.inBounds(c, r) && grid.grid[r][c] === TILE.GRASS;
    const isRoad = (c, r) => grid.inBounds(c, r) && grid.grid[r][c] !== TILE.GRASS;

    const up = isRoad(col, row - 1);
    const down = isRoad(col, row + 1);
    const left = isRoad(col - 1, row);
    const right = isRoad(col + 1, row);

    if (isGrass(col, row)) {
        const n = spec.groundTile;
        const v = n ? (col % n) + n * (row % n) : h % groundVariants(biome);
        putBase(`grass_${v}`, spec.flipGround);
        // Dirt kicked onto the verge by whatever walks past
        if (spec.scatter) {
            if (up) put('scat_top', D.SCATTER);
            if (down) put('scat_bottom', D.SCATTER);
            if (left) put('scat_left', D.SCATTER);
            if (right) put('scat_right', D.SCATTER);
        }
        return layers;
    }

    putBase(`dirt_${(h >>> 3) % DIRT_VARIANTS}`, spec.flipRoad);

    // Ruts follow the direction of travel so the road reads continuous
    if (spec.ruts) {
        const rv = (h >>> 7) % RUT_VARIANTS;
        if (left && right && !(up && down)) put(`rut_h_${rv}`, D.RUT);
        else if (up && down && !(left && right)) put(`rut_v_${rv}`, D.RUT);
    }

    // The rim on each side that borders buildable ground
    const ev = (h >>> 11) % EDGE_VARIANTS;
    if (isGrass(col, row - 1)) put(`edge_top_${ev}`, D.EDGE);
    if (isGrass(col, row + 1)) put(`edge_bottom_${ev}`, D.EDGE);
    if (isGrass(col - 1, row)) put(`edge_left_${ev}`, D.EDGE);
    if (isGrass(col + 1, row)) put(`edge_right_${ev}`, D.EDGE);

    // Inside corners: the ground pokes through where two road tiles meet
    if (isGrass(col - 1, row - 1) && up && left) put('corner_tl', D.CORNER);
    if (isGrass(col + 1, row - 1) && up && right) put('corner_tr', D.CORNER);
    if (isGrass(col - 1, row + 1) && down && left) put('corner_bl', D.CORNER);
    if (isGrass(col + 1, row + 1) && down && right) put('corner_br', D.CORNER);

    return layers;
}


/**
 * The town on a 'city' board. Houses are drawn in three-quarter view with the
 * façade facing south, so they only go where that façade looks onto the board:
 *  · the whole top row, a continuous block front with the odd tree in it, and
 *    two or three market stalls standing right against its façades;
 *  · the level's own `townBlocks` — short rows of two or three houses
 *    `{ col, row, w }` set into the board, with a tree on the longer ones.
 * Nothing is ever stacked: a block that would sit right above or below another
 * piece of town is skipped whole, as is one that falls on road, a seal or the
 * hero's spawn. Every piece takes its cell; the rest of the board stays yours.
 *
 * @returns {{key: string, x: number, y: number, cells: string[]}[]}
 */
export function townProps(grid) {
    const { cols } = grid;
    const isGround = (c, r) => grid.inBounds(c, r) && grid.grid[r][c] === TILE.GRASS;
    const level = grid.levelData || {};
    const reserved = new Set((level.seals || []).map(s => `${s.col},${s.row}`));
    if (level.heroSpawn) reserved.add(`${level.heroSpawn.col},${level.heroSpawn.row}`);
    const free = (c, r) => isGround(c, r) && !reserved.has(`${c},${r}`);

    const props = [];
    const town = new Set();
    let prev = -1;
    const house = (c, r) => {
        const h = cellHash(c, r);
        // Never the same house twice in a row: a block front is a run of
        // different houses, not one house stamped along the edge.
        let v = (h >>> 4) % HOUSE_VARIANTS;
        if (v === prev) v = (v + 1 + ((h >>> 12) % (HOUSE_VARIANTS - 1))) % HOUSE_VARIANTS;
        prev = v;
        return `town_house_${v}`;
    };
    const add = (key, c, r) => {
        props.push({ key, x: c * 32, y: r * 32, cells: [`${c},${r}`] });
        town.add(`${c},${r}`);
    };

    // The top row
    const front = [];
    for (let c = 0; c < cols; c++) {
        if (!free(c, 0)) { prev = -1; continue; }
        const tree = (cellHash(c, 0) >>> 9) % 7 === 0;
        add(tree ? `town_tree_${(cellHash(c, 0) >>> 4) % TREE_VARIANTS}` : house(c, 0), c, 0);
        if (!tree) front.push(c);
    }

    // Stalls against its façades, spread out along it
    const spots = front.filter(c => c > 0 && c < cols - 1 && free(c, 1))
        .sort((a, b) => cellHash(a, 1) - cellHash(b, 1));
    const chosen = [];
    for (const c of spots) {
        if (chosen.length >= 3) break;
        if (chosen.every(o => Math.abs(o - c) >= 4)) chosen.push(c);
    }
    for (const c of chosen) add(`town_stall_${cellHash(c, 1) % STALL_VARIANTS}`, c, 1);

    // The level's blocks
    for (const b of level.townBlocks || []) {
        const cells = [];
        for (let c = b.col; c < b.col + b.w; c++) cells.push(c);
        const fits = cells.every(c => free(c, b.row)
            && !town.has(`${c},${b.row - 1}`) && !town.has(`${c},${b.row + 1}`));
        if (!fits) continue;
        prev = -1;
        const treeAt = b.w >= 3 ? ((cellHash(b.col, b.row) & 1) ? b.col : b.col + b.w - 1) : -1;
        for (const c of cells) {
            add(c === treeAt ? `town_tree_${(cellHash(c, b.row) >>> 4) % TREE_VARIANTS}` : house(c, b.row), c, b.row);
        }
    }
    return props;
}
