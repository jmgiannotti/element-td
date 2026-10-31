/**
 * EL ARBOL DE VESPER — meta-progression between games.
 *
 * Every map won pays in stars (1–3, by the lives left when the last base wave
 * falls). Only a map's best mark counts, so replaying a map is a way to raise
 * it, never a way to farm it. The stars a player holds are spent here as
 * Esencias Arcanas on permanent talents.
 *
 * Nine talents in three branches, three tiers each. A tier needs the one under
 * it in the same branch, and costs as many essences as its tier number, so a
 * branch is 1 + 2 + 3 = 6 and the whole tree 18 — exactly three stars on each
 * of the six maps. Until then the player picks; a reset hands everything back.
 *
 * Effects are plain numbers merged onto TALENT_DEFAULTS, so gameplay code reads
 * `scene.talents.heroSpeedMult` and never asks which talent is owned.
 *
 * Text rule (AGENTS.md): the font has no emoji and no accented capitals. Names
 * are upper case without accents; descriptions are mixed case.
 */

export const TALENT_BRANCHES = {
    marcial: {
        key: 'marcial',
        label: 'MARCIAL',
        blurb: 'Vesper en el frente',
        color: 0xFF7043,
        colorHex: '#FF7043',
    },
    arcana: {
        key: 'arcana',
        label: 'ARCANA',
        blurb: 'Hechizos del farol',
        color: 0xB388FF,
        colorHex: '#B388FF',
    },
    arquitectura: {
        key: 'arquitectura',
        label: 'ARQUITECTURA',
        blurb: 'Muros, oro y obra',
        color: 0xFFD54F,
        colorHex: '#FFD54F',
    },
};

export const BRANCH_ORDER = ['marcial', 'arcana', 'arquitectura'];

/** Essences a tier costs. */
export const TIER_COST = { 1: 1, 2: 2, 3: 3 };

/** What a run plays with when nothing is owned: every effect at neutral. */
export const TALENT_DEFAULTS = Object.freeze({
    heroSpeedMult: 1,
    heroHpMult: 1,
    dashStunMs: 0,
    dashStunRadius: 0,
    spellCooldownMult: 1,
    sentinelBonus: 0,
    lunaDamageMult: 1,
    sellRefundBonus: 0,
    spikeDamageMult: 1,
    frostLingerMult: 1,
    startGoldBonus: 0,
});

export const TALENTS = {
    // ── MARCIAL ─────────────────────────────────────
    paso_ligero: {
        id: 'paso_ligero', branch: 'marcial', tier: 1,
        name: 'PASO LIGERO',
        icon: 'talent_paso_ligero',
        desc: 'Vesper camina un 15% mas rapido.',
        effect: { heroSpeedMult: 1.15 },
    },
    temple_vigilia: {
        id: 'temple_vigilia', branch: 'marcial', tier: 2,
        name: 'TEMPLE DE VIGILIA',
        icon: 'talent_temple_vigilia',
        desc: 'Vesper tiene +25% de vida.',
        effect: { heroHpMult: 1.25 },
    },
    pulso_choque: {
        id: 'pulso_choque', branch: 'marcial', tier: 3,
        name: 'PULSO DE CHOQUE',
        icon: 'talent_pulso_choque',
        desc: 'El Dash aturde 0,8s a los enemigos cercanos.',
        effect: { dashStunMs: 800, dashStunRadius: 60 },
    },

    // ── ARCANA ──────────────────────────────────────
    canal_fluido: {
        id: 'canal_fluido', branch: 'arcana', tier: 1,
        name: 'CANAL FLUIDO',
        icon: 'talent_canal_fluido',
        desc: 'Los hechizos recargan un 15% mas rapido.',
        effect: { spellCooldownMult: 0.85 },
    },
    cuarto_centinela: {
        id: 'cuarto_centinela', branch: 'arcana', tier: 2,
        name: 'CUARTO CENTINELA',
        icon: 'talent_cuarto_centinela',
        desc: 'Centinelas Arcanos invoca +1 soldado.',
        effect: { sentinelBonus: 1 },
    },
    luna_llena: {
        id: 'luna_llena', branch: 'arcana', tier: 3,
        name: 'LUNA LLENA',
        icon: 'talent_luna_llena',
        desc: 'Luna hace +40% de daño.',
        effect: { lunaDamageMult: 1.4 },
    },

    // ── ARQUITECTURA ────────────────────────────────
    reciclaje: {
        id: 'reciclaje', branch: 'arquitectura', tier: 1,
        name: 'RECICLAJE',
        icon: 'talent_reciclaje',
        desc: 'Vender devuelve +10% de oro.',
        effect: { sellRefundBonus: 0.1 },
    },
    puas_dentadas: {
        id: 'puas_dentadas', branch: 'arquitectura', tier: 2,
        name: 'PUAS DENTADAS',
        icon: 'talent_puas_dentadas',
        desc: 'Puas hacen +50% de daño y Escarcha ralentiza el doble de tiempo.',
        effect: { spikeDamageMult: 1.5, frostLingerMult: 2 },
    },
    tesoro_guerra: {
        id: 'tesoro_guerra', branch: 'arquitectura', tier: 3,
        name: 'TESORO DE GUERRA',
        icon: 'talent_tesoro_guerra',
        desc: 'Empezas cada partida con +40 de oro.',
        effect: { startGoldBonus: 40 },
    },
};

export const TALENT_ORDER = BRANCH_ORDER.flatMap(b =>
    Object.values(TALENTS).filter(t => t.branch === b).sort((x, y) => x.tier - y.tier).map(t => t.id));

/** The most a full set of maps can pay, and what the whole tree costs. */
export const TREE_COST = TALENT_ORDER.reduce((sum, id) => sum + talentCost(id), 0);

export function talentCost(id) {
    const t = TALENTS[id];
    return t ? TIER_COST[t.tier] : 0;
}

/** The talent one tier below in the same branch, or null for a tier 1. */
export function talentRequirement(id) {
    const t = TALENTS[id];
    if (!t || t.tier <= 1) return null;
    return Object.values(TALENTS).find(o => o.branch === t.branch && o.tier === t.tier - 1)?.id ?? null;
}

/** Stars for a won map: 3 with every life, 2 with half or more, 1 below. */
export function starsForVictory(lives, maxLives) {
    if (lives >= maxLives) return 3;
    if (lives >= maxLives / 2) return 2;
    return 1;
}

/**
 * Keeps only real talents whose prerequisite is also kept, so a hand-edited or
 * outdated save can never leave a tier 3 floating without its tier 2.
 */
export function sanitizeOwned(ids) {
    const set = new Set((Array.isArray(ids) ? ids : []).filter(id => TALENTS[id]));
    for (const id of TALENT_ORDER) {
        const req = talentRequirement(id);
        if (set.has(id) && req && !set.has(req)) set.delete(id);
    }
    // A deletion can orphan the next tier; TALENT_ORDER goes tier 1 → 3 per
    // branch, so one pass in order already caught that.
    return TALENT_ORDER.filter(id => set.has(id));
}

/** Owned ids → the numbers a run plays with. */
export function talentEffects(ownedIds) {
    const fx = { ...TALENT_DEFAULTS };
    for (const id of sanitizeOwned(ownedIds)) Object.assign(fx, TALENTS[id].effect);
    return fx;
}
