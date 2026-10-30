import { ELEMENTS, TOWER_DATA } from './TowerData.js';

/**
 * Temples are the only structures that harvest life force (maná), and the only
 * place tower upgrades can be bought. Their identity is derived from the tower
 * of the same element so a new element only ever has to be declared once.
 */

// ── Build cost ───────────────────────────────────────────
// Priced off how many temples are standing right now, not how many were ever
// bought — so fusing two temples into one genuinely makes the next one cheaper.
// 80 rather than 60 since gold comes per wave: the first temple is a decision
// against two towers, not a purchase you make in passing.
export const TEMPLE_BASE_COST = 80;
export const TEMPLE_COST_GROWTH = 1.55;

export function templeCost(standingCount) {
    return Math.round(TEMPLE_BASE_COST * Math.pow(TEMPLE_COST_GROWTH, standingCount));
}

// ── Upgrade tracks ───────────────────────────────────────
// `step` is the effect per level. fireRate is a cooldown in milliseconds, so
// shorter is better and its multiplier divides — see TempleSystem.multiplier().
// Priced so that maxing one element (all three tracks: ~4300 maná) is most
// of a run's maná rather than two late waves' worth — it used to be ~3100
// against roughly twice the income.
export const UPGRADE_TRACKS = {
    damage: {
        key: 'damage', label: 'DAÑO',
        step: 0.20, maxLevel: 5, baseCost: 75, growth: 1.7,
        color: '#FF7043', colorNum: 0xFF7043,
    },
    fireRate: {
        key: 'fireRate', label: 'CADENCIA',
        step: 0.14, maxLevel: 5, baseCost: 90, growth: 1.7,
        color: '#FFD54F', colorNum: 0xFFD54F,
    },
    range: {
        key: 'range', label: 'ALCANCE',
        step: 0.10, maxLevel: 5, baseCost: 65, growth: 1.7,
        color: '#4FC3F7', colorNum: 0x4FC3F7,
    },
};

export const TRACK_ORDER = ['damage', 'fireRate', 'range'];

/**
 * Sobrecarga Elemental: the late-game maná sink. Unlocked for an element once
 * its three tracks are maxed, and repeatable without end — each purchase adds
 * `step` damage to every tower of that element and costs `growth` times the
 * last, so it soaks up a hoard without ever turning into a free win.
 */
export const OVERCHARGE = {
    key: 'overcharge', label: 'SOBRECARGA',
    step: 0.05, baseCost: 500, growth: 1.4,
    color: '#E040FB', colorNum: 0xE040FB,
};

export function overchargeCost(currentLevel) {
    return Math.round(OVERCHARGE.baseCost * Math.pow(OVERCHARGE.growth, currentLevel));
}

/** Temples you can buy outright. The hybrids are only reachable by fusion. */
export const TEMPLE_ELEMENTS = [
    ELEMENTS.WATER, ELEMENTS.AIR, ELEMENTS.FIRE, ELEMENTS.EARTH,
];

export const TEMPLE_DATA = Object.fromEntries(
    Object.entries(TOWER_DATA).filter(([, t]) => t.tier < 3).map(([el, t]) => [el, {
        element: el,
        name: `Templo de ${t.name}`,
        shortName: t.name,
        color: t.color,
        colorDark: t.colorDark,
        emoji: t.emoji,
        isHybrid: t.isHybrid,
        tier: t.tier,
        // A hybrid temple costs you two elemental upgrade trees, so it has to
        // pay for itself: it reaches further and refines more out of each mote.
        absorbRadius: t.isHybrid ? 132 : 104,
        absorbBonus: t.isHybrid ? 0.3 : 0.1,
    }])
);

export function upgradeCost(track, currentLevel) {
    const t = UPGRADE_TRACKS[track];
    return Math.round(t.baseCost * Math.pow(t.growth, currentLevel));
}
