import * as Phaser from 'phaser';
import { effectOf, effectMultiplier } from '../data/Elements.js';

export class Projectile {
    static pool = [];

    static obtain(scene, x, y, target, damage, towerData, sourceTower = null) {
        const p = this.pool.pop();
        if (p) {
            p.scene = scene;
            p.target = target;
            p.damage = damage;
            p.towerData = towerData;
            p.sourceTower = sourceTower;
            p.alive = true;
            p.sprite.setTexture(`proj_${towerData.element}`)
                .setPosition(x, y)
                .setActive(true)
                .setVisible(true);
            p._fly();
            return p;
        }
        return new Projectile(scene, x, y, target, damage, towerData, sourceTower);
    }

    /**
     * @param {Phaser.Scene} scene
     * @param {number} x – origin x
     * @param {number} y – origin y
     * @param {object} target – Enemy instance
     * @param {number} damage
     * @param {object} towerData – from TOWER_DATA
     * @param {object} [sourceTower] – Tower instance that fired this shot
     */
    constructor(scene, x, y, target, damage, towerData, sourceTower = null) {
        this.scene = scene;
        this.target = target;
        this.damage = damage;
        this.towerData = towerData;
        this.sourceTower = sourceTower;
        this.alive = true;

        this.sprite = scene.add.sprite(x, y, `proj_${towerData.element}`);
        this.sprite.setScale(1);
        this.sprite.setDepth(15);
        // The art is a comet drawn pointing right, with its head at x≈13 of 18.
        // Hanging the sprite off the head means the head lands on the target
        // and the tail sweeps behind it, whichever way the shot is going.
        this.sprite.setOrigin(13 / 18, 0.5);

        this._fly();
    }

    _fly() {
        if (!this.target || !this.target.alive) {
            this.destroy();
            return;
        }

        const dist = Phaser.Math.Distance.Between(
            this.sprite.x, this.sprite.y, this.target.x, this.target.y
        );
        const duration = Math.max(60, (dist / 350) * 1000);

        // Turned onto its flight vector once, at launch: the path is a straight
        // tween, so the angle never changes and this costs nothing per frame.
        this.sprite.setRotation(Phaser.Math.Angle.Between(
            this.sprite.x, this.sprite.y, this.target.x, this.target.y
        ));

        this.tween = this.scene.tweens.add({
            targets: this.sprite,
            x: this.target.x,
            y: this.target.y,
            duration,
            ease: 'Linear',
            onComplete: () => this._hit(),
        });
    }

    /**
     * What landing looks like. A shot that simply vanishes on contact reads as
     * a missed frame. We emit particles via the centralized particle system.
     */
    _burst(x, y) {
        if (this.scene.particleSystem) {
            this.scene.particleSystem.emitBurst(x, y, this.towerData.color);
        }
    }

    _hit() {
        if (!this.alive) return;

        if (this.sprite) this._burst(this.sprite.x, this.sprite.y);

        if (this.target && this.target.alive) {
            // Elemental match-up. The effect travels with the damage so the
            // number that pops off the enemy can explain itself.
            const effect = effectOf(this.towerData.element, this.target.data);
            const dmg = this.damage * effectMultiplier(effect);

            this.target.takeDamage(dmg, { effect, source: this.sourceTower });

            // Apply specials
            switch (this.towerData.special) {
                case 'slow':
                    this.target.applySlow(this.towerData.specialValue, 2000);
                    break;
                case 'freeze':
                    if (Math.random() < 0.35) {
                        this.target.applyFreeze(this.towerData.specialValue);
                    }
                    break;
                case 'burn':
                    this.target.applyBurn(this.towerData.specialValue, 3000, this.sourceTower);
                    break;
                case 'splash':
                    this._doSplash();
                    break;
                case 'chain':
                    this._doChain();
                    break;
                case 'aoeSlow':
                    this._doAoeSlow();
                    break;
            }
        }

        this.destroy();
    }

    _doSplash() {
        const radius = this.towerData.specialValue;
        for (const enemy of this.scene.enemies) {
            if (!enemy.alive || enemy === this.target) continue;
            const d = Phaser.Math.Distance.Between(
                this.target.x, this.target.y, enemy.x, enemy.y
            );
            if (d <= radius) {
                // Splash is the same element as the shot that caused it, so the
                // match-up is re-read per victim rather than inherited.
                const effect = effectOf(this.towerData.element, enemy.data);
                enemy.takeDamage(this.damage * 0.4 * effectMultiplier(effect), { effect, source: this.sourceTower });
            }
        }
    }

    _doChain() {
        let remaining = this.towerData.specialValue - 1;
        let lastX = this.target.x;
        let lastY = this.target.y;
        let chainDmg = this.damage * 0.5;
        const hit = new Set([this.target]);

        for (const enemy of this.scene.enemies) {
            if (remaining <= 0) break;
            if (!enemy.alive || hit.has(enemy)) continue;
            const d = Phaser.Math.Distance.Between(lastX, lastY, enemy.x, enemy.y);
            if (d <= 90) {
                const effect = effectOf(this.towerData.element, enemy.data);
                enemy.takeDamage(chainDmg * effectMultiplier(effect), { effect, source: this.sourceTower });
                // Visual chain line
                const line = this.scene.add.line(
                    0, 0, lastX, lastY, enemy.x, enemy.y, 0xFFD54F, 0.7
                ).setOrigin(0, 0).setDepth(14).setLineWidth(1);
                this.scene.time.delayedCall(150, () => line.destroy());

                hit.add(enemy);
                lastX = enemy.x;
                lastY = enemy.y;
                chainDmg *= 0.6;
                remaining--;
            }
        }
    }

    _doAoeSlow() {
        for (const enemy of this.scene.enemies) {
            if (!enemy.alive) continue;
            const d = Phaser.Math.Distance.Between(
                this.target.x, this.target.y, enemy.x, enemy.y
            );
            if (d <= 64) {
                enemy.applySlow(this.towerData.specialValue, 3000);
            }
        }
    }

    destroy() {
        this.alive = false;
        this.sourceTower = null;
        this.target = null;
        if (this.tween) {
            this.tween.stop();
            this.tween = null;
        }
        if (this.sprite) {
            this.sprite.setActive(false).setVisible(false);
        }
        
        // Return to pool if not overloaded
        if (Projectile.pool.length < 500) {
            Projectile.pool.push(this);
        } else if (this.sprite) {
            this.sprite.destroy();
            this.sprite = null;
        }
    }
}
