import { ramp } from '../systems/Pixels.js';

/**
 * The game's entire colour system. Nothing anywhere picks a colour that is not
 * a stop on one of these ramps — that constraint, more than any single sprite,
 * is what makes the board look designed rather than assembled.
 */

export const EL = {
    water: ramp(0x062a4a, 0x0d5b96, 0x2e9bd8, 0x74d2f5, 0xd6f4ff),
    air:   ramp(0x2a3642, 0x4d6072, 0x88a0b2, 0xc3d7e2, 0xf4fbff),
    fire:  ramp(0x4d1200, 0x9c2c06, 0xe85d16, 0xffa22c, 0xffe7a8),
    earth: ramp(0x241608, 0x5a3a1c, 0x8f6234, 0xc4924f, 0xffd98a),
    ice:   ramp(0x0a3a4c, 0x14708a, 0x36b6cc, 0x92ebf5, 0xeaffff),
    storm: ramp(0x1a0f42, 0x3a2288, 0x6b45d6, 0xab8cff, 0xffe45c),
    lava:  ramp(0x330a04, 0x7a1a06, 0xd43d0a, 0xff8a2b, 0xffd75c),
    mud:   ramp(0x0b2e24, 0x175947, 0x2c8d74, 0x62c3a8, 0xc6f1e2),

    // Legendaries. Each sits between its two parents' ramps, so a Ventisca
    // still reads as ice-and-storm before you know its name.
    blizzard:  ramp(0x101a4a, 0x2a3f98, 0x5f8ce0, 0xa8d8ff, 0xf4fdff),
    ashstorm:  ramp(0x1c1014, 0x4a2a2a, 0x8c4a32, 0xf0a048, 0xffe45c),
    obsidian:  ramp(0x08060e, 0x1e1630, 0x5a3e8e, 0xb89cf0, 0xf4eaff),
    glacier:   ramp(0x0a2e36, 0x15606a, 0x3aa5a8, 0x9fe3dc, 0xf0fffb),
    geyser:    ramp(0x2e2206, 0x6e5410, 0xb8902a, 0xf0d070, 0xfff8d8),
    ancestral: ramp(0x1a2a14, 0x3a5a28, 0x6e9a40, 0xb8d870, 0xf8ffd8),
};

// Arcane granite — every tower pedestal, every barricade band. Deliberately
// the same family as the UI panels so the board and the sidebar agree.
export const STONE  = ramp(0x0c0c1a, 0x1e1e38, 0x373760, 0x54548a, 0x7676ac);
// The same granite two stops up, for the basins and bowls that stand on top of
// a pedestal: cut from one block, but light enough to read against it.
export const STONE_HI = ramp(0x14142a, 0x373760, 0x54548a, 0x7676ac, 0xa4a4d2);
// Pale temple marble: the same masonry lit two stops higher, so a temple reads
// as the important building without being a different material.
export const MARBLE = ramp(0x141a2a, 0x36415c, 0x5b6c8c, 0x8ba0bc, 0xcfdde9);
// Cold volcanic rock: boulders, the volcano cone, the golem.
export const BASALT = ramp(0x100a12, 0x2b2130, 0x463a4c, 0x655670, 0x8a7a94);

export const GOLD = ramp(0x4a2f00, 0x8a5c05, 0xd39a12, 0xffd54f, 0xfff3c4);
// Life force. The motes, Vesper's lantern, the maná readouts, and the violet
// still trapped inside the things that fed on it — one colour for one idea.
export const SOUL = ramp(0x2a1060, 0x5b2bb0, 0x8f5ce8, 0xb388ff, 0xf1e6ff);
// The hero's purple, reused on the keep's banner so the thing you are
// defending and the thing defending it are visibly the same side.
export const BANNER = ramp(0x2b0d4a, 0x5b1e94, 0x8b34c9, 0xb463e8, 0xe3bcff);

// The seal crystals (US 12.1). Water borrows ice and earth goes lime so the
// four still tell apart at a glance — including as dots on the map preview.
export const SEAL_RAMPS = {
    fire:  EL.fire,
    water: EL.ice,
    earth: ramp(0x1a2608, 0x3d5a14, 0x7a9a2a, 0xc8d25a, 0xfff0a8),
    air:   ramp(0x241c48, 0x5a4a9a, 0xa898d8, 0xe4ddff, 0xffffff),
};

// ─── Terrain palettes ───────────────────────────────────
export const GRASS = {
    shadow: 0x081a10, deep: 0x0f2a1b, base: 0x173824,
    mid: 0x1e442c, light: 0x2b5836, lit: 0x3c7046,
};
export const ROAD = {
    joint: 0x5c4830, deep: 0x7d6446, base: 0xa78d68,
    mid: 0xb99f7a, light: 0xcdb492, lit: 0xe0cbaa,
};

// ─── Biome palettes (US 14.1) ───────────────────────────
// Every biome keeps the lawn/road split above: `ground` is the buildable floor
// and must stay dark (luma 12–20 %), `road` is the lane and must stay light
// (60–75 %), and `rim` is the dark border between them. Only the material
// changes — a biome that broke the values would hide the towers and the bolts.
export const CITY = {
    // Dark cobbles, laid flat: stones and joints only a shade apart, so the
    // floor reads as calm paving rather than cracked rock
    ground: {
        joint: 0x161922, shade: 0x181b25, base: 0x1b1f2a, face: 0x1e222d, light: 0x21252f,
        rim: 0x242934, lit: 0x282d39,
    },
    // Warm cream flags on an ochre gravel bed
    road: { joint: 0x7a6a54, deep: 0xa08f74, base: 0xb9a787, mid: 0xc6b494, light: 0xd2c2a2, lit: 0xdfd2bc, glow: 0xece2cc },
    // The kerb: dark stone between the paving and the street
    rim: ramp(0x141110, 0x2b2623, 0x3e3732, 0x544b44, 0x6b6159),
};
export const ROOFS = [
    ramp(0x1c0c08, 0x4e2418, 0x6e3624, 0x8c4c32, 0xa86846),   // terracotta
    ramp(0x0c1018, 0x232a3a, 0x353e52, 0x4a556c, 0x667490),   // slate
    ramp(0x140c06, 0x34200f, 0x4c321c, 0x644428, 0x7e5a3a),   // wooden shingle
    ramp(0x1a0c0a, 0x44201a, 0x5e3026, 0x7a4234, 0x965a48),   // old brick-red tile
];
export const TIMBER = ramp(0x0b0705, 0x2a1a0e, 0x432c17, 0x5e3f22, 0x7a5531);
// Townhouse walls: limewash and old dark plaster
export const WALL = {
    cream: ramp(0x3a3020, 0x7a6c52, 0xa8987a, 0xc4b494, 0xd8caa8),
    dark:  ramp(0x141210, 0x2e2822, 0x463d33, 0x5c5244, 0x786c5a),
};
// Street trees: dark, so a canopy reads as a gap in the block, not a lawn
export const FOLIAGE = ramp(0x06160c, 0x0f2a18, 0x1a4226, 0x2a5e34, 0x467c48);
// Market goods left in the street: burlap and straw
export const SACK = ramp(0x1e160c, 0x4e3c24, 0x75603e, 0x9a8458, 0xbca97c);
export const HAY = ramp(0x2a1e08, 0x6a5420, 0x957a34, 0xbca052, 0xdcc47c);
// Market canvas — muted, so a stall is a stall and not a power-up.
export const AWNING = {
    red:   ramp(0x2e0c08, 0x6e1e14, 0xa23626, 0xc45a44, 0xe08c74),
    blue:  ramp(0x0a1430, 0x1c3468, 0x2c5498, 0x5280bc, 0x8eb2de),
    green: ramp(0x0c2410, 0x1c4a24, 0x2c6e36, 0x4e9452, 0x8cc48a),
    cream: ramp(0x3a3022, 0x8a7a5e, 0xbcab88, 0xd8caa8, 0xf0e6cc),
};

export const VOLCANO = {
    // Basalt and settled ash
    ground: { crack: 0x140f10, shade: 0x1a1416, base: 0x1c1618, face: 0x3a3033, lit: 0x463b3e, ash: 0x524a4e },
    // Igneous flags, warm ochre with bright bevels
    road: { joint: 0x7c4e33, deep: 0xb27f58, base: 0xc48c64, mid: 0xd3a076, light: 0xdeab80, lit: 0xe6a972, glow: 0xf4c896 },
    rim: { shadow: 0x0c0809, deep: 0x161012, base: 0x221a1c, mid: 0x2e2427, light: 0x3c3134, cast: 0x0a0607 },
};
export const OBSIDIAN = ramp(0x060408, 0x161218, 0x2a2430, 0x463e52, 0x8a80a0);

export const SNOW = {
    // Frozen slate under a night sky
    ground: { crack: 0x0c1520, shade: 0x111c27, base: 0x15222e, face: 0x1c2d3d, lit: 0x243a4e, frost: 0x3c5a72 },
    // Packed snow and set ice
    road: { joint: 0x5a7a98, deep: 0x86a2ba, base: 0xa4bdd0, mid: 0xb2cadb, light: 0xbfd6e6, lit: 0xd9ecf7 },
    rim: { shadow: 0x0a1424, deep: 0x10213a, base: 0x17304f, mid: 0x1f3d62, light: 0x2b5078, cast: 0x060e1a },
};

export const DUNGEON = {
    // Big crypt flags at the bottom of the abyss, joints barely there
    ground: { joint: 0x15121f, shade: 0x16131f, base: 0x181524, face: 0x231e33, lit: 0x2e2842, crack: 0x0f0d17 },
    // Pale arcane marble, lavender-grey
    road: { joint: 0x5a5474, deep: 0x8e88a8, base: 0xa8a3bf, mid: 0xb5b0c9, light: 0xc3bed6, lit: 0xcec9e0, glow: 0xdcd8ec, vein: 0x9690b0 },
    rim: ramp(0x0b0a12, 0x221f30, 0x332f46, 0x48435e, 0x5e5878),
};
// Crypt stone: pillars, sarcophagi
export const CRYPT = ramp(0x0e0c16, 0x2c283e, 0x4a4562, 0x6f6a8c, 0x9e99bc);
