/**
 * Barricade enchantments (US 11.1).
 *
 * A barricade's job is to make the road longer, and a longer road is mostly
 * spent walking *beside* barricades. An enchantment turns that walk into the
 * cost: whatever passes the wall pays for it.
 *
 * The two are priced in different currencies on purpose. Spikes are iron —
 * gold, like everything built, and part of it comes back when the barricade
 * is sold. Frost is maná — the same life force the temples refine, and like a
 * temple rank it is spent for good. That way a long maze is something both
 * economies can invest in, and neither enchantment competes with the other
 * for the same coin.
 *
 * One per barricade, and it stays: picking spikes or frost for a given bend of
 * the maze is the decision, and a toggle would make it free.
 */

export const ENCHANT = {
    SPIKES: 'spikes',
    FROST: 'frost',
};

export const ENCHANT_ORDER = [ENCHANT.SPIKES, ENCHANT.FROST];

// How far from the barricade's centre an enemy counts as walking beside it:
// all eight cells around it (a diagonal neighbour's centre is 45px away) and
// nothing past them. At 36 only the four straight neighbours counted, and a
// detour that rounds the wall through its corners barely touched it.
export const ENCHANT_REACH = 48;

export const BARRICADE_ENCHANTS = {
    [ENCHANT.SPIKES]: {
        key: ENCHANT.SPIKES,
        name: 'Puas',
        currency: 'gold',
        cost: 25,
        // One prick per tick. Multiplied by the enemy's own wave HP scaling,
        // so a wall that mattered in wave 3 still matters in wave 20 without
        // ever becoming a boss killer by itself.
        tickMs: 500,
        damage: 8,
        desc: 'Hiere a quien pase al lado',
        texture: 'tile_barricade_spikes',
        color: 0xC3D7E2,
    },
    [ENCHANT.FROST]: {
        key: ENCHANT.FROST,
        name: 'Escarcha',
        currency: 'mana',
        cost: 50,
        // Re-applied every frame while in reach, and held a moment after, so
        // an enemy walking a whole corridor of frost stays slow the whole way
        // instead of flickering between cells. Never stacks with a stronger
        // slow: Enemy.applySlow keeps the larger one.
        slow: 0.35,
        lingerMs: 800,
        desc: 'Ralentiza 35% al lado',
        texture: 'tile_barricade_frost',
        color: 0x92EBF5,
    },
};

export function enchantCostLabel(type) {
    const e = BARRICADE_ENCHANTS[type];
    return `${e.cost} ${e.currency === 'gold' ? 'ORO' : 'MANA'}`;
}
