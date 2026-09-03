import { ENEMY_TYPES } from './EnemyData.js';

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
