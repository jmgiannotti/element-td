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
    // Wave 5: Introduce specters (fast!)
    {
        enemies: [
            { type: ENEMY_TYPES.SPECTER, count: 6, delay: 600 },
            { type: ENEMY_TYPES.SLIME, count: 4, delay: 1000 },
        ],
    },
    // Wave 6: Mixed specters + golems
    {
        enemies: [
            { type: ENEMY_TYPES.SPECTER, count: 8, delay: 500 },
            { type: ENEMY_TYPES.GOLEM, count: 3, delay: 1400 },
        ],
    },
    // Wave 7: Everything mixed
    {
        enemies: [
            { type: ENEMY_TYPES.GOLEM, count: 4, delay: 1000 },
            { type: ENEMY_TYPES.SPECTER, count: 5, delay: 500 },
            { type: ENEMY_TYPES.SLIME, count: 8, delay: 600 },
        ],
    },
    // Wave 8: Boss wave — Dragons + horde
    {
        enemies: [
            { type: ENEMY_TYPES.SLIME, count: 10, delay: 400 },
            { type: ENEMY_TYPES.GOLEM, count: 4, delay: 1000 },
            { type: ENEMY_TYPES.SPECTER, count: 4, delay: 500 },
            { type: ENEMY_TYPES.DRAGON, count: 2, delay: 2500 },
        ],
    },
];
