import { GridSystem, TILE } from './GridSystem.js';
import { BIOMES, resolveBiome, townProps } from './Terrain.js';
import {
    EL, GRASS, ROAD, BASALT, CITY, ROOFS, FOLIAGE, TIMBER, VOLCANO, OBSIDIAN,
    SNOW, DUNGEON, CRYPT, SEAL_RAMPS,
} from '../data/Palette.js';

/**
 * A level drawn small, for the map selector: the biome's floor, the real road
 * and lanes, the breakable blocks, the town and a dot on every seal. Built from
 * the same GridSystem and Terrain the game uses, so the preview cannot drift
 * from the map it previews.
 *
 * Colours come from the biome palettes, picked one stop up from the terrain so
 * they hold at a few pixels per cell: ground dark, road light, the same split
 * the board keeps.
 */
export const BIOME_LOOK = {
    grass:   { label: 'BOSQUE', ground: GRASS.base, road: ROAD.light, rim: GRASS.shadow, block: BASALT.light, accent: '#7AD46A' },
    city:    { label: 'CIUDAD', ground: CITY.ground.light, road: CITY.road.base, rim: CITY.rim.dark, block: TIMBER.glow, accent: '#D8CAA8' },
    volcano: { label: 'VOLCAN', ground: VOLCANO.ground.face, road: VOLCANO.road.base, rim: VOLCANO.rim.shadow, block: OBSIDIAN.mid, accent: '#FF8A2B' },
    snow:    { label: 'NIEVE', ground: SNOW.ground.face, road: SNOW.road.mid, rim: SNOW.rim.deep, block: EL.ice.mid, accent: '#92EBF5' },
    dungeon: { label: 'CRIPTA', ground: DUNGEON.ground.face, road: DUNGEON.road.base, rim: DUNGEON.rim.deep, block: CRYPT.light, accent: '#AB8CFF' },
};

// Each seal's dot: the light stop of the crystal drawn on the board
export const SEAL_COLOR = {
    fire: SEAL_RAMPS.fire.light,
    water: SEAL_RAMPS.water.light,
    earth: SEAL_RAMPS.earth.light,
    air: SEAL_RAMPS.air.light,
};

/**
 * Draws `level` into Graphics `g` with its top-left at (x, y), `cell` pixels a
 * tile. Returns the enemies' default route (grid cells), for animating.
 */
export function drawMapPreview(g, level, x, y, cell) {
    const grid = new GridSystem(level);
    const biome = resolveBiome(level.biome);
    const look = BIOME_LOOK[biome];
    const { cols, rows } = grid;
    const W = cols * cell, H = rows * cell;
    const isRoad = (c, r) => grid.inBounds(c, r) && grid.grid[r][c] !== TILE.GRASS;

    g.fillStyle(look.rim, 1);
    g.fillRect(x - 2, y - 2, W + 4, H + 4);
    g.fillStyle(look.ground, 1);
    g.fillRect(x, y, W, H);

    // Road, with a one-pixel rim wherever it meets ground — the same dark
    // outline the board puts on every lane
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!isRoad(c, r)) continue;
            const px = x + c * cell, py = y + r * cell;
            g.fillStyle(look.road, 1);
            g.fillRect(px, py, cell, cell);
            g.fillStyle(look.rim, 1);
            if (!isRoad(c, r - 1) && r > 0) g.fillRect(px, py, cell, 1);
            if (!isRoad(c, r + 1) && r < rows - 1) g.fillRect(px, py + cell - 1, cell, 1);
            if (!isRoad(c - 1, r) && c > 0) g.fillRect(px, py, 1, cell);
            if (!isRoad(c + 1, r) && c < cols - 1) g.fillRect(px + cell - 1, py, 1, cell);
        }
    }

    // Breakable blocks: a dark-rimmed lump inside the cell
    const inset = Math.max(1, Math.round(cell * 0.18));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid.grid[r][c] !== TILE.BREAKABLE) continue;
            const px = x + c * cell + inset, py = y + r * cell + inset, s = cell - inset * 2;
            g.fillStyle(look.rim, 1);
            g.fillRect(px - 1, py - 1, s + 2, s + 2);
            g.fillStyle(look.block, 1);
            g.fillRect(px, py, s, s);
            if (biome === 'volcano') {
                g.fillStyle(EL.lava.light, 1);
                g.fillRect(px + (s >> 1), py + 1, 1, s - 2);
            }
        }
    }

    // The town, on city maps: roofs and treetops
    if (BIOMES[biome].town) {
        for (const p of townProps(grid)) {
            const px = x + (p.x / 32) * cell, py = y + (p.y / 32) * cell;
            if (p.key.startsWith('town_tree')) {
                g.fillStyle(FOLIAGE.dark, 1);
                g.fillCircle(px + cell / 2, py + cell / 2, cell * 0.42);
                g.fillStyle(FOLIAGE.light, 1);
                g.fillCircle(px + cell / 2 - 1, py + cell / 2 - 1, cell * 0.2);
            } else if (p.key.startsWith('town_stall')) {
                g.fillStyle(0xa23626, 1);
                g.fillRect(px + 1, py + 1, cell - 2, Math.ceil(cell / 2));
                g.fillStyle(0xd8caa8, 1);
                for (let i = 1; i < cell - 1; i += 3) g.fillRect(px + i, py + 1, 1, Math.ceil(cell / 2));
            } else {
                const roof = ROOFS[Number(p.key.slice(-1)) % 3];
                g.fillStyle(roof.dark, 1);
                g.fillRect(px, py, cell, cell);
                g.fillStyle(roof.light, 1);
                g.fillRect(px, py, cell, Math.ceil(cell * 0.6));
                g.fillStyle(roof.deep, 1);
                g.fillRect(px, py, 1, cell);
            }
        }
    }

    // Seals: a dot in the element's colour, rimmed so it reads on any floor
    for (const s of level.seals || []) {
        const cx = x + s.col * cell + cell / 2, cy = y + s.row * cell + cell / 2;
        g.fillStyle(0x000000, 0.8);
        g.fillCircle(cx, cy, cell * 0.36);
        g.fillStyle(SEAL_COLOR[s.element] ?? 0xffffff, 1);
        g.fillCircle(cx, cy, cell * 0.26);
    }

    // Entrance and exit: a green notch and a gold notch on the edges
    const sr = level.spawnPoint.row, er = level.exitPoint.row;
    g.fillStyle(0x4caf50, 1);
    g.fillRect(x - 3, y + sr * cell + 1, 3, cell - 2);
    g.fillStyle(0xffd54f, 1);
    g.fillRect(x + W, y + er * cell + 1, 3, cell - 2);

    return grid.findPath(level.spawnPoint.col, level.spawnPoint.row, level.exitPoint.col, level.exitPoint.row) || [];
}
