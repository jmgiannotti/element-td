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
        this.lastFired = 0;
        this.alive = true;
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

        // Range indicator (hidden by default)
        this.rangeGfx = scene.add.circle(pos.x, pos.y, this.range, 0xffffff, 0.07);
        this.rangeGfx.setStrokeStyle(1, 0xffffff, 0.15);
        this.rangeGfx.setDepth(1);
        this.rangeGfx.setVisible(false);

        // Empower aura — kept inside the tile so it never bleeds onto a neighbour
        this.empowerGfx = scene.add.circle(pos.x, pos.y, 14, 0xFFD700, 0.0);
        this.empowerGfx.setDepth(4);

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
        this.sprite.on('pointerover', () => this.rangeGfx.setVisible(true));
        this.sprite.on('pointerout', () => {
            this.rangeGfx.setVisible(false);
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
        if (!this.alive || !this.rangeGfx) return;
        this.rangeGfx.setRadius(this.range);
    }

    /**
     * Pin the range ring. Drawn brighter than the hover version so a pinned
     * tower stays findable once the cursor has wandered off it.
     */
    setSelected(value) {
        if (this.selected === value) return;
        this.selected = value;
        if (!this.alive || !this.rangeGfx) return;

        this.rangeGfx.setRadius(this.range);
        this.rangeGfx.setVisible(value);
        this.rangeGfx.setFillStyle(0xFFD54F, value ? 0.09 : 0.07);
        this.rangeGfx.setStrokeStyle(1, value ? 0xFFD54F : 0xffffff, value ? 0.55 : 0.15);
    }

    /** Shots per second at the stats it actually has right now. */
    get shotsPerSecond() {
        const rate = this.empowered ? this.fireRate * 0.75 : this.fireRate;
        return 1000 / rate;
    }

    update(time, enemies) {
        if (!this.alive) return;

        const rate = this.empowered ? this.fireRate * 0.75 : this.fireRate;

        if (time - this.lastFired >= rate) {
            const target = this._findTarget(enemies);
            if (target) {
                this._fire(target, time);
                this.lastFired = time;
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

    _fire(target, _time) {
        const dmg = this.empowered ? this.damage * 1.5 : this.damage;
        audio.play('shoot', this.element);
        const proj = new Projectile(this.scene, this.x, this.y - 4, target, dmg, this.data);
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

        this.scene.tweens.add({
            targets: this.empowerGfx,
            fillAlpha: value ? 0.25 : 0.0,
            duration: 300,
        });
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
        if (this.empowered) this.sprite.setTint(0xFFE082);
        else this.sprite.clearTint();
    }

    destroy() {
        this.alive = false;
        if (this.sprite) this.sprite.destroy();
        if (this.rangeGfx) this.rangeGfx.destroy();
        if (this.empowerGfx) this.empowerGfx.destroy();
    }
}
