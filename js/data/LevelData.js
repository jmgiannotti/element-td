/**
 * Level definitions and map layout configurations.
 * Decouples map geometry, waypoints, obstacles and spawns from scene logic.
 *
 * Rules every map keeps, because the engine relies on them (GridSystem):
 *  · Enemies enter at column 0 on the spawn row and leave through any road
 *    cell in the last column — so the last column carries road only on the
 *    exit row, and the first column only on the spawn row.
 *  · Waypoints are joined by straight horizontal or vertical runs.
 *  · Enemies don't follow the waypoints: they take the cheapest route over
 *    road (cost 1) and breakable blocks (cost 5). A breakable shortcut is only
 *    a *detour* if it costs more than the road it skips; then enemies keep to
 *    the road until the player barricades it, and only then smash through.
 *  · `roadAreas` are open plazas of road, room to maze with barricades.
 *  · Seals sit on buildable ground beside the road.
 *  · 'city' maps: houses fill the top row, so it carries no road; `townBlocks`
 *    are short rows of houses set into the board (see Terrain.townProps).
 */

// Map 1 — the original board.
export const MAP_1 = {
    id: 'map_1',
    name: 'Paso de Ceniza',
    biome: 'grass',
    waveProfile: 'ceniza',
    description: 'Trazado clásico con bloques de piedra y espacio abierto para laberintos.',
    cols: 20,
    rows: 15,
    heroSpawn: { col: 10, row: 7 },
    spawnPoint: { col: -1, row: 2 },
    exitPoint: { col: 20, row: 13 },
    waypoints: [
        { col: -1, row: 2 },
        { col: 14, row: 2 },
        { col: 14, row: 6 },
        { col: 3, row: 6 },
        { col: 3, row: 10 },
        { col: 16, row: 10 },
        { col: 16, row: 13 },
        { col: 20, row: 13 },
    ],
    breakableBlocks: [
        // Detour 1: around col 14 (rows 2 to 6)
        { c1: 15, r1: 2, c2: 17, r2: 3, hp: 80 },
        { c1: 16, r1: 4, c2: 17, r2: 7, hp: 80 },
        { c1: 15, r1: 6, c2: 15, r2: 7, hp: 80 },
        // Detour 2: around col 3 (rows 6 to 10)
        { c1: 1, r1: 6, c2: 2, r2: 7, hp: 80 },
        { c1: 1, r1: 8, c2: 2, r2: 11, hp: 80 },
    ],
    // Elemental seals (US 12.1), on grass beside the road: two per element,
    // one in each band between the switchbacks so no single stretch of road
    // hoards them.
    seals: [
        { col: 6, row: 4, element: 'fire' },
        { col: 11, row: 4, element: 'air' },
        { col: 7, row: 8, element: 'water' },
        { col: 12, row: 8, element: 'earth' },
        { col: 18, row: 8, element: 'water' },
        { col: 9, row: 12, element: 'earth' },
        { col: 13, row: 12, element: 'fire' },
        { col: 18, row: 12, element: 'air' },
    ],
    // Enough to open with a temple (60) plus any single tower (20–30) and
    // still have change — the first decision should be which two to buy,
    // not whether you can afford to start at all.
    initialGold: 110,
    initialLives: 20,
};

// Map 2 — the avenue runs past the market row, then rounds two blocks. Each
// block is cut across by a line of crates: a shortcut that costs the enemies
// more than going round, until you barricade the long way and they start
// smashing crates instead.
export const MAP_2 = {
    id: 'map_2',
    name: 'Plaza del Mercado',
    biome: 'city',
    waveProfile: 'mercado',
    description: 'Avenidas en ángulo recto frente al mercado y dos manzanas cortadas por cajas: barricá la vuelta larga y los enemigos romperán el atajo.',
    cols: 20,
    rows: 15,
    heroSpawn: { col: 14, row: 9 },
    spawnPoint: { col: -1, row: 2 },
    exitPoint: { col: 20, row: 13 },
    waypoints: [
        { col: -1, row: 2 },
        { col: 17, row: 2 },     // the market avenue, under the stalls
        { col: 17, row: 6 },
        { col: 4, row: 6 },
        { col: 4, row: 10 },
        { col: 12, row: 10 },
        { col: 12, row: 13 },
        { col: 20, row: 13 },
    ],
    breakableBlocks: [
        // Across the first block: 3 crates (15) against 12 steps of road
        { c1: 13, r1: 3, c2: 13, r2: 5, hp: 60 },
        // Across the second block: 3 crates (15) against 12 steps of road
        { c1: 8, r1: 7, c2: 8, r2: 9, hp: 60 },
    ],
    seals: [
        { col: 9, row: 4, element: 'fire' },
        { col: 12, row: 4, element: 'water' },   // against the crates
        { col: 15, row: 4, element: 'air' },
        { col: 6, row: 8, element: 'earth' },
        { col: 10, row: 8, element: 'fire' },
        { col: 8, row: 11, element: 'water' },
        { col: 13, row: 11, element: 'earth' },
        { col: 16, row: 12, element: 'air' },
    ],
    townBlocks: [
        { col: 6, row: 3, w: 2 },
        { col: 15, row: 8, w: 3 },
        { col: 1, row: 12, w: 3 },
    ],
    initialGold: 110,
    initialLives: 20,
};

// Map 3 — a figure of eight: two rings of two-lane road round two islands of
// basalt, a four-cell gap between them crossed by the waist, and two more
// islands in that gap above and below it. Each ring can be walked either way
// round; the default is the short side, and a pair of barricades across a
// two-wide lane sends the wave round the long one (+9 a ring). Obsidian plugs
// the passes between the rings at top and bottom: four rocks (cost 21), worth
// smashing only once the long way has been made very long. The islands carry
// the fire and earth seals, and a tower there covers the lanes all round it.
export const MAP_3 = {
    id: 'map_3',
    name: 'Caldera de Magma',
    biome: 'volcano',
    waveProfile: 'caldera',
    description: 'Un ocho de carriles dobles alrededor de islas de basalto: barricá un lado del anillo y la oleada da la vuelta larga. La obsidiana tapa los pasos entre anillos.',
    brief: 'Un ocho de carriles dobles: barricá un lado y la oleada da la vuelta larga. Enjambres densos.',
    cols: 20,
    rows: 15,
    heroSpawn: { col: 4, row: 5 },
    spawnPoint: { col: -1, row: 2 },
    exitPoint: { col: 20, row: 12 },
    waypoints: [
        { col: -1, row: 2 },
        { col: 7, row: 2 },      // along the top of the west ring
        { col: 7, row: 7 },
        { col: 12, row: 7 },     // through the waist
        { col: 12, row: 12 },
        { col: 20, row: 12 },    // out along the bottom of the east ring
    ],
    roadAreas: [
        // West ring, two lanes wide, round the island at cols 3–5, rows 3–11
        { c1: 1, r1: 1, c2: 7, r2: 2 },
        { c1: 1, r1: 12, c2: 7, r2: 13 },
        { c1: 1, r1: 1, c2: 2, r2: 13 },
        { c1: 6, r1: 1, c2: 7, r2: 13 },
        // East ring, round the island at cols 14–16, rows 3–11
        { c1: 12, r1: 1, c2: 18, r2: 2 },
        { c1: 12, r1: 12, c2: 18, r2: 13 },
        { c1: 12, r1: 1, c2: 13, r2: 13 },
        { c1: 17, r1: 1, c2: 18, r2: 13 },
        // The waist
        { c1: 8, r1: 7, c2: 11, r2: 8 },
    ],
    breakableBlocks: [
        // The passes between the rings, plugged with obsidian
        { c1: 8, r1: 1, c2: 11, r2: 1, hp: 100 },
        { c1: 8, r1: 13, c2: 11, r2: 13, hp: 100 },
    ],
    seals: [
        // West island
        { col: 4, row: 4, element: 'fire' },
        { col: 4, row: 7, element: 'earth' },
        { col: 4, row: 10, element: 'fire' },
        // East island
        { col: 15, row: 4, element: 'earth' },
        { col: 15, row: 7, element: 'fire' },
        { col: 15, row: 10, element: 'earth' },
        // The islands in the gap, above and below the waist
        { col: 9, row: 5, element: 'fire' },
        { col: 10, row: 10, element: 'earth' },
    ],
    // Barricades are the point of this map, so the purse leaves room for them.
    initialGold: 130,
    initialLives: 20,
};

// Map 4 — a long switchback down the glacier. The open ground on both flanks
// is where temples fit, inside a Sillar's reach of the road. Water and air
// seals sit in the bands between switchbacks, where one tower covers two runs.
export const MAP_4 = {
    id: 'map_4',
    name: 'Glaciar Quebrado',
    biome: 'snow',
    waveProfile: 'glaciar',
    description: 'Un camino largo en zigzag con explanadas a los lados para templos —al alcance de los Sillares— y sellos de agua y aire que cubren dos tramos a la vez.',
    cols: 20,
    rows: 15,
    heroSpawn: { col: 9, row: 6 },
    spawnPoint: { col: -1, row: 1 },
    exitPoint: { col: 20, row: 13 },
    waypoints: [
        { col: -1, row: 1 },
        { col: 16, row: 1 },
        { col: 16, row: 4 },
        { col: 3, row: 4 },
        { col: 3, row: 7 },
        { col: 16, row: 7 },
        { col: 16, row: 10 },
        { col: 3, row: 10 },
        { col: 3, row: 13 },
        { col: 20, row: 13 },
    ],
    breakableBlocks: [
        // Cracks across the bands near each turn: 2 blocks (10) against 9 steps
        { c1: 13, r1: 2, c2: 13, r2: 3, hp: 80 },
        { c1: 6, r1: 5, c2: 6, r2: 6, hp: 80 },
        { c1: 13, r1: 8, c2: 13, r2: 9, hp: 80 },
    ],
    seals: [
        { col: 8, row: 2, element: 'water' },
        { col: 10, row: 3, element: 'air' },
        { col: 9, row: 5, element: 'air' },
        { col: 10, row: 8, element: 'water' },
        { col: 8, row: 9, element: 'air' },
        { col: 9, row: 11, element: 'water' },
        { col: 17, row: 5, element: 'fire' },
        { col: 2, row: 9, element: 'earth' },
    ],
    initialGold: 110,
    initialLives: 20,
};

// Map 5 — the hard one. A maze with 180° symmetry about the centre, pillars
// you can force the enemies through, and all four elements twice over around
// the middle: the place to build legendaries.
export const MAP_5 = {
    id: 'map_5',
    name: 'Cripta Ancestral',
    biome: 'dungeon',
    waveProfile: 'cripta',
    description: 'El desafío avanzado: un laberinto simétrico con pilares rompibles y dos sellos de cada elemento junto al centro, para armar Torres Legendarias.',
    cols: 20,
    rows: 15,
    heroSpawn: { col: 9, row: 5 },
    spawnPoint: { col: -1, row: 7 },
    exitPoint: { col: 20, row: 7 },
    waypoints: [
        { col: -1, row: 7 },
        { col: 2, row: 7 },
        { col: 2, row: 2 },
        { col: 6, row: 2 },
        { col: 6, row: 11 },
        { col: 9, row: 11 },
        { col: 9, row: 7 },
        { col: 10, row: 7 },     // the centre; everything after mirrors what came before
        { col: 10, row: 3 },
        { col: 13, row: 3 },
        { col: 13, row: 12 },
        { col: 17, row: 12 },
        { col: 17, row: 7 },
        { col: 20, row: 7 },
    ],
    breakableBlocks: [
        // Outer pillars: 3 (15) against 14 steps of road
        { c1: 3, r1: 7, c2: 5, r2: 7, hp: 120 },
        { c1: 14, r1: 7, c2: 16, r2: 7, hp: 120 },
        // Inner pillars: 2 (10) against 9 steps of road
        { c1: 7, r1: 8, c2: 8, r2: 8, hp: 120 },
        { c1: 11, r1: 6, c2: 12, r2: 6, hp: 120 },
    ],
    seals: [
        { col: 8, row: 7, element: 'fire' },
        { col: 11, row: 7, element: 'fire' },
        { col: 7, row: 6, element: 'water' },
        { col: 12, row: 8, element: 'water' },
        { col: 8, row: 5, element: 'earth' },
        { col: 11, row: 9, element: 'earth' },
        { col: 7, row: 10, element: 'air' },
        { col: 12, row: 4, element: 'air' },
    ],
    initialGold: 150,
    initialLives: 15,
};

export const LEVELS = [MAP_1, MAP_2, MAP_3, MAP_4, MAP_5];
export const DEFAULT_LEVEL = MAP_1;

// Saves from before the maps had numbers name the first map by its old id;
// anything unknown lands there too.
export function getLevelById(id) {
    return LEVELS.find(lvl => lvl.id === id) || DEFAULT_LEVEL;
}
