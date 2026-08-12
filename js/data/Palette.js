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

// ─── Terrain palettes ───────────────────────────────────
export const GRASS = {
    shadow: 0x081a10, deep: 0x0f2a1b, base: 0x173824,
    mid: 0x1e442c, light: 0x2b5836, lit: 0x3c7046,
};
export const ROAD = {
    joint: 0x5c4830, deep: 0x7d6446, base: 0xa78d68,
    mid: 0xb99f7a, light: 0xcdb492, lit: 0xe0cbaa,
};
