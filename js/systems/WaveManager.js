import { getWaveProfile, waveHpMult, waveReward, WAVE_REST } from '../data/WaveData.js';
import { ENEMY_DATA } from '../data/EnemyData.js';
import { Enemy } from '../entities/Enemy.js';
import { earlyCallBonus, EARLY_CALL } from './EconomySystem.js';

/**
 * A wave's life, and what the button can do at each point:
 *
 *   spawning   enemies still coming out of the gate: nothing to call.
 *   last out   the gate is empty but the wave is on the board. For
 *              EARLY_CALL.windowMs the next wave can be called on top of it,
 *              for a bonus that drains with the window. Clearing the board
 *              first ends the offer: the bonus is for taking on two waves.
 *   rest       the board is clear: WAVE_REST.restMs to build, then the next
 *              wave comes on its own. It can still be called sooner, unpaid.
 *
 * A wave's purse is paid when its board clears or when the next wave is
 * called over it, whichever comes first; the amount is fixed either way.
 */
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
        // The rest after a cleared board: when it runs out the next wave
        // starts on its own. Zero before the first wave and after a load,
        // which wait for the player.
        this.restTimer = 0;
        this.restTotal = 0;
        // The window to call the next wave over this one, open from the
        // moment its last enemy is out of the gate.
        this.earlyTimer = 0;
        this.earlyTotal = 0;
        // What the running wave pays, and whether it has been paid yet.
        this.currentReward = 0;
        this._paid = true;
    }

    get resting() { return !this.waveActive && this.restTimer > 0; }

    get restSecondsLeft() { return Math.ceil(this.restTimer / 1000); }

    get earlySecondsLeft() { return Math.ceil(this.earlyTimer / 1000); }

    /**
     * The next wave can be called over the running one: the gate is empty,
     * the window is open, and this is not the last base wave (the victory
     * screen has to get its turn).
     */
    get canCallEarly() {
        return this.waveActive && this.spawnQueue.length === 0 && this.earlyTimer > 0
            && this.currentWave !== this.totalWaves;
    }

    /** Whether the button or the gate can start a wave right now. */
    get canCall() { return !this.waveActive || this.canCallEarly; }

    /** What calling the next wave right now would pay. */
    get earlyBonus() {
        return this.canCallEarly ? earlyCallBonus(this.earlyTimer / 1000) : 0;
    }

    /** What the next wave pays when it ends. */
    get nextReward() { return waveReward(this.nextComposition); }

    /**
     * The player asking for the next wave: the button, the gate, the endless
     * prompt. Over a live wave it pays that wave's purse and the bonus first.
     */
    callNextWave() {
        if (!this.canCall) return;
        if (this.waveActive) {
            const bonus = this.earlyBonus;
            this._payWave();
            if (bonus > 0) {
                this.scene.economySystem.addGold(bonus);
                this.scene.events.emit('wave-called-early', bonus);
            }
        }
        this.startWave();
    }

    startWave() {
        // Over a live wave only once its gate is empty (callNextWave checks
        // the rest); never while it is still spawning.
        if (this.waveActive && this.spawnQueue.length > 0) return;

        this.restTimer = 0;
        this.earlyTimer = 0;
        this.currentReward = this.nextReward;
        this._paid = false;
        this.waveActive = true;
        this.spawnQueue = [];

        const groups = this.currentWave < this.totalWaves
            ? this.waves[this.currentWave].enemies
            : this.nextComposition; // endless: procedural
        for (const group of groups) {
            for (let i = 0; i < group.count; i++) {
                this.spawnQueue.push({ type: group.type, delay: group.delay });
            }
        }

        this.spawnTimer = 200; // short initial delay
        this.currentWave++;

        this.currentHpMultiplier = this.waveHpMultiplier(this.currentWave);

        this.scene.events.emit('wave-started', this.currentWave);
    }

    /**
     * Health multiplier of wave `n`: endless scaling (+20% a wave past the
     * base list) on top of the base list's own steps (WaveData.waveHpMult).
     */
    waveHpMultiplier(n) {
        return (n > this.totalWaves ? Math.pow(1.20, n - this.totalWaves) : 1) * waveHpMult(n);
    }

    /** What one enemy of `type` multiplies its health by in wave `n`, map modifiers included. */
    enemyHpMultiplier(type, n) {
        return this.waveHpMultiplier(n) * this.profile.hpMult
            * (ENEMY_DATA[type]?.isBoss ? this.profile.bossHpMult : 1);
    }

    /** The running wave's purse, once. */
    _payWave() {
        if (this._paid) return;
        this._paid = true;
        this.scene.economySystem.payWave(this.currentReward);
        this.scene.events.emit('wave-paid', this.currentWave, this.currentReward);
    }

    update(_time, delta) {
        if (!this.waveActive) {
            if (this.restTimer > 0) {
                this.restTimer -= delta;
                if (this.restTimer <= 0) this.startWave();
            }
            return;
        }

        // Spawn enemies from queue
        if (this.spawnQueue.length > 0) {
            this.spawnTimer -= delta;
            if (this.spawnTimer <= 0) {
                const spawn = this.spawnQueue.shift();
                const hpMult = this.enemyHpMultiplier(spawn.type, this.currentWave);
                const enemy = Enemy.obtain(this.scene, spawn.type, null, null, hpMult);
                this.scene.enemies.push(enemy);
                if (enemy.isBoss) {
                    this.scene.events.emit('boss-spawned', enemy);
                }
                this.spawnTimer = this.spawnQueue.length > 0
                    ? this.spawnQueue[0].delay
                    : 0;
                // The last one is out: the window to call the next wave opens.
                if (this.spawnQueue.length === 0) {
                    this.earlyTimer = this.earlyTotal = EARLY_CALL.windowMs;
                }
            }
            return;
        }

        if (this.earlyTimer > 0) this.earlyTimer = Math.max(0, this.earlyTimer - delta);

        // All spawned: wait until all enemies dead or exited
        const alive = this.scene.enemies.some(e => e.alive);
        if (!alive) {
            this.waveActive = false;
            // A cleared board closes the early-call offer.
            this.earlyTimer = 0;
            // Paid before the event goes out, so the save it triggers has it.
            this._payWave();
            // Then the rest, except after the last base wave, where the
            // victory screen decides whether there is a next one.
            if (this.currentWave !== this.totalWaves) {
                this.restTimer = this.restTotal = WAVE_REST.restMs;
            }
            this.scene.events.emit('wave-complete', this.currentWave, this.currentReward);

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
