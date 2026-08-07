import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../systems/GridSystem.js';

const SPAWN_COL = 10;
const SPAWN_ROW = 7;

export class Hero {
    constructor(scene, col, row) {
        this.scene = scene;

        const pos = scene.gridSystem.gridToWorld(col, row);

        // Logical position. The sprite's own x/y are derived from this every
        // frame (position + bob + lunge), so no tween can fight the movement
        // code for control of the transform.
        this.posX = pos.x;
        this.posY = pos.y;
        this.bobPhase = 0;
        this.lunge = { x: 0, y: 0 };

        this.shadow = scene.add.image(pos.x, pos.y + 14, 'hero_shadow').setDepth(19);

        this.sprite = scene.add.sprite(pos.x, pos.y, 'hero');
        this.sprite.setScale(2);
        this.sprite.setDepth(20);

        this.speed = 90;
        this.attackDamage = 10;
        this.attackRange = 55;
        this.attackRate = 900;
        this.lastAttack = 0;
        this.empowerRange = 70;

        // Life force pickup. The hero drinks a mote raw — no refining bonus,
        // unlike a temple — so walking him out is how you reach motes no
        // temple covers, never a substitute for building one.
        this.collectRadius = 50;
        this.manaCollected = 0;

        this.collectField = scene.add.circle(pos.x, pos.y, this.collectRadius, 0xB388FF, 0.05);
        this.collectField.setStrokeStyle(1, 0xB388FF, 0.2);
        this.collectField.setDepth(1);
        this.collectField.setVisible(false);

        this.targetPos = null;
        this.moving = false;

        this.maxHp = 100;
        this.hp = 100;
        this.isDead = false;

        // HP bar
        this.hpBg = scene.add.rectangle(pos.x, pos.y - 18, 26, 4, 0x1a1a1a, 0.8).setDepth(21);
        this.hpBg.setStrokeStyle(1, 0x333333);
        this.hpFill = scene.add.rectangle(pos.x, pos.y - 18, 24, 2, 0x4CAF50).setDepth(22);

        // Move indicator
        this.moveIndicator = scene.add.circle(0, 0, 6, 0xB388FF, 0);
        this.moveIndicator.setStrokeStyle(1, 0xB388FF, 0);
        this.moveIndicator.setDepth(19);
    }

    get x() { return this.posX; }
    get y() { return this.posY; }

    /** Named to match Temple, so one absorption scan can drive both. */
    get absorbRadius() { return this.collectRadius; }

    /**
     * A mote finished its flight into the hero. Credited at face value: the
     * refining bonus is what a temple is for.
     */
    absorbMote(value) {
        this.manaCollected += value;
        this.scene.events.emit('mana-collected', value);
        this.scene.events.emit('hero-collected', value);

        const t = this.scene.add.text(this.posX, this.posY - 22, `+${value}`, {
            fontFamily: '"Press Start 2P"', fontSize: '6px',
            color: '#B388FF', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(28);

        this.scene.tweens.add({
            targets: t,
            y: this.posY - 38,
            alpha: 0,
            duration: 700,
            ease: 'Quad.easeOut',
            onComplete: () => t.destroy(),
        });

        this.scene.tweens.add({
            targets: this.collectField,
            fillAlpha: 0.22,
            duration: 90,
            yoyo: true,
            onComplete: () => { if (this.collectField) this.collectField.fillAlpha = 0.05; },
        });
    }

    moveTo(worldX, worldY) {
        if (this.isDead) return;
        const tx = Phaser.Math.Clamp(worldX, 10, GAME_WIDTH - 10);
        const ty = Phaser.Math.Clamp(worldY, 12, GAME_HEIGHT - 10);
        this.targetPos = { x: tx, y: ty };
        this.moving = true;

        // Show movement indicator
        this.moveIndicator.setPosition(tx, ty);
        this.moveIndicator.setAlpha(0.6);
        this.moveIndicator.setStrokeStyle(1, 0xB388FF, 0.6);
        this.scene.tweens.add({
            targets: this.moveIndicator,
            alpha: 0,
            scaleX: 2,
            scaleY: 2,
            duration: 600,
            onComplete: () => {
                this.moveIndicator.setScale(1);
            },
        });
    }

    update(time, delta) {
        if (this.isDead) return;

        // ── Movement ────────────────────────────
        if (this.moving && this.targetPos) {
            const dx = this.targetPos.x - this.posX;
            const dy = this.targetPos.y - this.posY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const step = this.speed * (delta / 1000);

            if (dist <= step) {
                this.posX = this.targetPos.x;
                this.posY = this.targetPos.y;
                this.moving = false;
            } else {
                this.posX += (dx / dist) * step;
                this.posY += (dy / dist) * step;
            }
            if (Math.abs(dx) > 1) this.sprite.flipX = dx < 0;
        }

        this.posX = Phaser.Math.Clamp(this.posX, 10, GAME_WIDTH - 10);
        this.posY = Phaser.Math.Clamp(this.posY, 12, GAME_HEIGHT - 10);

        this._syncSprite(delta);

        // ── Auto-attack nearby enemies ──────────
        if (time - this.lastAttack >= this.attackRate) {
            const target = this._findNearest();
            if (target) {
                target.takeDamage(this.attackDamage);
                this.lastAttack = time;

                // Attack visual – quick beam
                const line = this.scene.add.line(
                    0, 0,
                    this.posX, this.posY,
                    target.x, target.y,
                    0xB388FF, 0.8
                ).setOrigin(0, 0).setDepth(19).setLineWidth(1.5);

                this.scene.time.delayedCall(100, () => line.destroy());

                // Slight lunge toward target — applied as an offset so it
                // never overwrites the hero's real position.
                const dx = target.x - this.posX;
                const dy = target.y - this.posY;
                this.scene.tweens.add({
                    targets: this.lunge,
                    x: dx * 0.12,
                    y: dy * 0.12,
                    duration: 60,
                    yoyo: true,
                    onComplete: () => { this.lunge.x = 0; this.lunge.y = 0; },
                });
            }
        }

        // ── Empower hybrid towers ───────────────
        this._checkEmpowerment();
    }

    /** Pushes logical position + idle bob + lunge offset onto the sprite. */
    _syncSprite(delta) {
        this.bobPhase += (delta / 1000) * (this.moving ? 9 : 3.4);
        const bob = this.moving
            ? -Math.abs(Math.sin(this.bobPhase)) * 2   // little hop while walking
            : Math.sin(this.bobPhase) * 1.5;           // slow float while idle

        this.sprite.x = this.posX + this.lunge.x;
        this.sprite.y = this.posY + this.lunge.y + bob;
        this.shadow.x = this.posX;
        this.shadow.y = this.posY + 14;
        this.shadow.setScale(this.moving ? 0.9 : 1, 1);

        // The pickup field is only drawn when there is something to pick up —
        // a circle trailing the hero at all times is noise the rest of the time.
        this.collectField.setPosition(this.posX, this.posY);
        this.collectField.setVisible(this.scene.manaMotes.length > 0);

        this._updateHpBar();
    }

    _findNearest() {
        let nearest = null;
        let nearestDist = Infinity;

        for (const enemy of this.scene.enemies) {
            if (!enemy.alive) continue;
            const d = Phaser.Math.Distance.Between(this.posX, this.posY, enemy.x, enemy.y);
            if (d <= this.attackRange && d < nearestDist) {
                nearest = enemy;
                nearestDist = d;
            }
        }
        return nearest;
    }

    _checkEmpowerment() {
        for (const tower of this.scene.towers) {
            if (!tower.alive) continue;
            const d = Phaser.Math.Distance.Between(this.posX, this.posY, tower.x, tower.y);
            tower.setEmpowered(tower.isHybrid && d <= this.empowerRange);
        }
    }

    _updateHpBar() {
        if (!this.hpBg) return;
        const pct = Math.max(0, this.hp / this.maxHp);
        this.hpBg.x = this.posX;
        this.hpBg.y = this.posY - 18;
        this.hpFill.width = 24 * pct;
        this.hpFill.x = this.posX - (24 * (1 - pct)) / 2;
        this.hpFill.y = this.posY - 18;

        if (pct > 0.6) this.hpFill.fillColor = 0x4CAF50;
        else if (pct > 0.3) this.hpFill.fillColor = 0xFFC107;
        else this.hpFill.fillColor = 0xEF5350;
    }

    takeDamage(amount) {
        if (this.isDead) return;
        this.hp -= amount;

        // setTintFill was removed in Phaser 4 — FILL is now a tint mode
        this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        this.scene.time.delayedCall(60, () => {
            this.sprite.setTintMode(Phaser.TintModes.MULTIPLY);
            if (!this.isDead) this.sprite.clearTint();
        });

        if (this.hp <= 0) {
            this._die();
        } else {
            this._updateHpBar();
        }
    }

    _die() {
        this.isDead = true;
        this.moving = false;
        this.targetPos = null;
        this.sprite.setVisible(false);
        this.shadow.setVisible(false);
        this.hpBg.setVisible(false);
        this.hpFill.setVisible(false);
        this.collectField.setVisible(false);

        // Spawn death visual
        const skull = this.scene.add.text(this.posX, this.posY, '💀', { fontSize: '16px' }).setOrigin(0.5);
        this.scene.tweens.add({
            targets: skull, y: this.posY - 30, alpha: 0, duration: 1500, onComplete: () => skull.destroy()
        });

        // Cancel all empowerment since hero is dead
        for (const tower of this.scene.towers) {
            tower.setEmpowered(false);
        }

        // Respawn after 8 seconds (the Clock already applies timeScale)
        this.scene.time.delayedCall(8000, () => this._respawn());
    }

    _respawn() {
        this.isDead = false;
        this.hp = this.maxHp;
        this.lunge.x = 0;
        this.lunge.y = 0;

        const pos = this.scene.gridSystem.gridToWorld(SPAWN_COL, SPAWN_ROW);
        this.posX = pos.x;
        this.posY = pos.y;
        this.sprite.setPosition(pos.x, pos.y);
        this.shadow.setPosition(pos.x, pos.y + 14);
        this.collectField.setPosition(pos.x, pos.y);
        this.collectField.fillAlpha = 0.05;

        this.sprite.setVisible(true);
        this.shadow.setVisible(true);
        this.hpBg.setVisible(true);
        this.hpFill.setVisible(true);
        this.sprite.clearTint();
        this._updateHpBar();

        this.sprite.setScale(0);
        this.scene.tweens.add({
            targets: this.sprite, scale: 2, duration: 400, ease: 'Back.easeOut'
        });
    }
}
