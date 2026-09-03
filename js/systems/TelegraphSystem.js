import * as Phaser from 'phaser';
import { audio } from './AudioSystem.js';

/**
 * TelegraphSystem — Renders and resolves 1.5s telegraphed hazard zones on the ground.
 *
 * Provides clear visual and audio anticipation before a boss area-of-effect skill hits,
 * allowing the player to dodge with Vesper or reposition.
 */
export class TelegraphSystem {
    constructor(scene) {
        this.scene = scene;
        this.telegraphs = [];
    }

    /**
     * Start a telegraphed attack
     * @param {import('../entities/Enemy.js').Enemy} boss
     * @param {object} skill
     */
    addTelegraph(boss, skill) {
        const hero = this.scene.hero;
        const targetX = hero ? hero.x : boss.x;
        const targetY = hero ? hero.y : boss.y;

        const chargeMs = skill.chargeMs || 1500;
        const color = skill.color || 0xFF5722;

        let tg = {
            boss,
            skill,
            type: skill.type,
            chargeMs,
            timer: chargeMs,
            color,
            originX: boss.x,
            originY: boss.y,
            targetX,
            targetY,
            graphics: this.scene.add.graphics().setDepth(3), // On the ground, below entities
        };

        if (skill.type === 'line') {
            const dx = targetX - boss.x;
            const dy = targetY - boss.y;
            tg.angle = Math.atan2(dy, dx);
            tg.length = skill.length || 240;
            tg.width = skill.width || 38;
        } else if (skill.type === 'target_circle') {
            tg.x = targetX;
            tg.y = targetY;
            tg.radius = skill.radius || 75;
        } else {
            // circle around boss
            tg.radius = skill.radius || 130;
        }

        audio.play('boss_warn');
        this.telegraphs.push(tg);
        this._renderTelegraph(tg, 0);
        return tg;
    }

    update(delta) {
        for (let i = this.telegraphs.length - 1; i >= 0; i--) {
            const tg = this.telegraphs[i];
            tg.timer -= delta;

            const progress = Phaser.Math.Clamp(1 - (tg.timer / tg.chargeMs), 0, 1);
            this._renderTelegraph(tg, progress);

            if (tg.timer <= 0) {
                this._detonate(tg);
                if (tg.graphics) tg.graphics.destroy();
                this.telegraphs.splice(i, 1);
            }
        }
    }

    _renderTelegraph(tg, progress) {
        const g = tg.graphics;
        if (!g) return;
        g.clear();

        const pulseAlpha = 0.2 + 0.15 * Math.sin(progress * Math.PI * 6);
        const col = tg.color;

        if (tg.type === 'circle') {
            const x = tg.boss && tg.boss.alive ? tg.boss.x : tg.originX;
            const y = tg.boss && tg.boss.alive ? tg.boss.y : tg.originY;
            tg.currentX = x;
            tg.currentY = y;

            // Outer warning perimeter
            g.fillStyle(col, pulseAlpha);
            g.fillCircle(x, y, tg.radius);
            g.lineStyle(2, col, 0.85);
            g.strokeCircle(x, y, tg.radius);

            // Filling progress circle
            g.fillStyle(col, 0.45);
            g.fillCircle(x, y, tg.radius * progress);
            g.lineStyle(1.5, 0xffffff, 0.9);
            g.strokeCircle(x, y, tg.radius * progress);

        } else if (tg.type === 'target_circle') {
            const x = tg.x;
            const y = tg.y;

            // Danger circle
            g.fillStyle(col, pulseAlpha);
            g.fillCircle(x, y, tg.radius);
            g.lineStyle(2, col, 0.85);
            g.strokeCircle(x, y, tg.radius);

            // Contracting targeting ring
            const contractR = tg.radius * (1 + (1 - progress) * 0.8);
            g.lineStyle(2, 0xffffff, 0.9);
            g.strokeCircle(x, y, contractR);

            // Inner charging core
            g.fillStyle(0xffffff, 0.35 + progress * 0.4);
            g.fillCircle(x, y, tg.radius * progress);

        } else if (tg.type === 'line') {
            const x = tg.boss && tg.boss.alive ? tg.boss.x : tg.originX;
            const y = tg.boss && tg.boss.alive ? tg.boss.y : tg.originY;
            tg.currentX = x;
            tg.currentY = y;

            const len = tg.length;
            const hw = tg.width / 2;
            const ang = tg.angle;

            const cos = Math.cos(ang);
            const sin = Math.sin(ang);
            const perpX = -sin * hw;
            const perpY = cos * hw;

            // 4 corners of full rectangle
            const p1 = { x: x + perpX, y: y + perpY };
            const p2 = { x: x - perpX, y: y - perpY };
            const p3 = { x: x + cos * len - perpX, y: y + sin * len - perpY };
            const p4 = { x: x + cos * len + perpX, y: y + sin * len + perpY };

            // Draw outer perimeter box
            g.fillStyle(col, pulseAlpha);
            g.beginPath();
            g.moveTo(p1.x, p1.y);
            g.lineTo(p4.x, p4.y);
            g.lineTo(p3.x, p3.y);
            g.lineTo(p2.x, p2.y);
            g.closePath();
            g.fillPath();

            g.lineStyle(2, col, 0.9);
            g.strokePath();

            // Progress bar along length
            const curLen = len * progress;
            const p3p = { x: x + cos * curLen - perpX, y: y + sin * curLen - perpY };
            const p4p = { x: x + cos * curLen + perpX, y: y + sin * curLen + perpY };

            g.fillStyle(col, 0.45);
            g.beginPath();
            g.moveTo(p1.x, p1.y);
            g.lineTo(p4p.x, p4p.y);
            g.lineTo(p3p.x, p3p.y);
            g.lineTo(p2.x, p2.y);
            g.closePath();
            g.fillPath();

            // Front edge bright marker
            g.lineStyle(2.5, 0xffffff, 0.95);
            g.lineBetween(p4p.x, p4p.y, p3p.x, p3p.y);
        }
    }

    _detonate(tg) {
        const { skill } = tg;
        const hero = this.scene.hero;
        const cx = tg.currentX ?? tg.x ?? tg.originX;
        const cy = tg.currentY ?? tg.y ?? tg.originY;

        // Play impact sound
        audio.play(skill.sound || 'boss_slam');
        this.scene.cameras.main.shake(180, 0.005);

        // ── 1. Hero damage test ───────────────────
        let hitHero = false;
        if (hero && !hero.isDead) {
            if (tg.type === 'circle') {
                const dist = Phaser.Math.Distance.Between(cx, cy, hero.x, hero.y);
                if (dist <= tg.radius) hitHero = true;
            } else if (tg.type === 'target_circle') {
                const dist = Phaser.Math.Distance.Between(tg.x, tg.y, hero.x, hero.y);
                if (dist <= tg.radius) hitHero = true;
            } else if (tg.type === 'line') {
                hitHero = this._pointInOrientedBox(hero.x, hero.y, cx, cy, tg.angle, tg.length, tg.width);
            }
        }

        if (hitHero) {
            hero.takeDamage(skill.damage || 40);
            if (skill.slowHero) {
                // Apply temporary slow to hero
                const origSpeed = hero.speed;
                hero.speed = origSpeed * (1 - skill.slowHero);
                this.scene.time.delayedCall(skill.slowMs || 2500, () => {
                    if (hero) hero.speed = origSpeed;
                });
            }
            if (this.scene.floating) {
                this.scene.floating.show(hero.x, hero.y - 20, `-${skill.damage}`, {
                    color: '#FF1744', size: 10, rise: 16, duration: 800,
                });
            }
        }

        // ── 2. Tower stun test ────────────────────
        if (skill.stunTowerMs && this.scene.towers) {
            for (const tower of this.scene.towers) {
                if (!tower.alive) continue;
                const dist = Phaser.Math.Distance.Between(cx, cy, tower.x, tower.y);
                if (dist <= tg.radius + 16) {
                    tower.stun(skill.stunTowerMs);
                }
            }
        }

        // ── 3. Visual explosion VFX ───────────────
        this._spawnDetonationVfx(tg, cx, cy);
    }

    _pointInOrientedBox(px, py, ox, oy, angle, length, width) {
        const dx = px - ox;
        const dy = py - oy;
        const cos = Math.cos(-angle);
        const sin = Math.sin(-angle);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;
        return (localX >= 0 && localX <= length && Math.abs(localY) <= width / 2);
    }

    _spawnDetonationVfx(tg, cx, cy) {
        const col = tg.color;

        if (tg.type === 'line') {
            // Line of flames/bursts
            const steps = Math.floor(tg.length / 28);
            const cos = Math.cos(tg.angle);
            const sin = Math.sin(tg.angle);

            for (let i = 0; i <= steps; i++) {
                const px = cx + cos * (i * 28);
                const py = cy + sin * (i * 28);
                
                const blast = this.scene.add.circle(px, py, tg.width * 0.7, col, 0.8).setDepth(25);
                this.scene.tweens.add({
                    targets: blast,
                    scaleX: 1.6,
                    scaleY: 1.6,
                    alpha: 0,
                    duration: 350 + i * 20,
                    onComplete: () => blast.destroy(),
                });
            }
        } else {
            // Expanding shockwave ring
            const ring = this.scene.add.circle(cx, cy, 10, col, 0.65).setDepth(25);
            ring.setStrokeStyle(3, 0xffffff, 0.95);

            this.scene.tweens.add({
                targets: ring,
                radius: tg.radius * 1.15,
                alpha: 0,
                duration: 400,
                ease: 'Quad.easeOut',
                onComplete: () => ring.destroy(),
            });

            // Central flash
            const flash = this.scene.add.circle(cx, cy, tg.radius * 0.5, 0xffffff, 0.8).setDepth(26);
            this.scene.tweens.add({
                targets: flash,
                scaleX: 1.8,
                scaleY: 1.8,
                alpha: 0,
                duration: 260,
                onComplete: () => flash.destroy(),
            });
        }
    }

    clear() {
        for (const tg of this.telegraphs) {
            if (tg.graphics) tg.graphics.destroy();
        }
        this.telegraphs = [];
    }
}
