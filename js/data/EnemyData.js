export const ENEMY_TYPES = {
    SLIME: 'slime',
    GOLEM: 'golem',
    SPECTER: 'specter',
    DRAGON: 'dragon',
};

/**
 * WHAT WALKS THE ROAD, and why each thing is the thing it is.
 *
 * These four are not a bestiary bolted onto the board; they are what the Marcas
 * de Ceniza made out of what died in them, which is the same premise Vesper is
 * built on (see HeroLook.js). Stated once here, and drawn to match in
 * BootScene:
 *
 *   CUAJO    fuego fatuo that nobody drank, pooled and gone thick. You can see
 *            the violet motes still suspended in it — it is the resource, spoiled.
 *   SILLAR   a block of the fallen temple that remembered how to walk. Same
 *            marble as the temples you build, same gold in its seams.
 *   VELADOR  a vigilante of Vesper's own order who died and would not put the
 *            lantern down. Hooded like Vesper, hollow inside, carrying a lamp
 *            that went out a long time ago. You are fighting your predecessors.
 *   ASCUA    what was sleeping underneath the fire temple. Basalt hide with the
 *            magma still showing through — the same molten the lava tower spits.
 *
 * `title` is the epithet the codex shows; `codex` is the one line under it.
 *
 * `gold` is the kill bounty. Since motes became life force that only temples
 * may absorb, this is where the entire building budget comes from — retuning
 * it is retuning the pace of the whole game.
 *
 * Elemental class, `weakness` and `resistance` are what make fusion a tactical
 * decision rather than a strictly-better upgrade: a wave is a question about
 * which elements you brought. Both are lists so a hybrid tower can be named
 * directly — hitting a dragon with Hielo is a different act from hitting it
 * with plain Agua, and the table should be able to say so.
 *
 * Kept deliberately lopsided: the tutorial enemy has a weakness and no
 * resistance, so the first thing the system teaches is the reward, not the
 * punishment.
 */
export const ENEMY_DATA = {
    [ENEMY_TYPES.SLIME]: {
        name: 'Slime',
        title: 'Cuajo',
        codex: 'Fuego fatuo que nadie bebio, cuajado.',
        hp: 30,
        speed: 55,
        element: 'water',
        weakness: ['fire', 'lava'],
        resistance: [],
        gold: 6,
        manaDrops: 1,
        color: 0x7AD46A,
        colorDark: 0x2F8A3A,
    },
    [ENEMY_TYPES.GOLEM]: {
        name: 'Golem',
        title: 'Sillar',
        codex: 'Un bloque del templo caido, en pie.',
        hp: 80,
        speed: 32,
        element: 'earth',
        weakness: ['water', 'mud'],
        resistance: ['earth'],
        gold: 14,
        manaDrops: 2,
        color: 0x8BA0BC,
        colorDark: 0x5B6C8C,
        spawns: [{ type: ENEMY_TYPES.SLIME, count: 2 }],
    },
    [ENEMY_TYPES.SPECTER]: {
        name: 'Espectro',
        title: 'Velador',
        codex: 'Un vigia que murio sin soltar el farol.',
        hp: 40,
        speed: 85,
        element: 'air',
        weakness: ['earth', 'storm'],
        resistance: ['air'],
        gold: 9,
        manaDrops: 1,
        color: 0x9A86C4,
        colorDark: 0x5B4A86,
    },
    [ENEMY_TYPES.DRAGON]: {
        name: 'Dragón',
        title: 'Ascua',
        codex: 'Lo que dormia bajo el templo de fuego.',
        hp: 200,
        speed: 40,
        element: 'fire',
        weakness: ['water', 'ice'],
        resistance: ['fire', 'lava'],
        gold: 45,
        manaDrops: 3,
        color: 0xFF8A2B,
        colorDark: 0xD43D0A,
        spawns: [{ type: ENEMY_TYPES.GOLEM, count: 1 }],
    },
};
