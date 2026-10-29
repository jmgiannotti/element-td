import { getWaveProfile, LATE_WAVE_HP } from '../data/WaveData.js';
import { ENEMY_DATA } from '../data/EnemyData.js';
import { Enemy } from '../entities/Enemy.js';

export class WaveManager {
    constructor(scene) {
        this.scene = scene;
        this.currentWave = 0;
        this.waveActive = false;
        this.spawnQueue = [];
        this.spawnTimer = 0;
        // The map's wave plan (WaveData.WAVE_PROFILES): its base list, its
        // health modifiers and its recipe for endless mode.
        this.profile = getWaveProfile(scene.levelData?.waveProfile);
        this.waves = this.profile.waves;
        this.totalWaves = this.waves.length;
        this._checkingComplete = false;
    }

    startWave() {
        if (this.waveActive) return;

        this.waveActive = true;
        this.spawnQueue = [];

        if (this.currentWave < this.totalWaves) {
            const waveData = this.waves[this.currentWave];
            for (const group of waveData.enemies) {
                for (let i = 0; i < group.count; i++) {
                    this.spawnQueue.push({
                        type: group.type,
                        delay: group.delay,
                    });
                }
            }
        } else {
            // Endless mode: Procedural generation
            const comp = this.nextComposition;
            for (const group of comp) {
                for (let i = 0; i < group.count; i++) {
                    this.spawnQueue.push({
                        type: group.type,
                        delay: group.delay,
                    });
                }
            }
        }

        this.spawnTimer = 200; // short initial delay
        this.currentWave++;
        this._checkingComplete = false;
        
        // Calculate the exponential difficulty multiplier for Endless Mode
        this.currentHpMultiplier = (this.currentWave > this.totalWaves
            ? Math.pow(1.20, this.currentWave - this.totalWaves)
            : 1) * (this.currentWave >= LATE_WAVE_HP.from ? LATE_WAVE_HP.mult : 1);

        this.scene.events.emit('wave-started', this.currentWave);
    }

    update(_time, delta) {
        if (!this.waveActive) return;

        // Spawn enemies from queue
        if (this.spawnQueue.length > 0) {
            this.spawnTimer -= delta;
            if (this.spawnTimer <= 0) {
                const spawn = this.spawnQueue.shift();
                const hpMult = (this.currentHpMultiplier || 1) * this.profile.hpMult
                    * (ENEMY_DATA[spawn.type]?.isBoss ? this.profile.bossHpMult : 1);
                const enemy = Enemy.obtain(this.scene, spawn.type, null, null, hpMult);
                this.scene.enemies.push(enemy);
                if (enemy.isBoss) {
                    this.scene.events.emit('boss-spawned', enemy);
                }
                this.spawnTimer = this.spawnQueue.length > 0
                    ? this.spawnQueue[0].delay
                    : 0;
            }
            return;
        }

        // All spawned — wait until all enemies dead or exited
        if (!this._checkingComplete) {
            this._checkingComplete = true;
        }

        const alive = this.scene.enemies.some(e => e.alive);
        if (!alive) {
            this.waveActive = false;
            this.scene.events.emit('wave-complete', this.currentWave);
            
            // Only emit victory on the exact final base wave
            if (this.currentWave === this.totalWaves) {
                this.scene.events.emit('all-waves-complete');
            }
        }
    }

    get isLastWave() {
        return false; // Endless mode has no last wave
    }

    get isNextWaveBoss() {
        if (this.currentWave < this.totalWaves) {
            return !!this.waves[this.currentWave]?.isBossWave;
        }
        return (this.currentWave + 1) % 5 === 0;
    }

    /**
     * What the next wave is made of, so the player can pick their elements
     * before it arrives rather than after. `currentWave` is bumped the moment a
     * wave starts, so this index is always the one that has not run yet.
     */
    get nextComposition() {
        if (this.currentWave < this.totalWaves) {
            const wave = this.waves[this.currentWave];
            return wave.enemies.map(g => ({ type: g.type, count: g.count, delay: g.delay }));
        }

        // Procedural composition for endless mode
        if (!this._cachedProceduralComposition || this._cachedWaveIndex !== this.currentWave) {
            const extraWaves = this.currentWave - this.totalWaves + 1;
            const isBoss = (this.currentWave + 1) % 5 === 0;
            
            // Between the map's minimum and 4 enemy kinds, drawn by the map's
            // weights, so a market wave is still hunters and saboteurs and a
            // caldera wave is still a swarm.
            const { weights, size, minTypes, bosses } = this.profile.endless;
            const numTypes = minTypes + Math.floor(Math.random() * (5 - minTypes));
            const pool = Object.entries(weights).filter(([, w]) => w > 0);
            const selectedTypes = [];
            while (selectedTypes.length < numTypes && pool.length > 0) {
                const total = pool.reduce((sum, [, w]) => sum + w, 0);
                let r = Math.random() * total;
                const i = pool.findIndex(([, w]) => (r -= w) < 0);
                selectedTypes.push(pool.splice(i < 0 ? pool.length - 1 : i, 1)[0][0]);
            }

            // With three or four kinds out of four, nearly every kind makes the
            // cut, so the weights also set how many of each come: a caldera
            // wave is mostly slimes even when a golem or two tag along.
            const meanWeight = Object.values(weights).reduce((a, b) => a + b, 0) / Object.keys(weights).length;

            const comp = selectedTypes.map(type => {
                const share = Math.min(2, Math.max(0.5, weights[type] / meanWeight));
                // Exponential amount scaling (+10% per wave)
                let baseCount = type === 'slime' ? 8 : (type === 'dragon' ? 1 : 4);
                let count = Math.max(1, Math.round(baseCount * size * share * Math.pow(1.10, extraWaves)));
                // Base delay decreases slightly to keep intensity high
                let baseDelay = type === 'slime' ? 400 : (type === 'dragon' ? 2000 : 800);
                let delay = Math.max(100, Math.round(baseDelay * Math.pow(0.95, extraWaves)));
                
                return { type, count, delay };
            });

            if (isBoss) {
                const bossType = bosses[Math.floor(Math.random() * bosses.length)];
                comp.push({ type: bossType, count: 1, delay: 2500 });
            }
            
            this._cachedProceduralComposition = comp;
            this._cachedWaveIndex = this.currentWave;
        }

        return this._cachedProceduralComposition;
    }

    get nextWaveNumber() {
        return this.currentWave + 1;
    }
}
