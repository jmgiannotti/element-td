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

// Fusion pairs: sorted element names joined with '+'
export const FUSION_MAP = {
    'air+water': HYBRIDS.ICE,      // Agua + Aire → Hielo
    'air+fire': HYBRIDS.STORM,     // Aire + Fuego → Tormenta
    'earth+fire': HYBRIDS.LAVA,    // Fuego + Tierra → Lava
    'earth+water': HYBRIDS.MUD,    // Tierra + Agua → Lodo
};

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
        emoji: '🌀',
    },
};
