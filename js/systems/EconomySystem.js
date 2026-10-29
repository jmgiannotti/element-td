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

export class EconomySystem {
    constructor(scene) {
        this.scene = scene;
        // Starting purse and lives are per level (LevelData).
        this.gold = scene.levelData.initialGold;
        this.mana = 0;
        this.lives = scene.levelData.initialLives;

        // Gold is now a kill bounty. It used to come from motes, but motes are
        // life force and only temples may drink them — without a bounty you
        // could not afford the first temple.
        scene.events.on('enemy-died', (enemy) => {
            this.addGold(enemy.data.gold ?? 4);
            this._spawnMotes(enemy);
        });
        scene.events.on('enemy-reached-end', (enemy) => this._loseLife(enemy?.data?.leak ?? 1));
        scene.events.on('mana-collected', (value) => this.addMana(value));
    }

    // ── Gold ─────────────────────────────────────
    addGold(amount) {
        this.gold += amount;
        this.scene.events.emit('gold-changed', this.gold);
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
