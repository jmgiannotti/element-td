import { TOWER_DATA } from './TowerData.js';

/**
 * The elemental rock-paper-scissors: how much of a tower's damage actually
 * lands on a given enemy.
 *
 * The rules live here rather than inside Projectile because three different
 * places need to agree on them — the hit resolution, the floating number that
 * explains it, and the next-wave preview the player plans around.
 */

// A hit that finds a weakness lands for half again; one that meets a resistance
// keeps half. Symmetric on purpose: the two are equally worth reading.
export const SUPER_MULT = 1.5;
export const RESIST_MULT = 0.5;

export const EFFECT = {
    SUPER: 'super',
    RESIST: 'resist',
    NORMAL: 'normal',
};

// Every effect carries a glyph as well as a colour. Colour alone is unreadable
// for a good share of players, and this is a system you cannot play blind.
export const EFFECT_MARK = {
    [EFFECT.SUPER]: '▲',
    [EFFECT.RESIST]: '▼',
    [EFFECT.NORMAL]: '',
};

export const EFFECT_LABEL = {
    [EFFECT.SUPER]: 'Super efectivo',
    [EFFECT.RESIST]: 'Resistido',
    [EFFECT.NORMAL]: '',
};

export const EFFECT_COLOR = {
    [EFFECT.SUPER]: '#FFD54F',
    [EFFECT.RESIST]: '#78909C',
    [EFFECT.NORMAL]: '#FFFFFF',
};

/** The distinctive mark of an element — never only its colour. */
export function elementSymbol(element) {
    return TOWER_DATA[element]?.emoji ?? '◈';
}

export function elementName(element) {
    return TOWER_DATA[element]?.name ?? element;
}

/**
 * What happens when a tower of `towerElement` hits this enemy.
 *
 * Weakness wins over resistance if both somehow list the same element: the
 * generous reading is the one that keeps the table honest to the player.
 */
export function effectOf(towerElement, enemyData) {
    if (!enemyData || !towerElement) return EFFECT.NORMAL;
    if (enemyData.weakness?.includes(towerElement)) return EFFECT.SUPER;
    if (enemyData.resistance?.includes(towerElement)) return EFFECT.RESIST;
    return EFFECT.NORMAL;
}

export function effectMultiplier(effect) {
    if (effect === EFFECT.SUPER) return SUPER_MULT;
    if (effect === EFFECT.RESIST) return RESIST_MULT;
    return 1;
}
