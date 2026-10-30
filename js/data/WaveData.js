import { ENEMY_TYPES, ENEMY_DATA } from './EnemyData.js';

/**
 * Waves, per map. Every map runs 20 base waves with a boss on every fifth, then
 * endless mode generates the rest from the map's own recipe (WAVE_PROFILES).
 * Each list is a question the map asks: the market rushes you with hunters and
 * saboteurs, the caldera floods you, the glacier outruns you, the crypt puts
 * every resistance into the same wave.
 *
 * The enemy roles, for reading the lists:
 *   SLIME   (Cuajo)    water, weak to fire — the swarm.
 *   GOLEM   (Sillar)   earth — breaks off the road to shut temples down.
 *   SPECTER (Velador)  air, fast — breaks off the road to hunt Vesper.
 *   DRAGON  (Ascua)    fire, resists fire and lava — forces a second element.
 */

// Map 1 — Paso de Ceniza: the standard curve.
export const WAVE_DATA = [
    // Wave 1: Tutorial — just slimes
    {
        enemies: [
            { type: ENEMY_TYPES.SLIME, count: 5, delay: 1200 },
        ],
    },
    // Wave 2: More slimes, faster spawn
    {
        enemies: [
            { type: ENEMY_TYPES.SLIME, count: 8, delay: 1000 },
        ],
    },
    // Wave 3: Introduce golems
    {
        enemies: [
            { type: ENEMY_TYPES.SLIME, count: 6, delay: 900 },
            { type: ENEMY_TYPES.GOLEM, count: 2, delay: 1500 },
        ],
    },
    // Wave 4: Golem heavy
    {
        enemies: [
            { type: ENEMY_TYPES.GOLEM, count: 4, delay: 1200 },
            { type: ENEMY_TYPES.SLIME, count: 5, delay: 800 },
        ],
    },
    // Wave 5: BOSS 1 — Titán de Sillar + escolta
    {
        isBossWave: true,
        enemies: [
            { type: ENEMY_TYPES.SLIME, count: 4, delay: 800 },
            { type: ENEMY_TYPES.GOLEM, count: 2, delay: 1400 },
            { type: ENEMY_TYPES.BOSS_TITAN, count: 1, delay: 2500 },
        ],
    },
    // Wave 6: Introduce specters (fast!)
    {
        enemies: [
            { type: ENEMY_TYPES.SPECTER, count: 8, delay: 600 },
            { type: ENEMY_TYPES.SLIME, count: 6, delay: 800 },
        ],
    },
    // Wave 7: Mixed specters + golems
    {
        enemies: [
            { type: ENEMY_TYPES.SPECTER, count: 8, delay: 500 },
            { type: ENEMY_TYPES.GOLEM, count: 4, delay: 1200 },
            { type: ENEMY_TYPES.SLIME, count: 6, delay: 600 },
        ],
    },
    // Wave 8: Introduce Dragons
    {
        enemies: [
            { type: ENEMY_TYPES.SLIME, count: 8, delay: 400 },
            { type: ENEMY_TYPES.GOLEM, count: 4, delay: 1000 },
            { type: ENEMY_TYPES.DRAGON, count: 2, delay: 2200 },
        ],
    },
    // Wave 9: Heavy air/fire assault
    {
        enemies: [
            { type: ENEMY_TYPES.SPECTER, count: 10, delay: 450 },
            { type: ENEMY_TYPES.DRAGON, count: 3, delay: 1800 },
        ],
    },
    // Wave 10: BOSS 2 — Ascua Primordial
    {
        isBossWave: true,
        enemies: [
            { type: ENEMY_TYPES.GOLEM, count: 4, delay: 1000 },
            { type: ENEMY_TYPES.DRAGON, count: 2, delay: 1800 },
            { type: ENEMY_TYPES.BOSS_DRAGON, count: 1, delay: 3000 },
        ],
    },
    // Wave 11: Fast swarms
    {
        enemies: [
            { type: ENEMY_TYPES.SPECTER, count: 14, delay: 400 },
            { type: ENEMY_TYPES.GOLEM, count: 4, delay: 1200 },
        ],
    },
    // Wave 12: Dragon flights
    {
        enemies: [
            { type: ENEMY_TYPES.DRAGON, count: 4, delay: 1600 },
            { type: ENEMY_TYPES.SPECTER, count: 8, delay: 500 },
            { type: ENEMY_TYPES.SLIME, count: 8, delay: 400 },
        ],
    },
    // Wave 13: Armored march
    {
        enemies: [
            { type: ENEMY_TYPES.GOLEM, count: 8, delay: 900 },
            { type: ENEMY_TYPES.DRAGON, count: 3, delay: 1600 },
            { type: ENEMY_TYPES.SPECTER, count: 6, delay: 500 },
        ],
    },
    // Wave 14: Veladores rush
    {
        enemies: [
            { type: ENEMY_TYPES.SPECTER, count: 16, delay: 350 },
            { type: ENEMY_TYPES.DRAGON, count: 4, delay: 1400 },
        ],
    },
    // Wave 15: BOSS 3 — Rey Velador
    {
        isBossWave: true,
        enemies: [
            { type: ENEMY_TYPES.SPECTER, count: 8, delay: 450 },
            { type: ENEMY_TYPES.GOLEM, count: 4, delay: 1000 },
            { type: ENEMY_TYPES.BOSS_SPECTER, count: 1, delay: 2800 },
        ],
    },
    // Wave 16: Fiery horde
    {
        enemies: [
            { type: ENEMY_TYPES.DRAGON, count: 6, delay: 1300 },
            { type: ENEMY_TYPES.GOLEM, count: 6, delay: 900 },
            { type: ENEMY_TYPES.SLIME, count: 12, delay: 300 },
        ],
    },
    // Wave 17: Storm of shades
    {
        enemies: [
            { type: ENEMY_TYPES.SPECTER, count: 18, delay: 320 },
            { type: ENEMY_TYPES.DRAGON, count: 5, delay: 1200 },
        ],
    },
    // Wave 18: Colossal vanguard
    {
        enemies: [
            { type: ENEMY_TYPES.GOLEM, count: 10, delay: 800 },
            { type: ENEMY_TYPES.DRAGON, count: 6, delay: 1200 },
        ],
    },
    // Wave 19: The gathering tempest
    {
        enemies: [
            { type: ENEMY_TYPES.SPECTER, count: 14, delay: 350 },
            { type: ENEMY_TYPES.DRAGON, count: 8, delay: 1100 },
            { type: ENEMY_TYPES.GOLEM, count: 6, delay: 800 },
        ],
    },
    // Wave 20: FINAL CLIMAX — Trío de Jefes + Horda Completa
    {
        isBossWave: true,
        enemies: [
            { type: ENEMY_TYPES.GOLEM, count: 4, delay: 800 },
            { type: ENEMY_TYPES.BOSS_TITAN, count: 1, delay: 2000 },
            { type: ENEMY_TYPES.SPECTER, count: 6, delay: 500 },
            { type: ENEMY_TYPES.BOSS_SPECTER, count: 1, delay: 2500 },
            { type: ENEMY_TYPES.DRAGON, count: 4, delay: 1000 },
            { type: ENEMY_TYPES.BOSS_DRAGON, count: 1, delay: 3000 },
        ],
    },
];

const T = ENEMY_TYPES;
const g = (type, count, delay) => ({ type, count, delay });

// Map 2 — Plaza del Mercado: compact siege groups, and the two enemies with an
// errand — hunters and saboteurs — from the second and third waves on. The
// answer is to body-block them with Vesper and the Centinelas Arcanos.
export const WAVES_MERCADO = [
    { enemies: [g(T.SLIME, 6, 700)] },
    { enemies: [g(T.SLIME, 6, 500), g(T.SPECTER, 3, 500)] },
    { enemies: [g(T.GOLEM, 2, 900), g(T.SLIME, 6, 400)] },
    { enemies: [g(T.SPECTER, 6, 400), g(T.GOLEM, 2, 800)] },
    { isBossWave: true, enemies: [g(T.SPECTER, 6, 400), g(T.GOLEM, 2, 800), g(T.BOSS_SPECTER, 1, 2500)] },
    { enemies: [g(T.GOLEM, 4, 700), g(T.SLIME, 8, 300)] },
    { enemies: [g(T.SPECTER, 10, 350), g(T.GOLEM, 3, 800)] },
    { enemies: [g(T.SLIME, 10, 300), g(T.GOLEM, 4, 700), g(T.DRAGON, 1, 2000)] },
    { enemies: [g(T.SPECTER, 12, 300), g(T.GOLEM, 5, 700), g(T.SLIME, 6, 300)] },
    { isBossWave: true, enemies: [g(T.GOLEM, 5, 700), g(T.SPECTER, 6, 350), g(T.BOSS_TITAN, 1, 2500)] },
    { enemies: [g(T.SPECTER, 14, 300), g(T.SLIME, 8, 300), g(T.GOLEM, 3, 700)] },
    { enemies: [g(T.GOLEM, 8, 600), g(T.DRAGON, 2, 1600)] },
    { enemies: [g(T.SPECTER, 12, 300), g(T.GOLEM, 6, 600), g(T.DRAGON, 2, 1500)] },
    { enemies: [g(T.SLIME, 14, 250), g(T.SPECTER, 10, 300), g(T.GOLEM, 6, 600)] },
    { isBossWave: true, enemies: [g(T.GOLEM, 6, 600), g(T.DRAGON, 2, 1500), g(T.BOSS_DRAGON, 1, 3000)] },
    { enemies: [g(T.SPECTER, 16, 280), g(T.GOLEM, 6, 600), g(T.DRAGON, 3, 1400)] },
    { enemies: [g(T.GOLEM, 10, 550), g(T.DRAGON, 3, 1400)] },
    { enemies: [g(T.SPECTER, 20, 260), g(T.GOLEM, 4, 600), g(T.DRAGON, 4, 1300)] },
    { enemies: [g(T.GOLEM, 8, 550), g(T.SPECTER, 14, 280), g(T.DRAGON, 4, 1200)] },
    {
        isBossWave: true,
        enemies: [
            g(T.SPECTER, 8, 300), g(T.BOSS_SPECTER, 1, 2000),
            g(T.GOLEM, 6, 500), g(T.BOSS_TITAN, 1, 2500),
            g(T.DRAGON, 3, 1000), g(T.BOSS_DRAGON, 1, 3000),
        ],
    },
];

// Map 3 — Caldera de Magma: dense swarms for splash damage and spike
// barricades, and from the middle of the run, Ascuas that shrug off fire —
// a fire-only defence has to start fusing.
export const WAVES_CALDERA = [
    { enemies: [g(T.SLIME, 8, 600)] },
    { enemies: [g(T.SLIME, 12, 400)] },
    { enemies: [g(T.SLIME, 12, 300), g(T.GOLEM, 1, 1200)] },
    { enemies: [g(T.SLIME, 16, 250), g(T.GOLEM, 2, 900)] },
    { isBossWave: true, enemies: [g(T.SLIME, 12, 300), g(T.GOLEM, 2, 1000), g(T.BOSS_TITAN, 1, 2500)] },
    { enemies: [g(T.SLIME, 18, 220), g(T.SPECTER, 6, 400)] },
    { enemies: [g(T.DRAGON, 1, 1500), g(T.SLIME, 16, 220)] },
    { enemies: [g(T.DRAGON, 2, 1800), g(T.SLIME, 16, 220)] },
    { enemies: [g(T.SPECTER, 14, 300), g(T.SLIME, 14, 220)] },
    { isBossWave: true, enemies: [g(T.DRAGON, 3, 1600), g(T.SLIME, 12, 250), g(T.BOSS_DRAGON, 1, 3000)] },
    { enemies: [g(T.DRAGON, 4, 1400), g(T.GOLEM, 4, 900)] },
    { enemies: [g(T.SLIME, 24, 180), g(T.DRAGON, 2, 1600)] },
    { enemies: [g(T.DRAGON, 5, 1300), g(T.SPECTER, 10, 300)] },
    { enemies: [g(T.SLIME, 26, 170), g(T.GOLEM, 6, 700), g(T.DRAGON, 2, 1500)] },
    { isBossWave: true, enemies: [g(T.DRAGON, 3, 1400), g(T.SLIME, 16, 200), g(T.BOSS_DRAGON, 1, 3000)] },
    { enemies: [g(T.SLIME, 30, 160), g(T.SPECTER, 12, 280), g(T.GOLEM, 8, 650)] },
    { enemies: [g(T.DRAGON, 6, 1200), g(T.GOLEM, 6, 700)] },
    { enemies: [g(T.SLIME, 32, 150), g(T.DRAGON, 4, 1300)] },
    { enemies: [g(T.SPECTER, 16, 260), g(T.SLIME, 24, 160), g(T.DRAGON, 5, 1200)] },
    {
        isBossWave: true,
        enemies: [
            g(T.SLIME, 20, 160), g(T.BOSS_TITAN, 1, 2000),
            g(T.DRAGON, 4, 1000), g(T.BOSS_DRAGON, 1, 2500),
            g(T.SPECTER, 6, 400), g(T.BOSS_SPECTER, 1, 3000),
        ],
    },
];

// Map 4 — Glaciar Quebrado: fast hunters and a steady stream of Sillares
// walking off the road at the temples on the flanks. Crowd control — ice,
// glacier, blizzard, frost barricades — is what buys the time.
export const WAVES_GLACIAR = [
    { enemies: [g(T.SLIME, 6, 900)] },
    { enemies: [g(T.SPECTER, 4, 700), g(T.SLIME, 5, 700)] },
    { enemies: [g(T.GOLEM, 2, 1200), g(T.SPECTER, 5, 600)] },
    { enemies: [g(T.GOLEM, 3, 1000), g(T.SLIME, 8, 500)] },
    { isBossWave: true, enemies: [g(T.SPECTER, 6, 500), g(T.GOLEM, 2, 1000), g(T.BOSS_SPECTER, 1, 2500)] },
    { enemies: [g(T.SPECTER, 10, 450), g(T.GOLEM, 3, 1000)] },
    { enemies: [g(T.SLIME, 12, 350), g(T.GOLEM, 4, 900)] },
    { enemies: [g(T.SPECTER, 12, 400), g(T.GOLEM, 5, 900), g(T.SLIME, 6, 350)] },
    { enemies: [g(T.SPECTER, 10, 380), g(T.SLIME, 10, 350), g(T.DRAGON, 1, 2000)] },
    { isBossWave: true, enemies: [g(T.GOLEM, 6, 800), g(T.SPECTER, 6, 400), g(T.BOSS_TITAN, 1, 2500)] },
    { enemies: [g(T.SPECTER, 16, 330), g(T.GOLEM, 5, 900), g(T.SLIME, 6, 300)] },
    { enemies: [g(T.GOLEM, 8, 750), g(T.SLIME, 10, 300)] },
    { enemies: [g(T.SPECTER, 18, 300), g(T.GOLEM, 4, 700), g(T.DRAGON, 2, 1600)] },
    { enemies: [g(T.GOLEM, 8, 700), g(T.SPECTER, 12, 320)] },
    { isBossWave: true, enemies: [g(T.SPECTER, 10, 350), g(T.GOLEM, 4, 800), g(T.BOSS_SPECTER, 1, 2500)] },
    { enemies: [g(T.SPECTER, 20, 280), g(T.GOLEM, 8, 700), g(T.DRAGON, 2, 1500)] },
    { enemies: [g(T.GOLEM, 10, 650), g(T.DRAGON, 3, 1400), g(T.SLIME, 10, 280)] },
    { enemies: [g(T.SPECTER, 22, 260), g(T.GOLEM, 8, 650), g(T.DRAGON, 2, 1400)] },
    { enemies: [g(T.SPECTER, 18, 260), g(T.GOLEM, 8, 600), g(T.DRAGON, 4, 1200)] },
    {
        isBossWave: true,
        enemies: [
            g(T.SPECTER, 10, 300), g(T.BOSS_SPECTER, 1, 2000),
            g(T.GOLEM, 6, 600), g(T.BOSS_TITAN, 1, 2500),
            g(T.DRAGON, 3, 1000), g(T.BOSS_DRAGON, 1, 3000),
        ],
    },
];

// Map 5 — Cripta Ancestral: elite waves that put three or four resistances on
// the road at once (earth, air, fire), so no single element answers a wave.
// The profile also hardens everything (hpMult) and the bosses most of all.
export const WAVES_CRIPTA = [
    { enemies: [g(T.SLIME, 5, 900), g(T.GOLEM, 1, 1300), g(T.SPECTER, 2, 800)] },
    { enemies: [g(T.SLIME, 6, 700), g(T.SPECTER, 3, 600), g(T.GOLEM, 1, 1200)] },
    { enemies: [g(T.GOLEM, 2, 1000), g(T.SPECTER, 4, 500), g(T.SLIME, 4, 600)] },
    { enemies: [g(T.GOLEM, 3, 900), g(T.SPECTER, 4, 500), g(T.DRAGON, 1, 2000)] },
    { isBossWave: true, enemies: [g(T.GOLEM, 2, 900), g(T.SPECTER, 4, 500), g(T.BOSS_TITAN, 1, 2500)] },
    { enemies: [g(T.SPECTER, 8, 450), g(T.GOLEM, 3, 900), g(T.DRAGON, 1, 1800)] },
    { enemies: [g(T.GOLEM, 4, 850), g(T.SPECTER, 6, 450), g(T.DRAGON, 2, 1700), g(T.SLIME, 6, 400)] },
    { enemies: [g(T.DRAGON, 2, 1600), g(T.SPECTER, 8, 420), g(T.GOLEM, 4, 850)] },
    { enemies: [g(T.GOLEM, 5, 800), g(T.SPECTER, 10, 400), g(T.DRAGON, 2, 1600)] },
    { isBossWave: true, enemies: [g(T.DRAGON, 2, 1600), g(T.SPECTER, 6, 400), g(T.GOLEM, 3, 850), g(T.BOSS_DRAGON, 1, 3000)] },
    { enemies: [g(T.GOLEM, 6, 750), g(T.SPECTER, 10, 380), g(T.DRAGON, 3, 1500)] },
    { enemies: [g(T.DRAGON, 4, 1400), g(T.GOLEM, 6, 750), g(T.SLIME, 10, 300)] },
    { enemies: [g(T.SPECTER, 14, 350), g(T.GOLEM, 6, 700), g(T.DRAGON, 3, 1400)] },
    { enemies: [g(T.GOLEM, 8, 700), g(T.DRAGON, 4, 1300), g(T.SPECTER, 10, 350)] },
    { isBossWave: true, enemies: [g(T.SPECTER, 8, 380), g(T.GOLEM, 4, 750), g(T.DRAGON, 2, 1400), g(T.BOSS_SPECTER, 1, 2800)] },
    { enemies: [g(T.GOLEM, 8, 650), g(T.SPECTER, 14, 320), g(T.DRAGON, 4, 1300)] },
    { enemies: [g(T.DRAGON, 6, 1200), g(T.SPECTER, 12, 320), g(T.GOLEM, 6, 650)] },
    { enemies: [g(T.GOLEM, 10, 600), g(T.DRAGON, 5, 1200), g(T.SPECTER, 14, 300)] },
    { enemies: [g(T.SPECTER, 16, 300), g(T.GOLEM, 10, 600), g(T.DRAGON, 6, 1100)] },
    {
        isBossWave: true,
        enemies: [
            g(T.GOLEM, 6, 600), g(T.BOSS_TITAN, 1, 2000),
            g(T.SPECTER, 8, 400), g(T.BOSS_SPECTER, 1, 2500),
            g(T.DRAGON, 4, 1000), g(T.BOSS_DRAGON, 1, 3000),
        ],
    },
];

/**
 * A map's whole wave plan: the base list plus what endless mode is made of.
 *  hpMult      every enemy's health (and, through Enemy, a little speed).
 *  bossHpMult  on top of hpMult, for bosses only.
 *  endless.weights   how likely each enemy is to be in a generated wave.
 *  endless.size      scales every generated group's head count.
 *  endless.minTypes  fewest enemy kinds in a generated wave.
 *  endless.bosses    the boss pool for every fifth endless wave.
 */
export const WAVE_PROFILES = {
    ceniza: {
        waves: WAVE_DATA, hpMult: 1, bossHpMult: 1,
        endless: {
            weights: { slime: 1, golem: 1, specter: 1, dragon: 1 }, size: 1, minTypes: 2,
            bosses: [T.BOSS_TITAN, T.BOSS_DRAGON, T.BOSS_SPECTER],
        },
    },
    mercado: {
        waves: WAVES_MERCADO, hpMult: 1, bossHpMult: 1,
        endless: {
            weights: { slime: 2, golem: 3, specter: 3, dragon: 1 }, size: 1, minTypes: 2,
            bosses: [T.BOSS_SPECTER, T.BOSS_TITAN],
        },
    },
    caldera: {
        waves: WAVES_CALDERA, hpMult: 1, bossHpMult: 1,
        endless: {
            weights: { slime: 4, golem: 1, specter: 2, dragon: 2 }, size: 1.4, minTypes: 2,
            bosses: [T.BOSS_DRAGON, T.BOSS_TITAN],
        },
    },
    glaciar: {
        waves: WAVES_GLACIAR, hpMult: 1, bossHpMult: 1,
        endless: {
            weights: { slime: 2, golem: 3, specter: 4, dragon: 1 }, size: 1, minTypes: 2,
            bosses: [T.BOSS_SPECTER, T.BOSS_TITAN],
        },
    },
    cripta: {
        waves: WAVES_CRIPTA, hpMult: 1.15, bossHpMult: 1.4,
        endless: {
            weights: { slime: 1, golem: 1, specter: 1, dragon: 1 }, size: 1, minTypes: 3,
            bosses: [T.BOSS_TITAN, T.BOSS_DRAGON, T.BOSS_SPECTER],
        },
    },
};

export const DEFAULT_WAVE_PROFILE = 'ceniza';

/**
 * The back half of every map hits harder: from wave 10 on, every enemy has
 * this much more health, on top of the map's own hpMult (and, past wave 20,
 * on top of endless scaling — so the curve does not dip when endless starts).
 */
export const LATE_WAVE_HP = { from: 10, mult: 1.25 };

/**
 * Gold is not a kill bounty any more: every wave pays a fixed purse the moment
 * its last enemy is gone — killed or leaked alike — so a nest of towers at the
 * gate farms nothing. The purse is what the wave is made of: each enemy's
 * `gold` (EnemyData) is its share, the ones it splits into on death included,
 * plus a flat `base`, rounded to `roundTo`.
 */
export const WAVE_REWARD = { base: 10, roundTo: 5 };

function enemyWorth(type) {
    const d = ENEMY_DATA[type];
    if (!d) return 0;
    return (d.gold ?? 4) + (d.spawns || []).reduce((n, s) => n + s.count * enemyWorth(s.type), 0);
}

/** The purse for a wave of this composition ([{ type, count }]). */
export function waveReward(composition) {
    const worth = (composition || []).reduce((n, g) => n + g.count * enemyWorth(g.type), 0);
    return Math.round((WAVE_REWARD.base + worth) / WAVE_REWARD.roundTo) * WAVE_REWARD.roundTo;
}

/**
 * Between waves: `restMs` to build, then the next wave comes on its own.
 * Calling it before the clock runs out pays for the time saved
 * (EconomySystem.earlyCallBonus).
 */
export const WAVE_REST = { restMs: 12000 };

export function getWaveProfile(name) {
    return WAVE_PROFILES[name] || WAVE_PROFILES[DEFAULT_WAVE_PROFILE];
}
