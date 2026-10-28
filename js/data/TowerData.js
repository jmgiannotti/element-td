export const ELEMENTS = {
    WATER: 'water',
    AIR: 'air',
    FIRE: 'fire',
    EARTH: 'earth',
};

export const HYBRIDS = {
    ICE: 'ice',
    STORM: 'storm',
    LAVA: 'lava',
    MUD: 'mud',
};

export const LEGENDARIES = {
    BLIZZARD: 'blizzard',
    ASHSTORM: 'ashstorm',
    OBSIDIAN: 'obsidian',
    GLACIER: 'glacier',
    GEYSER: 'geyser',
    ANCESTRAL: 'ancestral',
};

// Fusion pairs: sorted element names joined with '+'
export const FUSION_MAP = {
    'air+water': HYBRIDS.ICE,      // Agua + Aire → Hielo
    'air+fire': HYBRIDS.STORM,     // Aire + Fuego → Tormenta
    'earth+fire': HYBRIDS.LAVA,    // Fuego + Tierra → Lava
    'earth+water': HYBRIDS.MUD,    // Tierra + Agua → Lodo
};

/**
 * Tier 3: every pair of two *different* hybrids, so all six exist and none is
 * a dead end. Two of them — Obsidiana and Templo Ancestral — happen to hold all
 * four elements between their parents, which is why those two bend the
 * match-up rules instead of adding another status effect. Towers only: a
 * hybrid temple is already the top of its tree.
 */
export const LEGENDARY_MAP = {
    'ice+storm': LEGENDARIES.BLIZZARD,   // Hielo + Tormenta → Ventisca
    'lava+storm': LEGENDARIES.ASHSTORM,  // Lava + Tormenta → Tormenta de Ceniza
    'ice+lava': LEGENDARIES.OBSIDIAN,    // Hielo + Lava → Obsidiana
    'ice+mud': LEGENDARIES.GLACIER,      // Hielo + Lodo → Glaciar
    'lava+mud': LEGENDARIES.GEYSER,      // Lava + Lodo → Geiser
    'mud+storm': LEGENDARIES.ANCESTRAL,  // Lodo + Tormenta → Templo Ancestral
};

/** 1 pure, 2 hybrid, 3 legendary. */
export function tierOf(element) {
    return TOWER_DATA[element]?.tier ?? 1;
}

/** What two elements of the same tier fuse into, or null. */
export function fusionResult(a, b) {
    if (!a || !b || a === b) return null;
    const tier = tierOf(a);
    if (tier !== tierOf(b)) return null;
    const key = [a, b].sort().join('+');
    if (tier === 1) return FUSION_MAP[key] ?? null;
    if (tier === 2) return LEGENDARY_MAP[key] ?? null;
    return null;
}

/**
 * `emoji` is rendered by the system emoji font, not by the pixel font, so it is
 * limited to glyphs that font actually has: 🪨 (Emoji 13) and 🫧 (Emoji 14) both
 * came out as tofu boxes on Windows 10 and were swapped for 🟤 and 🌀. Anything
 * newer than about Emoji 12 is a gamble. They also have to stay distinguishable
 * from the ▲ / ▼ match-up markers they sit beside in the codex — which is what
 * ruled out ⛰ for tierra.
 *
 * `color` / `colorDark` are the two stops of the element's ramp that the UI is
 * allowed to use — the same `light` and `mid` BootScene paints the tower with.
 * Keeping them literally equal is what stops the sidebar swatch, the range
 * ring, the temple field and the sprite from being four slightly different
 * blues.
 */
export const TOWER_DATA = {
    // ── Pure Elements ──────────────────────────
    [ELEMENTS.WATER]: {
        name: 'Agua',
        element: ELEMENTS.WATER,
        damage: 8,
        range: 120,
        fireRate: 800,
        cost: 25,
        special: 'slow',
        specialValue: 0.2,
        specialDesc: 'Ralentiza 20%',
        color: 0x74D2F5,
        colorDark: 0x2E9BD8,
        isHybrid: false,
        tier: 1,
        emoji: '💧',
    },
    [ELEMENTS.AIR]: {
        name: 'Aire',
        element: ELEMENTS.AIR,
        damage: 5,
        range: 150,
        fireRate: 500,
        cost: 25,
        special: 'none',
        specialValue: 0,
        specialDesc: 'Ataque rápido',
        color: 0xC3D7E2,
        colorDark: 0x88A0B2,
        isHybrid: false,
        tier: 1,
        emoji: '💨',
    },
    [ELEMENTS.FIRE]: {
        name: 'Fuego',
        element: ELEMENTS.FIRE,
        damage: 15,
        range: 100,
        fireRate: 1200,
        cost: 30,
        special: 'splash',
        specialValue: 50,
        specialDesc: 'Daño en área',
        color: 0xFFA22C,
        colorDark: 0xE85D16,
        isHybrid: false,
        tier: 1,
        emoji: '🔥',
    },
    [ELEMENTS.EARTH]: {
        name: 'Tierra',
        element: ELEMENTS.EARTH,
        damage: 12,
        range: 90,
        fireRate: 1000,
        cost: 20,
        special: 'pierce',
        specialValue: 0,
        specialDesc: 'Ignora armadura',
        color: 0xC4924F,
        colorDark: 0x8F6234,
        isHybrid: false,
        tier: 1,
        emoji: '🟤',
    },

    // ── Hybrid Elements ────────────────────────
    [HYBRIDS.ICE]: {
        name: 'Hielo',
        element: HYBRIDS.ICE,
        damage: 18,
        range: 140,
        fireRate: 900,
        cost: 0,
        special: 'freeze',
        specialValue: 1500,
        specialDesc: 'Congela 1.5s',
        color: 0x92EBF5,
        colorDark: 0x36B6CC,
        isHybrid: true,
        tier: 2,
        emoji: '❄️',
    },
    [HYBRIDS.STORM]: {
        name: 'Tormenta',
        element: HYBRIDS.STORM,
        damage: 25,
        range: 160,
        fireRate: 600,
        cost: 0,
        special: 'chain',
        specialValue: 3,
        specialDesc: 'Cadena x3',
        color: 0xFFE45C,
        colorDark: 0x6B45D6,
        isHybrid: true,
        tier: 2,
        emoji: '⚡',
    },
    [HYBRIDS.LAVA]: {
        name: 'Lava',
        element: HYBRIDS.LAVA,
        damage: 35,
        range: 110,
        fireRate: 1400,
        cost: 0,
        special: 'burn',
        specialValue: 5,
        specialDesc: 'Quemadura DoT',
        color: 0xFF8A2B,
        colorDark: 0xD43D0A,
        isHybrid: true,
        tier: 2,
        emoji: '🌋',
    },
    [HYBRIDS.MUD]: {
        name: 'Lodo',
        element: HYBRIDS.MUD,
        damage: 10,
        range: 130,
        fireRate: 700,
        cost: 0,
        special: 'aoeSlow',
        specialValue: 0.4,
        specialDesc: 'AoE slow 40%',
        color: 0x62C3A8,
        colorDark: 0x2C8D74,
        isHybrid: true,
        tier: 2,
        emoji: '🌀',
    },

    // ── Legendary (Tier 3) ─────────────────────
    // `parents` are the two hybrids it was fused from. A legendary has no
    // temple of its own: it inherits the better of its parents' temple ranks,
    // and it counts as either parent for weaknesses and resistances.
    [LEGENDARIES.BLIZZARD]: {
        name: 'Ventisca',
        element: LEGENDARIES.BLIZZARD,
        damage: 30,
        range: 165,
        fireRate: 650,
        cost: 0,
        special: 'chainFreeze',
        specialValue: 4,
        freezeChance: 0.3,
        freezeMs: 1200,
        specialDesc: 'Cadena x4 congela',
        color: 0xA8D8FF,
        colorDark: 0x5F8CE0,
        isHybrid: true,
        tier: 3,
        parents: [HYBRIDS.ICE, HYBRIDS.STORM],
        emoji: '🌨',
    },
    [LEGENDARIES.ASHSTORM]: {
        name: 'Tormenta de Ceniza',
        element: LEGENDARIES.ASHSTORM,
        damage: 38,
        range: 160,
        fireRate: 700,
        cost: 0,
        special: 'chainBurn',
        specialValue: 4,
        burnDps: 8,
        specialDesc: 'Cadena x4 quema',
        color: 0xF0A048,
        colorDark: 0x8C4A32,
        isHybrid: true,
        tier: 3,
        parents: [HYBRIDS.LAVA, HYBRIDS.STORM],
        emoji: '🌪',
    },
    [LEGENDARIES.OBSIDIAN]: {
        name: 'Obsidiana',
        element: LEGENDARIES.OBSIDIAN,
        damage: 90,
        range: 135,
        fireRate: 1500,
        cost: 0,
        special: 'shatter',
        specialValue: 56,
        ignoresResist: true,
        specialDesc: 'Ignora resistencia',
        color: 0xB89CF0,
        colorDark: 0x5A3E8E,
        isHybrid: true,
        tier: 3,
        parents: [HYBRIDS.ICE, HYBRIDS.LAVA],
        emoji: '💎',
    },
    [LEGENDARIES.GLACIER]: {
        name: 'Glaciar',
        element: LEGENDARIES.GLACIER,
        damage: 26,
        range: 140,
        fireRate: 1300,
        cost: 0,
        special: 'aoeFreeze',
        specialValue: 900,
        radius: 60,
        specialDesc: 'Congela en area',
        color: 0x9FE3DC,
        colorDark: 0x3AA5A8,
        isHybrid: true,
        tier: 3,
        parents: [HYBRIDS.ICE, HYBRIDS.MUD],
        emoji: '🏔',
    },
    [LEGENDARIES.GEYSER]: {
        name: 'Geiser',
        element: LEGENDARIES.GEYSER,
        damage: 50,
        range: 125,
        fireRate: 1400,
        cost: 0,
        special: 'aoeBurn',
        specialValue: 64,
        burnDps: 9,
        specialDesc: 'Area + quemadura',
        color: 0xF0D070,
        colorDark: 0xB8902A,
        isHybrid: true,
        tier: 3,
        parents: [HYBRIDS.LAVA, HYBRIDS.MUD],
        emoji: '♨️',
    },
    [LEGENDARIES.ANCESTRAL]: {
        name: 'Templo Ancestral',
        element: LEGENDARIES.ANCESTRAL,
        damage: 42,
        range: 150,
        fireRate: 800,
        cost: 0,
        special: 'none',
        specialValue: 0,
        alwaysSuper: true,
        specialDesc: 'Siempre efectivo',
        color: 0xB8D870,
        colorDark: 0x6E9A40,
        isHybrid: true,
        tier: 3,
        parents: [HYBRIDS.MUD, HYBRIDS.STORM],
        emoji: '🗿',
    },
};

/**
 * Configuration and exponential scaling formula for individual tower upgrades with gold.
 * US 8.1 (Sumidero de Oro en Oleadas Tardías).
 */
export const TOWER_UPGRADE = {
    MAX_LEVEL: 10,
    DAMAGE_STEP: 0.25, // +25% base damage per level above 1
    RANGE_STEP: 0.08,   // +8% base range per level above 1
    EXP_BASE: 1.5,      // Exponential scaling factor

    /**
     * Calculates the gold cost to upgrade a tower from currentLevel to currentLevel + 1.
     * @param {string} element 
     * @param {number} currentLevel 
     * @returns {number}
     */
    costFor(element, currentLevel) {
        const base = TOWER_DATA[element]?.cost > 0 ? TOWER_DATA[element].cost : 50;
        return Math.round(base * Math.pow(this.EXP_BASE, currentLevel));
    },
};
