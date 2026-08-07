import { ELEMENTS, TOWER_DATA } from './TowerData.js';

/**
 * Temples are the only structures that harvest life force (maná), and the only
 * place tower upgrades can be bought. Their identity is derived from the tower
 * of the same element so a new element only ever has to be declared once.
 */

// ── Build cost ───────────────────────────────────────────
// Priced off how many temples are standing right now, not how many were ever
// bought — so fusing two temples into one genuinely makes the next one cheaper.
export const TEMPLE_BASE_COST = 60;
export const TEMPLE_COST_GROWTH = 1.55;

export function templeCost(standingCount) {
    return Math.round(TEMPLE_BASE_COST * Math.pow(TEMPLE_COST_GROWTH, standingCount));
}

// ── Upgrade tracks ───────────────────────────────────────
// `step` is the effect per level. fireRate is a cooldown in milliseconds, so
// shorter is better and its multiplier divides — see TempleSystem.multiplier().
export const UPGRADE_TRACKS = {
    damage: {
        key: 'damage', label: 'DAÑO',
        step: 0.20, maxLevel: 5, baseCost: 55, growth: 1.7,
        color: '#FF7043', colorNum: 0xFF7043,
    },
    fireRate: {
        key: 'fireRate', label: 'CADENCIA',
        step: 0.14, maxLevel: 5, baseCost: 65, growth: 1.7,
        color: '#FFD54F', colorNum: 0xFFD54F,
    },
    range: {
        key: 'range', label: 'ALCANCE',
        step: 0.10, maxLevel: 5, baseCost: 45, growth: 1.7,
        color: '#4FC3F7', colorNum: 0x4FC3F7,
    },
};

export const TRACK_ORDER = ['damage', 'fireRate', 'range'];

/** Temples you can buy outright. The hybrids are only reachable by fusion. */
export const TEMPLE_ELEMENTS = [
    ELEMENTS.WATER, ELEMENTS.AIR, ELEMENTS.FIRE, ELEMENTS.EARTH,
];

export const TEMPLE_DATA = Object.fromEntries(
    Object.entries(TOWER_DATA).map(([el, t]) => [el, {
        element: el,
        name: `Templo de ${t.name}`,
        shortName: t.name,
        color: t.color,
        colorDark: t.colorDark,
        emoji: t.emoji,
        isHybrid: t.isHybrid,
        // A hybrid temple costs you two elemental upgrade trees, so it has to
        // pay for itself: it reaches further and refines more out of each mote.
        absorbRadius: t.isHybrid ? 132 : 104,
        absorbBonus: t.isHybrid ? 0.5 : 0.15,
    }])
);

export function upgradeCost(track, currentLevel) {
    const t = UPGRADE_TRACKS[track];
    return Math.round(t.baseCost * Math.pow(t.growth, currentLevel));
}
