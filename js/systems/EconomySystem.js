import * as Phaser from 'phaser';
import { ManaMote } from '../entities/ManaMote.js';

export const BARRICADE_COST = 15;

// What selling hands back, as a fraction of what the building actually cost
// you. Every structure remembers its own price — a fused one carries the sum of
// its two parents — so the refund never has to guess at a list price.
export const SELL_REFUND = 0.6;

export function refundValue(paidCost) {
    return Math.floor(paidCost * SELL_REFUND);
}

// Calling the next wave before the rest runs out pays for every second left
// on the clock (rounded up). The rate climbs every `stepEvery` waves, so the
// bonus keeps pace with the purses without making the first waves a gold rush.
export const EARLY_CALL = { goldPerSecond: 3, stepEvery: 5 };

export function earlyCallBonus(secondsLeft, waveNumber) {
    if (secondsLeft <= 0) return 0;
    const rate = EARLY_CALL.goldPerSecond + Math.floor(Math.max(0, waveNumber - 1) / EARLY_CALL.stepEvery);
    return Math.ceil(secondsLeft) * rate;
}

export class EconomySystem {
    constructor(scene) {
        this.scene = scene;
        // Starting purse and lives are per level (LevelData).
        this.gold = scene.levelData.initialGold;
        this.mana = 0;
        this.lives = scene.levelData.initialLives;

        // A death drops life force and nothing else. Gold comes as a fixed
        // purse at the end of each wave (payWave), so where an enemy dies —
        // at the gate or at the last tile — is worth exactly the same.
        scene.events.on('enemy-died', (enemy) => this._spawnMotes(enemy));
        scene.events.on('enemy-reached-end', (enemy) => this._loseLife(enemy?.data?.leak ?? 1));
        scene.events.on('mana-collected', (value) => this.addMana(value));
    }

    // ── Gold ─────────────────────────────────────
    addGold(amount) {
        this.gold += amount;
        this.scene.events.emit('gold-changed', this.gold);
    }

    /** The wave's fixed purse (WaveData.waveReward), paid when it ends. */
    payWave(amount) {
        if (amount > 0) this.addGold(amount);
    }

    spendGold(amount) {
        if (this.gold >= amount) {
            this.gold -= amount;
            this.scene.events.emit('gold-changed', this.gold);
            return true;
        }
        return false;
    }

    // ── Mana (fuerza vital) ──────────────────────
    addMana(amount) {
        this.mana += amount;
        this.scene.events.emit('mana-changed', this.mana);
    }

    spendMana(amount) {
        if (this.mana >= amount) {
            this.mana -= amount;
            this.scene.events.emit('mana-changed', this.mana);
            return true;
        }
        return false;
    }

    // ── Lives ────────────────────────────────────
    _loseLife(amount = 1) {
        this.lives = Math.max(0, this.lives - amount);
        this.scene.events.emit('lives-changed', this.lives);
        if (this.lives <= 0) {
            this.scene.events.emit('game-over');
        }
    }

    // ── Mana Motes ───────────────────────────────
    _spawnMotes(enemy) {
        const count = enemy.data.manaDrops;
        for (let i = 0; i < count; i++) {
            const mote = new ManaMote(
                this.scene,
                enemy.x + (Math.random() - 0.5) * 16,
                enemy.y + (Math.random() - 0.5) * 16,
                Phaser.Math.Between(10, 15),
            );
            this.scene.manaMotes.push(mote);
        }
    }
}
