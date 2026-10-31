import * as Phaser from 'phaser';
import { ManaMote } from '../entities/ManaMote.js';

export const BARRICADE_COST = 15;

// What one mote is worth, rolled per mote. Enemies drop as many motes as
// ever — a field full of light to chase is the point — but each one used to
// be 10–15, and between combos and temple refining that maxed a temple in a
// couple of late waves. At 6–9 the board looks just as rich and the lantern
// fills at about half the pace.
export const MOTE_VALUE = { min: 6, max: 9 };

// What selling hands back, as a fraction of what the building actually cost
// you. Every structure remembers its own price — a fused one carries the sum of
// its two parents — so the refund never has to guess at a list price.
export const SELL_REFUND = 0.6;

export function refundValue(paidCost, bonus = 0) {
    return Math.floor(paidCost * (SELL_REFUND + bonus));
}

// Calling the next wave over a live one (WaveManager) pays for every second
// left in the window that opens when the last enemy is out of the gate,
// rounded up: 18 at most. It is a premium for taking on two waves at once,
// not income — a cleared board pays nothing for calling early.
export const EARLY_CALL = { windowMs: 12000, goldPerSecond: 1.5 };

export function earlyCallBonus(secondsLeft) {
    if (secondsLeft <= 0) return 0;
    return Math.round(Math.ceil(secondsLeft) * EARLY_CALL.goldPerSecond);
}

export class EconomySystem {
    constructor(scene) {
        this.scene = scene;
        // Starting purse and lives are per level (LevelData). TESORO DE
        // GUERRA adds to the purse; a loaded save overwrites it afterwards.
        this.talents = scene.talents ?? {};
        this.gold = scene.levelData.initialGold + (this.talents.startGoldBonus ?? 0);
        this.mana = 0;
        this.lives = scene.levelData.initialLives;
        // What the game has paid out over the whole run, for the end screen:
        // gold earned (refunds for selling or fusing are not earnings) and
        // every point of maná gained.
        this.goldEarned = 0;
        this.manaEarned = 0;

        // A death drops life force and nothing else. Gold comes as a fixed
        // purse at the end of each wave (payWave), so where an enemy dies —
        // at the gate or at the last tile — is worth exactly the same.
        scene.events.on('enemy-died', (enemy) => this._spawnMotes(enemy));
        scene.events.on('enemy-reached-end', (enemy) => this._loseLife(enemy?.data?.leak ?? 1));
        scene.events.on('mana-collected', (value) => this.addMana(value));
    }

    // ── Selling ──────────────────────────────────
    /** Share of the price that selling hands back (RECICLAJE raises it). */
    get sellRate() {
        return SELL_REFUND + (this.talents.sellRefundBonus ?? 0);
    }

    refundFor(paidCost) {
        return refundValue(paidCost, this.talents.sellRefundBonus ?? 0);
    }

    // ── Gold ─────────────────────────────────────
    addGold(amount, earned = true) {
        this.gold += amount;
        if (earned && amount > 0) this.goldEarned += amount;
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
        if (amount > 0) this.manaEarned += amount;
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
                Phaser.Math.Between(MOTE_VALUE.min, MOTE_VALUE.max),
            );
            this.scene.manaMotes.push(mote);
        }
    }
}
