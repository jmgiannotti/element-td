import * as Phaser from 'phaser';

export class Projectile {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x – origin x
     * @param {number} y – origin y
     * @param {object} target – Enemy instance
     * @param {number} damage
     * @param {object} towerData – from TOWER_DATA
     */
    constructor(scene, x, y, target, damage, towerData) {
        this.scene = scene;
        this.target = target;
        this.damage = damage;
        this.towerData = towerData;
        this.alive = true;

        this.sprite = scene.add.sprite(x, y, `proj_${towerData.element}`);
        this.sprite.setScale(2);
        this.sprite.setDepth(15);

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

        this.scene.tweens.add({
            targets: this.sprite,
            x: this.target.x,
            y: this.target.y,
            duration,
            ease: 'Linear',
            onComplete: () => this._hit(),
        });
    }

    _hit() {
        if (!this.alive) return;

        if (this.target && this.target.alive) {
            // Resistance check
            const resisted =
                this.target.data.resistance === this.towerData.element;
            const dmg = resisted ? this.damage * 0.5 : this.damage;

            this.target.takeDamage(dmg);

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
                    this.target.applyBurn(this.towerData.specialValue, 3000);
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
                enemy.takeDamage(this.damage * 0.4);
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
                enemy.takeDamage(chainDmg);
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
        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = null;
        }
    }
}
