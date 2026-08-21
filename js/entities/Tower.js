import * as Phaser from 'phaser';
import { TOWER_DATA } from '../data/TowerData.js';
import { Projectile } from './Projectile.js';
import { safeTexture } from '../systems/TextureGuard.js';
import { audio } from '../systems/AudioSystem.js';

export class Tower {
    constructor(scene, col, row, element, paidCost = 0) {
        this.scene = scene;
        this.col = col;
        this.row = row;
        this.element = element;
        this.data = { ...TOWER_DATA[element] };
        // What this building actually cost its owner, which is the only honest
        // basis for a refund: hybrids have no list price at all.
        this.paidCost = paidCost;
        this.empowered = false;
        this.fusionHint = false;
        this.fireTimer = 0;
        this.alive = true;
        this.totalDamageDealt = 0;
        this.enemiesKilled = 0;
        // Hover shows the range for as long as the cursor is there; a click
        // pins it, which is the only way to compare two towers' reach at once.
        this.selected = false;

        const pos = scene.gridSystem.gridToWorld(col, row);

        // Main sprite. Depth is biased by row so towers in adjacent rows always
        // stack front-to-back in the same order instead of by build order.
        this.sprite = scene.add.sprite(
            pos.x, pos.y,
            safeTexture(scene, `tower_${element}`, 'tower_earth')
        );
        // Textures are authored at the tile's own 32×32, so the sprite is drawn
        // one texel to one world pixel — same pixel density as the ground it
        // stands on.
        this.sprite.setScale(1);
        this.sprite.setDepth(5 + row * 0.01);
        this.sprite.setData('tower', true);

        // Empower aura — kept inside the tile so it never bleeds onto a neighbour.
        // Storm towers use ambient electric arcs instead of the plain glow.
        this.empowerGfx = scene.add.circle(pos.x, pos.y, 14, 0xFFD700, 0.0);
        this.empowerGfx.setDepth(4);

        // Storm electric-spark emitter timer (null when not active)
        this._sparkTimer = null;

        // Spawn animation – pop in
        this.sprite.setScale(0);
        scene.tweens.add({
            targets: this.sprite,
            scaleX: 1,
            scaleY: 1,
            duration: 250,
            ease: 'Back.easeOut',
        });

        // Hover interactivity. Leaving the tower dismisses the inspection card.
        this.sprite.setInteractive();
        this.sprite.on('pointerover', () => {
            if (!this.selected) {
                this.scene.sharedRangeGfx.setPosition(this.x, this.y);
                this.scene.sharedRangeGfx.setRadius(this.range);
                this.scene.sharedRangeGfx.setFillStyle(0xffffff, 0.07);
                this.scene.sharedRangeGfx.setStrokeStyle(1, 0xffffff, 0.15);
                this.scene.sharedRangeGfx.setVisible(true);
            }
        });
        this.sprite.on('pointerout', () => {
            if (!this.selected) {
                this.scene.sharedRangeGfx.setVisible(false);
            }
            if (this.selected && this.scene.selectStructure) {
                this.scene.selectStructure(null);
            }
        });
    }

    get x() { return this.sprite.x; }
    get y() { return this.sprite.y; }
    get isHybrid() { return this.data.isHybrid; }

    // ── Effective stats ──────────────────────────
    // Base value × whatever this element's temple upgrades have unlocked.
    // Read live rather than cached, so an upgrade bought mid-wave takes effect
    // on the very next shot.
    _mult(track) {
        return this.scene.templeSystem
            ? this.scene.templeSystem.multiplier(this.element, track)
            : 1;
    }

    get damage() { return this.data.damage * this._mult('damage'); }
    get range() { return this.data.range * this._mult('range'); }
    get fireRate() { return this.data.fireRate * this._mult('fireRate'); }

    /** Called by TempleSystem when this element's upgrade levels change. */
    refreshStats() {
        if (!this.alive) return;
        if (this.selected) {
            this.scene.sharedRangeGfx.setRadius(this.range);
        }
    }

    /**
     * Pin the range ring. Drawn brighter than the hover version so a pinned
     * tower stays findable once the cursor has wandered off it.
     */
    setSelected(value) {
        if (this.selected === value) return;
        this.selected = value;
        if (!this.alive) return;

        if (value) {
            this.scene.sharedRangeGfx.setPosition(this.x, this.y);
            this.scene.sharedRangeGfx.setRadius(this.range);
            this.scene.sharedRangeGfx.setFillStyle(0xFFD54F, 0.09);
            this.scene.sharedRangeGfx.setStrokeStyle(1, 0xFFD54F, 0.55);
            this.scene.sharedRangeGfx.setVisible(true);
        } else {
            this.scene.sharedRangeGfx.setVisible(false);
        }
    }

    /** Shots per second at the stats it actually has right now. */
    get shotsPerSecond() {
        const rate = this.empowered ? this.fireRate * 0.75 : this.fireRate;
        return 1000 / rate;
    }

    update(delta, enemies) {
        if (!this.alive) return;

        const rate = this.empowered ? this.fireRate * 0.75 : this.fireRate;
        this.fireTimer -= delta;

        if (this.fireTimer <= 0) {
            const target = this._findTarget(enemies);
            if (target) {
                this._fire(target);
                this.fireTimer = rate;
            }
        }
    }

    _findTarget(enemies) {
        let best = null;
        let bestProgress = -1;

        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const d = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
            if (d > this.range) continue;
            if (enemy.pathProgress > bestProgress) {
                best = enemy;
                bestProgress = enemy.pathProgress;
            }
        }
        return best;
    }

    recordDamage(amount) {
        if (amount <= 0) return;
        this.totalDamageDealt += amount;
        if (this.selected && this.scene._refreshStatLabel) {
            this.scene._refreshStatLabel();
        }
    }

    recordKill() {
        this.enemiesKilled += 1;
        if (this.selected && this.scene._refreshStatLabel) {
            this.scene._refreshStatLabel();
        }
    }

    _fire(target) {
        const dmg = this.empowered ? this.damage * 1.5 : this.damage;
        audio.play('shoot', this.element);
        const proj = Projectile.obtain(this.scene, this.x, this.y - 4, target, dmg, this.data, this);
        this.scene.projectiles.push(proj);

        // Recoil — a squash, so the sprite never grows past its own tile
        this.scene.tweens.add({
            targets: this.sprite,
            scaleX: 1.08,
            scaleY: 0.91,
            duration: 50,
            yoyo: true,
            ease: 'Quad.easeOut',
            onComplete: () => this.sprite.setScale(1),
        });
    }

    setEmpowered(value) {
        if (this.empowered === value) return;
        this.empowered = value;
        this._applyTint();

        if (this.element === 'storm') {
            // Storm tower: ambient, chill electric arcs across the whole structure
            if (value) {
                this._sparkTimer = this.scene.time.addEvent({
                    delay: 220,
                    loop: true,
                    callback: this._spawnElectricSpark,
                    callbackScope: this,
                });
            } else {
                if (this._sparkTimer) { this._sparkTimer.remove(); this._sparkTimer = null; }
            }
        } else {
            // Other towers: simple gold glow
            this.scene.tweens.add({
                targets: this.empowerGfx,
                fillAlpha: value ? 0.25 : 0.0,
                duration: 300,
            });
        }
    }

    /**
     * Spawns chill, elegant electric arcs (rayitos) scattered across
     * all sections of the storm tower (orb, prongs, central shaft, and base).
     */
    _spawnElectricSpark() {
        if (!this.alive) return;

        const ox = this.x - 16;
        const oy = this.y - 16;

        // Structural anchor points spread across the entire tower height
        const P_ORB       = { x: ox + 16, y: oy + 4 };
        const P_ORB_TOP   = { x: ox + 16, y: oy + 1 };
        const P_PRONG_L   = { x: ox + 10, y: oy + 4 };
        const P_PRONG_R   = { x: ox + 21, y: oy + 4 };
        const P_CORNICE_L = { x: ox + 8,  y: oy + 16 };
        const P_CORNICE_R = { x: ox + 23, y: oy + 16 };
        const P_SHAFT_L   = { x: ox + 10, y: oy + 21 };
        const P_SHAFT_R   = { x: ox + 21, y: oy + 21 };
        const P_BASE_L    = { x: ox + 8,  y: oy + 28 };
        const P_BASE_R    = { x: ox + 23, y: oy + 28 };
        const P_BASE_BOT  = { x: ox + 16, y: oy + 29 };

        // Helper to draw a single clean, jagged ray between two points
        const drawRay = (start, end, jitterAmt = 1.6) => {
            const ax = start.x + (Math.random() - 0.5) * 1.5;
            const ay = start.y + (Math.random() - 0.5) * 1.5;
            const bx = end.x + (Math.random() - 0.5) * 1.5;
            const by = end.y + (Math.random() - 0.5) * 1.5;

            const totalDx = bx - ax;
            const totalDy = by - ay;
            const len = Math.hypot(totalDx, totalDy);
            if (len < 2) return;

            const perpX = -totalDy / len;
            const perpY = totalDx / len;

            const numSegments = 3;
            const pts = [{ x: ax, y: ay }];
            const initialSide = Math.random() < 0.5 ? 1 : -1;

            for (let i = 1; i < numSegments; i++) {
                const t = i / numSegments;
                const side = (i % 2 === 1) ? initialSide : -initialSide;
                const disp = side * (jitterAmt * (0.7 + Math.random() * 0.7));
                pts.push({
                    x: ax + totalDx * t + perpX * disp,
                    y: ay + totalDy * t + perpY * disp,
                });
            }
            pts.push({ x: bx, y: by });

            const g = this.scene.add.graphics();
            g.setDepth(7);

            // Soft electric aura (cyan-violet glow)
            g.lineStyle(2.4, 0x4C82FB, 0.35);
            g.beginPath();
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
            g.strokePath();

            // Crisp electric core (white/bright light-cyan)
            const coreCol = Math.random() < 0.25 ? 0xFEF08A : 0xE0F2FE;
            g.lineStyle(1.0, coreCol, 0.92);
            g.beginPath();
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
            g.strokePath();

            // Anchor spark points
            g.fillStyle(0x7DD3FC, 0.6);
            g.fillCircle(ax, ay, 1.1);
            g.fillStyle(0xFFFFFF, 0.85);
            g.fillCircle(bx, by, 0.9);

            const duration = 170 + Math.random() * 60;
            this.scene.tweens.add({
                targets: g,
                alpha: 0,
                duration: duration,
                ease: 'Quad.easeOut',
                onComplete: () => { if (g) g.destroy(); },
            });
        };

        // Pick 1 or 2 zones to crackle across different parts of the tower
        const count = Math.random() < 0.4 ? 2 : 1;

        for (let k = 0; k < count; k++) {
            const zone = Math.random();
            if (zone < 0.30) {
                // Top zone: Prongs <-> Orb or top crown
                if (Math.random() < 0.7) {
                    const prong = Math.random() < 0.5 ? P_PRONG_L : P_PRONG_R;
                    drawRay(prong, Math.random() < 0.5 ? P_ORB : P_ORB_TOP, 1.8);
                } else {
                    const topStart = { x: P_ORB_TOP.x + (Math.random() - 0.5) * 4, y: P_ORB_TOP.y };
                    const topEnd = { x: topStart.x + (Math.random() - 0.5) * 6, y: topStart.y - (3 + Math.random() * 4) };
                    drawRay(topStart, topEnd, 1.4);
                }
            } else if (zone < 0.55) {
                // Mid zone: Cornice to Shaft or horizontal shaft cross-crackle
                if (Math.random() < 0.5) {
                    const isLeft = Math.random() < 0.5;
                    drawRay(isLeft ? P_CORNICE_L : P_CORNICE_R, isLeft ? P_SHAFT_L : P_SHAFT_R, 1.6);
                } else {
                    drawRay(P_SHAFT_L, P_SHAFT_R, 1.8);
                }
            } else if (zone < 0.80) {
                // Base / Pedestal zone: Shaft down to Base or ground crackle
                if (Math.random() < 0.5) {
                    const isLeft = Math.random() < 0.5;
                    drawRay(isLeft ? P_SHAFT_L : P_SHAFT_R, isLeft ? P_BASE_L : P_BASE_R, 1.6);
                } else {
                    const sideBase = Math.random() < 0.5 ? P_BASE_L : P_BASE_R;
                    drawRay(sideBase, P_BASE_BOT, 1.5);
                }
            } else {
                // Perimeter discharge into the surrounding air (from corners/edges)
                const anchors = [P_PRONG_L, P_PRONG_R, P_CORNICE_L, P_CORNICE_R, P_BASE_L, P_BASE_R];
                const anchor = anchors[Math.floor(Math.random() * anchors.length)];
                const dx = anchor.x - this.x;
                const dy = anchor.y - this.y;
                const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.8;
                const dist = 5 + Math.random() * 5;
                const airTarget = {
                    x: anchor.x + Math.cos(ang) * dist,
                    y: anchor.y + Math.sin(ang) * dist,
                };
                drawRay(anchor, airTarget, 1.5);
            }
        }
    }

    /** Highlight used by FusionSystem while a fusion is on offer. */
    setFusionHint(value) {
        if (this.fusionHint === value) return;
        this.fusionHint = value;
        this._applyTint();
    }

    /** Single owner of the sprite tint, so the highlights can't clobber each other. */
    _applyTint() {
        if (!this.alive) return;
        if (this.empowered) {
            if (this.element === 'storm') {
                // Storm towers don't use the brownish-gold tint — clean original colors
                this.sprite.clearTint();
            } else {
                this.sprite.setTint(0xFFE082);
            }
        } else {
            this.sprite.clearTint();
        }
    }

    destroy() {
        this.alive = false;
        if (this.sprite) this.sprite.destroy();
        if (this.empowerGfx) this.empowerGfx.destroy();
        if (this._sparkTimer) { this._sparkTimer.remove(); this._sparkTimer = null; }
        
        if (this.selected) {
            this.scene.sharedRangeGfx.setVisible(false);
        }
    }
}
