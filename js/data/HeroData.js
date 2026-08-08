/**
 * The hero's active kit and the combo rules that reward walking him into the
 * lane instead of parking him behind the towers.
 *
 * Costed in cooldown only, never in maná. Maná is the temple upgrade currency,
 * and an ability that competed for it would just be a worse upgrade.
 */

export const HERO_ABILITIES = {
    dash: {
        key: 'dash',
        label: 'DASH',
        hotkey: 'Q',
        glyph: '»',
        cooldown: 6000,
        // Long enough to read as a movement, short enough to feel like an
        // escape — the whole point is getting out of a pocket you misjudged.
        castTime: 200,
        range: 118,
        invulnExtra: 140,
        color: 0x4FC3F7,
        colorHex: '#4FC3F7',
        // Body copy only. The cooldown is rendered from `cooldown` beside the
        // name, so it can never fall out of step with the number that governs.
        desc: [
            'Salto rapido hacia el cursor.',
            'Invulnerable durante el salto.',
        ],
    },
    quake: {
        key: 'quake',
        label: 'GOLPE',
        hotkey: 'E',
        glyph: '✳',
        cooldown: 9000,
        castTime: 360,
        radius: 76,
        damage: 42,
        slow: 0.35,
        slowDuration: 1800,
        color: 0xFF7043,
        colorHex: '#FF7043',
        desc: [
            'Golpe sismico alrededor del',
            'heroe: 42 de daño y ralentiza 35%.',
        ],
    },
};

export const ABILITY_ORDER = ['dash', 'quake'];

/** `DASH  [Q]  ·  6s` — one line that carries name, key and recharge. */
export function abilityHeading(key) {
    const a = HERO_ABILITIES[key];
    return `${a.label}  [${a.hotkey}]  ·  ${a.cooldown / 1000}s`;
}

/**
 * Collection combos. Each mote picked up inside the window raises the take on
 * the next one, so the payoff for standing in the lane grows the longer you
 * dare stay there — and collapses the moment you stop.
 */
export const COMBO = {
    window: 2600,   // ms of grace before the streak dies
    step: 0.25,     // bonus per extra mote in the streak
    maxMult: 2.5,   // reached at 7 motes
};

export function comboMultiplier(count) {
    if (count <= 1) return 1;
    return Math.min(COMBO.maxMult, 1 + COMBO.step * (count - 1));
}
