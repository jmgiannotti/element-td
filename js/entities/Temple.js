import { TEMPLE_DATA } from '../data/TempleData.js';
import { safeTexture } from '../systems/TextureGuard.js';
import { audio } from '../systems/AudioSystem.js';

/**
 * A temple: the building that harvests life force and, once standing, unlocks
 * its element's upgrade tree. It never shoots — all of its value is economic.
 */
export class Temple {
    constructor(scene, col, row, element, paidCost = 0) {
        this.scene = scene;
        this.col = col;
        this.row = row;
        this.element = element;
        this.data = { ...TEMPLE_DATA[element] };
        // Temples get dearer with every one standing, so the refund can only
        // come from the price this particular one was bought at.
        this.paidCost = paidCost;
        this.fusionHint = false;
        this.alive = true;
        this.absorbed = 0;
        // Milliseconds left held shut by a sillar. See sabotage().
        this.disabledTimer = 0;

        const pos = scene.gridSystem.gridToWorld(col, row);

        // The absorption field stays faintly visible at all times — the player
        // has to be able to plan mote coverage without hovering every temple.
        this.field = scene.add.circle(pos.x, pos.y, this.data.absorbRadius, this.data.color, 0.05);
        this.field.setStrokeStyle(1, this.data.color, 0.22);
        this.field.setDepth(0.9);

        // Ground glow under the building itself
        this.glow = scene.add.circle(pos.x, pos.y + 9, 13, this.data.color, 0.18);
        this.glow.setDepth(4);

        this.sprite = scene.add.sprite(
            pos.x, pos.y,
            safeTexture(scene, `temple_${element}`, 'temple_earth')
        );
        this.sprite.setScale(1);
        // Same row-biased depth rule as towers, one notch above so a temple
        // reads as the taller building when they share a row.
        this.sprite.setDepth(5.5 + row * 0.01);
        this.sprite.setData('temple', true);

        // Rank pips — one per upgrade level bought for this element
        this.pips = [];
        this._buildPips();

        this.sprite.setScale(0);
        scene.tweens.add({
            targets: this.sprite,
            scaleX: 1, scaleY: 1,
            duration: 300,
            ease: 'Back.easeOut',
        });

        this.field.setScale(0.2);
        scene.tweens.add({
            targets: this.field,
            scaleX: 1, scaleY: 1,
            duration: 450,
            ease: 'Quad.easeOut',
        });

        this.sprite.setInteractive({ useHandCursor: true });
        this.sprite.on('pointerover', () => this._hover(true));
        this.sprite.on('pointerout', () => this._hover(false));
        // On release, not on press. A press on a temple is also the first frame
        // of a possible fusion drag, and a modal opening under the cursor would
        // swallow the gesture before it started — so the panel waits until the
        // release, and stands down when the release turns out to end a drag.
        this.sprite.on('pointerup', (pointer) => {
            if (pointer.button !== 0) return;
            if (!this.alive) return;
            // While placing something the click belongs to the build cursor,
            // otherwise you could never drop a tower beside a temple. Same for
            // the sell and spell cursors: there the click is aimed at this tile.
            if (this.scene.placementMode || this.scene.sellMode || this.scene.spellMode) return;
            const fs = this.scene.fusionSystem;
            if (fs && (fs.dragging || fs.justDragged)) return;
            pointer.event.stopPropagation();
            this.scene.events.emit('open-temple', this.element);
        });
    }

    get x() { return this.sprite ? this.sprite.x : 0; }
    get y() { return this.sprite ? this.sprite.y : 0; }
    get isHybrid() { return this.data.isHybrid; }
    get absorbRadius() { return this.data.absorbRadius; }

    _hover(on) {
        if (!this.alive) return;
        this.field.setFillStyle(this.data.color, on ? 0.12 : 0.05);
        this.field.setStrokeStyle(1, this.data.color, on ? 0.5 : 0.22);
    }

    // ─── Sabotage ───────────────────────────────────────
    /** True while a sillar is holding this temple shut. */
    get disabled() { return this.disabledTimer > 0; }

    /**
     * Held shut for `ms`. It is not damage and it does not accumulate — the
     * timer is refreshed, not stacked, so two sillares on one temple are not
     * twice as bad as one. They are the same bad for twice as long, which is
     * what the player can actually act on.
     *
     * What it stops is the absorption (see TempleSystem): motes in range stop
     * being drunk and evaporate on their own clock. The upgrade levels this
     * element already bought are untouched — those are knowledge, not a service
     * the building provides, and silently nerfing every tower on the map from a
     * building the player may not even be looking at would be a cost with no
     * visible cause.
     */
    sabotage(ms) {
        if (!this.alive) return;
        const wasOff = this.disabled;
        this.disabledTimer = Math.max(this.disabledTimer, ms);

        if (!wasOff) {
            this._applyTint();
            // The field is the promise "motes in here get drunk". While it is
            // shut that promise is false, so the ring has to go with it.
            this.field.setVisible(false);
            this.glow.setFillStyle(0x000000, 0.25);
            this.scene.events.emit('temple-sabotaged', this);
        }

        audio.play('sabotage');

        // A jolt on every strike, so a second hit on an already-dark temple is
        // still visibly a second hit.
        this.scene.tweens.add({
            targets: this.sprite,
            x: this.sprite.x + 2,
            duration: 45,
            yoyo: true,
            repeat: 2,
            onComplete: () => {
                if (this.sprite) this.sprite.x = this.scene.gridSystem.gridToWorld(this.col, this.row).x;
            },
        });
    }

    /** Ticks the shutdown down. Called by GameScene once per frame. */
    update(delta) {
        if (!this.alive || this.disabledTimer <= 0) return;
        this.disabledTimer -= delta;
        if (this.disabledTimer > 0) return;

        this.disabledTimer = 0;
        this._applyTint();
        this.field.setVisible(true);
        this.glow.setFillStyle(this.data.color, 0.18);
        this.scene.events.emit('temple-restored', this);
    }

    /** Called when a mote finishes its flight into this temple. */
    absorbMote(value) {
        if (!this.alive) return;
        const gained = Math.round(value * (1 + this.data.absorbBonus));
        this.absorbed += gained;
        this.scene.events.emit('mana-collected', gained);

        // Intake flash
        this.scene.tweens.add({
            targets: this.glow,
            fillAlpha: 0.5,
            duration: 90,
            yoyo: true,
            onComplete: () => { if (this.glow) this.glow.fillAlpha = 0.18; },
        });

        // 8px, not 6: Press Start 2P is drawn on an 8px grid, so it is only
        // pixel-exact at multiples of 8 — at 6 the glyphs get resampled and the
        // number comes out furry. Nothing here constrains the width.
        const t = this.scene.add.text(this.x, this.y - 20, `+${gained}`, {
            fontFamily: '"Press Start 2P"', fontSize: '8px',
            color: '#B388FF', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(28);

        this.scene.tweens.add({
            targets: t,
            y: this.y - 36,
            alpha: 0,
            duration: 700,
            ease: 'Quad.easeOut',
            onComplete: () => t.destroy(),
        });
    }

    /** Visual acknowledgement that this element just gained an upgrade level. */
    celebrate() {
        if (!this.alive) return;
        this._buildPips();

        const ring = this.scene.add.circle(this.x, this.y, 12, this.data.color, 0);
        ring.setStrokeStyle(2, this.data.color, 0.9).setDepth(27);
        this.scene.tweens.add({
            targets: ring,
            scaleX: 3.4, scaleY: 3.4,
            alpha: 0,
            duration: 520,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
        });
    }

    /** One small dot per upgrade level bought for this temple's element. */
    _buildPips() {
        for (const p of this.pips) p.destroy();
        this.pips = [];
        if (!this.alive) return;

        const total = this.scene.templeSystem
            ? this.scene.templeSystem.totalLevels(this.element)
            : 0;
        if (total === 0) return;

        const shown = Math.min(total, 8);
        const startX = this.x - ((shown - 1) * 3) / 2;
        for (let i = 0; i < shown; i++) {
            const dot = this.scene.add.circle(startX + i * 3, this.y - 20, 1, 0xFFD54F, 1);
            dot.setDepth(27);
            this.pips.push(dot);
        }
    }

    setFusionHint(value) {
        if (this.fusionHint === value) return;
        this.fusionHint = value;
        this._applyTint();
    }

    /**
     * Single owner of the sprite tint, so the two states cannot clobber each
     * other. Being shut outranks being fusable: a dark temple that is also
     * glowing gold reads as neither.
     */
    _applyTint() {
        if (!this.alive || !this.sprite) return;
        if (this.disabled) this.sprite.setTint(0x4a4a5e);
        else this.sprite.clearTint();
    }

    destroy() {
        this.alive = false;
        for (const p of this.pips) p.destroy();
        this.pips = [];
        if (this.field) { this.field.destroy(); this.field = null; }
        if (this.glow) { this.glow.destroy(); this.glow = null; }
        if (this.sprite) { this.sprite.destroy(); this.sprite = null; }
    }
}
