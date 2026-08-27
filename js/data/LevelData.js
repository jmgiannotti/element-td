/**
 * Level definitions and map layout configurations.
 * Decouples map geometry, waypoints, obstacles and spawns from scene logic.
 */

export const LEVEL_VALLE = {
    id: 'valle_sagrado',
    name: 'Valle Sagrado',
    biome: 'grass',
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
    initialGold: 100,
    initialLives: 20,
};

export const LEVELS = [LEVEL_VALLE];
export const DEFAULT_LEVEL = LEVEL_VALLE;

export function getLevelById(id) {
    return LEVELS.find(lvl => lvl.id === id) || DEFAULT_LEVEL;
}
