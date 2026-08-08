import * as Phaser from 'phaser';
import { ENEMY_DATA } from '../data/EnemyData.js';
import { EFFECT } from '../data/Elements.js';
import { WAYPOINTS, TILE_SIZE, TILE } from '../systems/GridSystem.js';
import { audio } from '../systems/AudioSystem.js';

export class Enemy {
    constructor(scene, type, spawnX = null, spawnY = null) {
        this.scene = scene;
        this.type = type;
        this.data = { ...ENEMY_DATA[type] };
        this.hp = this.data.hp;
        this.maxHp = this.data.hp;
        this.speed = this.data.speed;
        this.alive = true;
        this.reachedEnd = false;

        // Status effects
        this.slowAmount = 0;
        this.slowTimer = 0;
        this.frozen = false;
        this.freezeTimer = 0;
        this.burning = false;
        this.burnDps = 0;
        this.burnTimer = 0;
        this.burnTick = 0;

        // Path and Spawning
        const exitWp = WAYPOINTS[WAYPOINTS.length - 1];
        if (spawnX !== null && spawnY !== null) {
            this.sprite = scene.add.sprite(spawnX, spawnY, `enemy_${type}`);

            // The scatter offset a dying parent hands down is cosmetic and can
            // land on the grass beside a bend. Path from the nearest road cell
            // instead, and start at index 0 so the child walks to that cell's
            // centre before travelling — heading straight for the *next* cell
            // is what sent it diagonally across the corner.
            const raw = scene.gridSystem.worldToGrid(spawnX, spawnY);
            const cell = scene.gridSystem.nearestWalkable(raw.col, raw.row);
            this.path = scene.gridSystem.findPath(cell.col, cell.row, exitWp.col, exitWp.row);
            this.pathIndex = 0;
        } else {
            const startWp = WAYPOINTS[0];
            this.path = scene.gridSystem.findPath(startWp.col, startWp.row, exitWp.col, exitWp.row);
            this.pathIndex = 1;
            const sx = this.path ? this.path[0].col * TILE_SIZE + TILE_SIZE / 2 : 0;
            const sy = this.path ? this.path[0].row * TILE_SIZE + TILE_SIZE / 2 : 0;
            this.sprite = scene.add.sprite(sx, sy, `enemy_${type}`);
        }
        
        if (!this.path) {
            this.alive = false; // Failsafe if path is completely blocked
        } else {
            this.sprite.setScale(2);
            this.sprite.setDepth(10);

            // HP bar
            this.hpBg = scene.add.rectangle(this.sprite.x, this.sprite.y - 18, 26, 4, 0x1a1a1a, 0.8);
            this.hpBg.setStrokeStyle(1, 0x333333).setDepth(11);
            this.hpFill = scene.add.rectangle(this.sprite.x, this.sprite.y - 18, 24, 2, 0x4CAF50).setDepth(12);

            // Listen for path changes
            this.pathChangeHandler = () => this.recalculatePath();
            this.scene.events.on('path-changed', this.pathChangeHandler);
        }
    }

    get x() { return this.sprite ? this.sprite.x : 0; }
    get y() { return this.sprite ? this.sprite.y : 0; }
    get pathProgress() { return this.pathIndex; } // simplified progress

    recalculatePath() {
        if (!this.alive) return;
        const raw = this.scene.gridSystem.worldToGrid(this.x, this.y);
        const cell = this.scene.gridSystem.nearestWalkable(raw.col, raw.row);
        const exitWp = WAYPOINTS[WAYPOINTS.length - 1];
        const newPath = this.scene.gridSystem.findPath(cell.col, cell.row, exitWp.col, exitWp.row);
        if (newPath) {
            this.path = newPath;
            // Index 0 is the enemy's own cell. Re-centring on it first keeps
            // the turn square instead of slicing across it.
            this.pathIndex = 0;
        }
    }

    update(_time, delta) {
        if (!this.alive || !this.path) return;

        // ── Status effects ──────────────────────
        if (this.frozen) {
            this.freezeTimer -= delta;
            if (this.freezeTimer <= 0) {
                this.frozen = false;
                this.sprite.clearTint();
            }
            this._updateHpBar();
            return;
        }

        if (this.slowTimer > 0) {
            this.slowTimer -= delta;
            if (this.slowTimer <= 0) this.slowAmount = 0;
        }

        if (this.burning) {
            this.burnTimer -= delta;
            this.burnTick += delta;
            if (this.burnTick >= 500) {
                this.takeDamage(this.burnDps, { silent: true });
                this.burnTick -= 500;
            }
            if (this.burnTimer <= 0) this.burning = false;
        }

        // ── Hero combat ─────────────────────────
        const hero = this.scene.hero;
        if (hero && !hero.isDead) {
            const d = Phaser.Math.Distance.Between(this.x, this.y, hero.x, hero.y);
            if (d < 45) {
                this.heroAttackTimer = (this.heroAttackTimer || 0) + delta;
                if (this.heroAttackTimer >= 1000) {
                    hero.takeDamage(this.data.hp * 0.2 + 5);
                    this.heroAttackTimer = 0;
                    
                    const slash = this.scene.add.text(hero.x, hero.y - 10, '💥', { fontSize: '8px' }).setOrigin(0.5).setDepth(30);
                    this.scene.tweens.add({
                        targets: slash, scale: 2, alpha: 0, duration: 300, onComplete: () => slash.destroy()
                    });
                }
                if (d < 25) {
                    this._updateHpBar();
                    return; // Stop moving to fight hero
                }
            }
        }

        // ── Movement & Block breaking ───────────
        if (this.pathIndex >= this.path.length) {
            this._reachExit();
            return;
        }

        const nextCell = this.path[this.pathIndex];
        const tileType = this.scene.gridSystem.grid[nextCell.row]?.[nextCell.col];

        if (tileType === TILE.BREAKABLE) {
            // Attack the breakable block
            this.blockAttackTimer = (this.blockAttackTimer || 0) + delta;
            if (this.blockAttackTimer >= 1000) {
                // High damage to blocks based on enemy strength
                this.scene.damageBlock(nextCell.col, nextCell.row, this.maxHp * 0.5 + 10);
                this.blockAttackTimer = 0;
            }
            
            // Jiggle sprite slightly
            this.sprite.x += (Math.random() - 0.5) * 2;
            this.sprite.y += (Math.random() - 0.5) * 2;
            this._updateHpBar();
            return; // Wait until block is broken
        }

        // Normal movement
        const tx = nextCell.col * TILE_SIZE + TILE_SIZE / 2;
        const ty = nextCell.row * TILE_SIZE + TILE_SIZE / 2;
        const dx = tx - this.x;
        const dy = ty - this.y;

        const effectiveSpeed = this.speed * (1 - this.slowAmount);
        const step = effectiveSpeed * (delta / 1000);

        // Movement is resolved one axis at a time, so the distance a frame has
        // to cover is Manhattan, not Euclidean. On a straight lane one of the
        // two legs is zero and the pair agree, so this costs nothing normally.
        const remaining = Math.abs(dx) + Math.abs(dy);

        if (remaining <= step) {
            this.sprite.x = tx;
            this.sprite.y = ty;
            this.pathIndex++;
        } else {
            // Never travel diagonally. The path is 4-connected, so a diagonal
            // component only ever means the enemy is off-lane — scattered
            // there by a dying parent, or re-pathed mid-step. Spending it as
            // one diagonal slide is exactly what reads as cutting the corner;
            // closing the cross-axis first puts it back on the road and keeps
            // the turn square.
            const legs = Math.abs(dx) <= Math.abs(dy)
                ? [['x', dx], ['y', dy]]
                : [['y', dy], ['x', dx]];

            let budget = step;
            for (const [axis, delta_] of legs) {
                if (budget <= 0) break;
                const mag = Math.abs(delta_);
                if (mag < 0.001) continue;
                const move = Math.min(budget, mag);
                if (axis === 'x') this.sprite.x += Math.sign(delta_) * move;
                else this.sprite.y += Math.sign(delta_) * move;
                budget -= move;
            }
        }

        // Keep facing whichever way it last moved horizontally, rather than
        // snapping back to the right on every vertical stretch.
        if (Math.abs(dx) > 0.01) this.sprite.flipX = dx < 0;
        this._updateHpBar();
    }

    _updateHpBar() {
        if (!this.hpBg) return;
        const pct = Math.max(0, this.hp / this.maxHp);
        this.hpBg.x = this.x;
        this.hpBg.y = this.y - 18;
        this.hpFill.width = 24 * pct;
        this.hpFill.x = this.x - (24 * (1 - pct)) / 2;
        this.hpFill.y = this.y - 18;

        if (pct > 0.6) this.hpFill.fillColor = 0x4CAF50;
        else if (pct > 0.3) this.hpFill.fillColor = 0xFFC107;
        else this.hpFill.fillColor = 0xEF5350;
    }

    /**
     * @param {number} amount
     * @param {{silent?: boolean, effect?: string, showNumber?: boolean}} [opts]
     *   `silent` suppresses the sound and the flash — burn ticks land twice a
     *   second and would otherwise strobe. `effect` is the elemental match-up,
     *   which decides the colour and glyph of the floating number.
     */
    takeDamage(amount, opts = {}) {
        if (!this.alive) return;
        const { silent = false, effect = EFFECT.NORMAL, showNumber = !silent } = opts;

        this.hp -= amount;

        if (showNumber && this.scene.floating && this.sprite) {
            this.scene.floating.damage(this.x, this.y - 14, amount, effect);
        }
        // Said once per kind by the UI, the first time it ever happens: the
        // colour and the arrow only mean something if you were told what for.
        if (effect !== EFFECT.NORMAL) this.scene.events.emit('damage-effect', effect);

        if (!silent && this.sprite) {
            audio.play('hit');
            // setTintFill was removed in Phaser 4 — FILL is now a tint mode
            this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
            this.scene.time.delayedCall(60, () => {
                if (!this.alive || !this.sprite) return;
                this.sprite.setTintMode(Phaser.TintModes.MULTIPLY);
                this.sprite.clearTint();
                if (this.frozen) this.sprite.setTint(0x80DEEA);
                if (this.burning) this.sprite.setTint(0xFF7043);
            });
        }

        if (this.hp <= 0) this._die();
    }

    applySlow(amount, duration) {
        this.slowAmount = Math.max(this.slowAmount, amount);
        this.slowTimer = Math.max(this.slowTimer, duration);
    }

    applyFreeze(duration) {
        this.frozen = true;
        this.freezeTimer = duration;
        this.sprite.setTint(0x80DEEA);
    }

    applyBurn(dps, duration) {
        this.burning = true;
        this.burnDps = dps;
        this.burnTimer = duration;
        this.burnTick = 0;
    }

    _die() {
        if (!this.alive) return;
        this.alive = false;
        
        if (this.pathChangeHandler) {
            this.scene.events.off('path-changed', this.pathChangeHandler);
        }

        this.scene.events.emit('enemy-died', this);

        // Spawn nested enemies
        if (this.data.spawns) {
            for (const spawn of this.data.spawns) {
                for (let i = 0; i < spawn.count; i++) {
                    const ox = (Math.random() - 0.5) * 20;
                    const oy = (Math.random() - 0.5) * 20;
                    const child = new Enemy(this.scene, spawn.type, this.x + ox, this.y + oy);
                    this.scene.enemies.push(child);
                }
            }
        }

        this.scene.tweens.add({
            targets: [this.sprite, this.hpFill, this.hpBg],
            alpha: 0,
            scaleX: 0,
            scaleY: 0,
            duration: 200,
            onComplete: () => this._cleanup(),
        });
    }

    _reachExit() {
        this.alive = false;
        this.reachedEnd = true;
        if (this.pathChangeHandler) {
            this.scene.events.off('path-changed', this.pathChangeHandler);
        }
        this.scene.events.emit('enemy-reached-end', this);
        this._cleanup();
    }

    _cleanup() {
        if (this.sprite) { this.sprite.destroy(); this.sprite = null; }
        if (this.hpBg) { this.hpBg.destroy(); this.hpBg = null; }
        if (this.hpFill) { this.hpFill.destroy(); this.hpFill = null; }
    }
}
