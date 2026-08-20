import { WAVE_DATA } from '../data/WaveData.js';
import { Enemy } from '../entities/Enemy.js';

export class WaveManager {
    constructor(scene) {
        this.scene = scene;
        this.currentWave = 0;
        this.waveActive = false;
        this.spawnQueue = [];
        this.spawnTimer = 0;
        this.totalWaves = WAVE_DATA.length;
        this._checkingComplete = false;
    }

    startWave() {
        if (this.waveActive) return;

        this.waveActive = true;
        this.spawnQueue = [];

        if (this.currentWave < this.totalWaves) {
            const waveData = WAVE_DATA[this.currentWave];
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
        this.currentHpMultiplier = this.currentWave > this.totalWaves 
            ? Math.pow(1.20, this.currentWave - this.totalWaves) 
            : 1;

        this.scene.events.emit('wave-started', this.currentWave);
    }

    update(_time, delta) {
        if (!this.waveActive) return;

        // Spawn enemies from queue
        if (this.spawnQueue.length > 0) {
            this.spawnTimer -= delta;
            if (this.spawnTimer <= 0) {
                const spawn = this.spawnQueue.shift();
                const enemy = Enemy.obtain(this.scene, spawn.type, null, null, this.currentHpMultiplier || 1);
                this.scene.enemies.push(enemy);
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

    /**
     * What the next wave is made of, so the player can pick their elements
     * before it arrives rather than after. `currentWave` is bumped the moment a
     * wave starts, so this index is always the one that has not run yet.
     */
    get nextComposition() {
        if (this.currentWave < this.totalWaves) {
            const wave = WAVE_DATA[this.currentWave];
            return wave.enemies.map(g => ({ type: g.type, count: g.count, delay: g.delay }));
        }

        // Procedural composition for endless mode
        if (!this._cachedProceduralComposition || this._cachedWaveIndex !== this.currentWave) {
            const extraWaves = this.currentWave - this.totalWaves + 1;
            
            // Randomize between 2 to 4 types
            const types = ['slime', 'golem', 'specter', 'dragon'];
            const numTypes = 2 + Math.floor(Math.random() * 3);
            const selectedTypes = [...types].sort(() => 0.5 - Math.random()).slice(0, numTypes);
            
            this._cachedProceduralComposition = selectedTypes.map(type => {
                // Exponential amount scaling (+10% per wave)
                let baseCount = type === 'slime' ? 8 : (type === 'dragon' ? 1 : 4);
                let count = Math.round(baseCount * Math.pow(1.10, extraWaves));
                // Base delay decreases slightly to keep intensity high
                let baseDelay = type === 'slime' ? 400 : (type === 'dragon' ? 2000 : 800);
                let delay = Math.max(100, Math.round(baseDelay * Math.pow(0.95, extraWaves)));
                
                return { type, count, delay };
            });
            this._cachedWaveIndex = this.currentWave;
        }

        return this._cachedProceduralComposition;
    }

    get nextWaveNumber() {
        return this.currentWave + 1;
    }
}
