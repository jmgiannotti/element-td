import * as Phaser from 'phaser';
import { BARRICADE_ENCHANTS, ENCHANT, ENCHANT_REACH } from '../data/BarricadeData.js';
import { audio } from './AudioSystem.js';

/**
 * Enchanted barricades: which ones carry spikes or frost, and what that does to
 * whatever walks beside them.
 *
 * Barricades themselves stay what they always were — a grid flag plus decor,
 * priced in GameScene.barricades. This only remembers the enchantment on top,
 * keyed by the same 'c,r', so selling or saving a barricade is unchanged and
 * an enchantment is one extra lookup.
 */
export class BarricadeSystem {
    constructor(scene) {
        this.scene = scene;
        /** 'c,r' → ENCHANT type */
        this.enchants = new Map();
        /** 'c,r' → ms until the next spike tick */
        this._spikeClock = new Map();
        /** 'c,r' → the faint aura marking the frost's reach */
        this._auras = new Map();
        /** 'c,r' → ms until the next idle flourish (snow, a glint) */
        this._idle = new Map();
        /** enemy → ms until it sheds its next frost flake */
        this._chillFx = new WeakMap();
        // Kept short-lived and capped: a long maze of enchanted walls must not
        // turn into a particle system.
        this._live = 0;
    }

    typeAt(col, row) {
        return this.enchants.get(`${col},${row}`) ?? null;
    }

    canAfford(type) {
        const e = BARRICADE_ENCHANTS[type];
        const eco = this.scene.economySystem;
        return e.currency === 'gold' ? eco.gold >= e.cost : eco.mana >= e.cost;
    }

    /**
     * Pay for and apply an enchantment. Returns false — and charges nothing —
     * when the cell is not a bare barricade or the player cannot pay.
     */
    enchant(col, row, type) {
        const key = `${col},${row}`;
        const scene = this.scene;
        const e = BARRICADE_ENCHANTS[type];
        if (!e || !scene.barricades.has(key) || this.enchants.has(key)) return false;

        const eco = scene.economySystem;
        const paid = e.currency === 'gold' ? eco.spendGold(e.cost) : eco.spendMana(e.cost);
        if (!paid) return false;

        // Iron is a building cost like the wall it is nailed to, so it rides
        // the barricade's bill and part of it comes back on a sale. Maná is
        // spent, like a temple rank.
        if (e.currency === 'gold') scene.barricades.set(key, scene.barricades.get(key) + e.cost);

        this._apply(col, row, type);
        audio.play('upgrade');
        this._celebrate(col, row, e.color);
        scene.events.emit('barricade-enchanted', type);
        return true;
    }

    /** The enchantment without the payment — used by enchant() and by loading a save. */
    _apply(col, row, type) {
        const key = `${col},${row}`;
        const scene = this.scene;
        this.enchants.set(key, type);
        scene._setDecor(col, row, BARRICADE_ENCHANTS[type].texture);
        if (type === ENCHANT.SPIKES) this._spikeClock.set(key, 0);
        if (type === ENCHANT.FROST) {
            const pos = scene.gridSystem.gridToWorld(col, row);
            // Only under the cursor; the snow and the flakes on whoever is
            // slowed are what say the wall is working.
            const aura = scene.add.circle(pos.x, pos.y, ENCHANT_REACH, BARRICADE_ENCHANTS.frost.color, 0.05)
                .setStrokeStyle(1, BARRICADE_ENCHANTS.frost.color, 0.3)
                .setDepth(1)
                .setVisible(false);
            const wall = scene.decor?.get(key);
            if (wall) {
                wall.setInteractive();
                wall.on('pointerover', () => aura.setVisible(true));
                wall.on('pointerout', () => aura.setVisible(false));
            }
            // Breathes, so a frost wall looks cold even with nobody near it
            scene.tweens.add({
                targets: aura, scaleX: 1.06, scaleY: 1.06,
                duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            });
            this._auras.set(key, aura);
        }
        this._idle.set(key, Math.random() * 600);
    }

    restore(col, row, type) {
        if (BARRICADE_ENCHANTS[type]) this._apply(col, row, type);
    }

    /** The barricade under it is gone (sold); the enchantment goes with it. */
    remove(col, row) {
        const key = `${col},${row}`;
        this.enchants.delete(key);
        this._spikeClock.delete(key);
        this._idle.delete(key);
        const aura = this._auras.get(key);
        if (aura) aura.destroy();
        this._auras.delete(key);
    }

    update(delta) {
        if (this.enchants.size === 0) return;
        const scene = this.scene;
        const enemies = scene.enemies;
        const spikes = BARRICADE_ENCHANTS.spikes;
        const frost = BARRICADE_ENCHANTS.frost;

        for (const [key, type] of this.enchants) {
            const [col, row] = key.split(',').map(Number);
            const pos = scene.gridSystem.gridToWorld(col, row);

            this._tickIdle(key, type, pos, delta);

            if (type === ENCHANT.FROST) {
                let chilling = false;
                for (const e of enemies) {
                    if (!e.alive) continue;
                    if (Phaser.Math.Distance.Between(pos.x, pos.y, e.x, e.y) <= ENCHANT_REACH) {
                        e.applySlow(frost.slow, frost.lingerMs);
                        this._shedFrost(e, delta);
                        chilling = true;
                    }
                }
                // The aura lights up while it has someone in it — the one cue
                // that says *this* wall is the one doing the slowing.
                const aura = this._auras.get(key);
                if (aura) {
                    const target = chilling ? 0.16 : 0.05;
                    aura.fillAlpha += (target - aura.fillAlpha) * Math.min(1, delta / 120);
                }
                continue;
            }

            // Spikes tick on their own clock, per barricade, so a corridor of
            // them reads as a run of pricks and not one synchronised pulse.
            let clock = (this._spikeClock.get(key) ?? 0) - delta;
            if (clock <= 0) {
                clock += spikes.tickMs;
                let pricked = false;
                for (const e of enemies) {
                    if (!e.alive) continue;
                    if (Phaser.Math.Distance.Between(pos.x, pos.y, e.x, e.y) > ENCHANT_REACH) continue;
                    // Silent like a burn: a number every half second per wall
                    // would bury the ones the towers are producing.
                    e.takeDamage(spikes.damage * (e.hpMultiplier ?? 1), { silent: true });
                    this._spark(e.x, e.y);
                    this._knockback(pos, e);
                    pricked = true;
                }
                // Nobody there: stay primed, so the next one to step in is pricked at once.
                if (!pricked) clock = 0;
            }
            this._spikeClock.set(key, clock);
        }
    }

    // ─── Feedback ───────────────────────────────────────
    /**
     * Something small every second or so, so an enchanted wall never looks
     * like a plain one that happens to be a different colour: snow drifting
     * off the frost, a glint running along the spikes.
     */
    _tickIdle(key, type, pos, delta) {
        let t = (this._idle.get(key) ?? 0) - delta;
        if (t > 0) { this._idle.set(key, t); return; }

        if (type === ENCHANT.FROST) {
            this._idle.set(key, 260 + Math.random() * 220);
            const x = pos.x + (Math.random() * 2 - 1) * 14;
            this._mote(x, pos.y - 10 - Math.random() * 6, 0xEAFFFF, {
                dy: 14 + Math.random() * 8, dx: (Math.random() * 2 - 1) * 4, duration: 900,
            });
        } else {
            this._idle.set(key, 700 + Math.random() * 700);
            // Spike tips, from the sprite: three rows of points on each side
            const side = Math.random() < 0.5 ? -15 : 15;
            const y = pos.y - 16 + [9, 17, 25][Math.floor(Math.random() * 3)];
            this._mote(pos.x + side, y, 0xFFFFFF, { dy: 0, dx: 0, duration: 260, size: 2 });
        }
    }

    /** Flakes falling off an enemy while it is in the frost. */
    _shedFrost(e, delta) {
        const t = (this._chillFx.get(e) ?? 0) - delta;
        if (t > 0) { this._chillFx.set(e, t); return; }
        this._chillFx.set(e, 220);
        this._mote(e.x + (Math.random() * 2 - 1) * 7, e.y - 6, 0xB3F5FF, {
            dy: 12, dx: (Math.random() * 2 - 1) * 3, duration: 520,
        });
    }

    /**
     * The prick shoves the enemy back off the wall: a few pixels away from the
     * barricade and a squash, so the hit reads on the one that took it. The
     * wall itself stays put — it is a wall.
     *
     * The shove is real, not drawn: the enemy has to walk those pixels again,
     * which is a little more time beside the spikes. Small enough to stay
     * inside its own cell of road; the movement code squares it back onto the
     * lane by itself. Bosses barely budge.
     */
    _knockback(pos, e) {
        if (!e.sprite) return;
        const dx = e.x - pos.x;
        const dy = e.y - pos.y;
        const d = Math.hypot(dx, dy) || 1;
        const push = e.isBoss ? 1 : 3;
        e.sprite.x += (dx / d) * push;
        e.sprite.y += (dy / d) * push;

        if (e._knocked) return;
        e._knocked = true;
        const sx = e.sprite.scaleX;
        const sy = e.sprite.scaleY;
        this.scene.tweens.add({
            targets: e.sprite, scaleX: sx * 1.12, scaleY: sy * 0.88,
            duration: 60, yoyo: true, ease: 'Quad.easeOut',
            onComplete: () => {
                // A death tween may own the scale by now; only restore a live one.
                if (e.alive && e.sprite) e.sprite.setScale(sx, sy);
                e._knocked = false;
            },
        });
    }

    _mote(x, y, color, { dx = 0, dy = 0, duration = 600, size = 1 } = {}) {
        if (this._live > 80) return;
        this._live++;
        const m = this.scene.add.rectangle(x, y, size, size, color, 0.95).setDepth(16);
        this.scene.tweens.add({
            targets: m, x: x + dx, y: y + dy, alpha: 0, duration, ease: 'Sine.easeIn',
            onComplete: () => { m.destroy(); this._live--; },
        });
    }

    /** A steel glint where the spike went in. */
    _spark(x, y) {
        const s = this.scene.add.rectangle(x, y + 4, 2, 2, 0xF4FBFF, 1).setDepth(16);
        this.scene.tweens.add({
            targets: s, y: y - 2, alpha: 0, duration: 220, ease: 'Quad.easeOut',
            onComplete: () => s.destroy(),
        });
    }

    _celebrate(col, row, color) {
        const pos = this.scene.gridSystem.gridToWorld(col, row);
        const ring = this.scene.add.circle(pos.x, pos.y, 12, color, 0)
            .setStrokeStyle(2, color, 0.9).setDepth(27);
        this.scene.tweens.add({
            targets: ring, scaleX: 3, scaleY: 3, alpha: 0, duration: 450, ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
        });
    }

    /** Pinned-selection stand-in for a barricade, so the stat card can sit on one. */
    handle(col, row) {
        const scene = this.scene;
        const key = `${col},${row}`;
        const pos = scene.gridSystem.gridToWorld(col, row);
        return {
            kind: 'barricade',
            col, row,
            x: pos.x, y: pos.y,
            get alive() { return scene.barricades.has(key); },
            // Pinning one shows how far its enchantment reaches.
            setSelected(on) {
                const g = scene.sharedRangeGfx;
                if (!g) return;
                if (on) {
                    g.setPosition(pos.x, pos.y).setRadius(ENCHANT_REACH)
                        .setFillStyle(0xFFD54F, 0.09).setStrokeStyle(1, 0xFFD54F, 0.55)
                        .setVisible(true);
                } else {
                    g.setVisible(false);
                }
            },
        };
    }

    destroy() {
        for (const a of this._auras.values()) a.destroy();
        this._auras.clear();
        this.enchants.clear();
    }
}
