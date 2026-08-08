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
        if (this.waveActive || this.currentWave >= this.totalWaves) return;

        this.waveActive = true;
        const waveData = WAVE_DATA[this.currentWave];

        // Flatten enemy groups into a sequential spawn queue
        this.spawnQueue = [];
        for (const group of waveData.enemies) {
            for (let i = 0; i < group.count; i++) {
                this.spawnQueue.push({
                    type: group.type,
                    delay: group.delay,
                });
            }
        }

        this.spawnTimer = 200; // short initial delay
        this.currentWave++;
        this._checkingComplete = false;
        this.scene.events.emit('wave-started', this.currentWave);
    }

    update(_time, delta) {
        if (!this.waveActive) return;

        // Spawn enemies from queue
        if (this.spawnQueue.length > 0) {
            this.spawnTimer -= delta;
            if (this.spawnTimer <= 0) {
                const spawn = this.spawnQueue.shift();
                const enemy = new Enemy(this.scene, spawn.type);
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

            if (this.currentWave >= this.totalWaves) {
                this.scene.events.emit('all-waves-complete');
            }
        }
    }

    get isLastWave() {
        return this.currentWave >= this.totalWaves;
    }

    /**
     * What the next wave is made of, so the player can pick their elements
     * before it arrives rather than after. `currentWave` is bumped the moment a
     * wave starts, so this index is always the one that has not run yet.
     */
    get nextComposition() {
        const wave = WAVE_DATA[this.currentWave];
        if (!wave) return null;
        return wave.enemies.map(g => ({ type: g.type, count: g.count }));
    }

    get nextWaveNumber() {
        return this.currentWave + 1;
    }
}
