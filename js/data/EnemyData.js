export const ENEMY_TYPES = {
    SLIME: 'slime',
    GOLEM: 'golem',
    SPECTER: 'specter',
    DRAGON: 'dragon',
};

/**
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
        hp: 30,
        speed: 55,
        element: 'water',
        weakness: ['fire', 'lava'],
        resistance: [],
        gold: 6,
        manaDrops: 1,
        color: 0x66BB6A,
        colorDark: 0x388E3C,
    },
    [ENEMY_TYPES.GOLEM]: {
        name: 'Golem',
        hp: 80,
        speed: 32,
        element: 'earth',
        weakness: ['water', 'mud'],
        resistance: ['earth'],
        gold: 14,
        manaDrops: 2,
        color: 0x9E9E9E,
        colorDark: 0x616161,
        spawns: [{ type: ENEMY_TYPES.SLIME, count: 2 }],
    },
    [ENEMY_TYPES.SPECTER]: {
        name: 'Espectro',
        hp: 40,
        speed: 85,
        element: 'air',
        weakness: ['earth', 'storm'],
        resistance: ['air'],
        gold: 9,
        manaDrops: 1,
        color: 0xCE93D8,
        colorDark: 0xAB47BC,
    },
    [ENEMY_TYPES.DRAGON]: {
        name: 'Dragón',
        hp: 200,
        speed: 40,
        element: 'fire',
        weakness: ['water', 'ice'],
        resistance: ['fire', 'lava'],
        gold: 45,
        manaDrops: 3,
        color: 0xEF5350,
        colorDark: 0xC62828,
        spawns: [{ type: ENEMY_TYPES.GOLEM, count: 1 }],
    },
};
