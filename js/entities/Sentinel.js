import * as Phaser from 'phaser';
import { HERO_SLASH_KEY } from '../data/HeroLook.js';
import { safeTexture } from '../systems/TextureGuard.js';
import { audio } from '../systems/AudioSystem.js';

// ── Movement ─────────────────────────────────────────
// Faster than a golem (32) or a slime (55), slower than a specter (85): they
// can run down what they were called for, but not everything on the map.
const SPEED = 70;
/** How far they look for something to fight. */
const AGGRO = 130;
/** How far from where they were called they will chase before giving up. */
const LEASH = 170;
/** Where they stand relative to what they fight — inside the enemy's hold reach (22). */
const ENGAGE = 15;
/** Personal space between sentinels, so three never stack into one sprite. */
const SPACING = 13;
/** ms to turn the current velocity toward the wanted one: the "weight" of the walk. */
const STEER_MS = 140;
/** How often the target is reconsidered. Every frame would make them jitter between two. */
const RETHINK_MS = 250;

/**
 * CENTINELA ARCANO — one of the three soldiers the CENTINELAS spell calls up.
 *
 * Built to sit inside rules the game already has rather than invent new ones:
 *   · Enemies engage it with the same rule they use on Vesper (Enemy.update),
 *     except that a sentinel holds only one enemy at a time.
 *   · It goes out with a burst either way — killed or timed out — so the
 *     soldiers the player paid for are never simply gone.
 *
 * It moves freely, like Vesper, not along the road. Called onto the grass in
 * front of a temple it intercepts the golem walking to it; once that golem is
 * dead it goes looking for the next enemy nearby — preferring one no other
 * sentinel is already on — and when there is nothing left within its leash it
 * drifts back to its place in the triangle where it was summoned.
 *
 * `scene.sentinels` is the list; GameScene updates and culls it.
 */
export class Sentinel {
    constructor(scene, x, y, spell, slot = { x: 0, y: 0 }) {
        this.scene = scene;
        this.spell = spell;
        this.alive = true;

        // Where it was called, and its own spot in the triangle around it
        this.rallyX = x - slot.x;
        this.rallyY = y - slot.y;
        this.slot = slot;

        this.posX = x;
        this.posY = y;
        this.vx = 0;
        this.vy = 0;
        this.lunge = { x: 0, y: 0 };

        this.maxHp = spell.hp;
        this.hp = spell.hp;
        this.life = spell.lifeMs;
        this.attackTimer = spell.attackMs * Math.random();
        this.hasteTimer = 0;
        this.rethink = 0;
        this.target = null;
        /** The one enemy holding it, set by that enemy (Enemy._fightSentinel). */
        this.holding = null;
        this.bob = Math.random() * Math.PI * 2;

        this.shadow = scene.add.ellipse(x, y + 9, 12, 4, 0x000000, 0.3).setDepth(18);
        this.sprite = scene.add.image(x, y, safeTexture(scene, 'sentinel', 'mana_mote'))
            .setDepth(19 + y * 0.001);

        // Health bar, the same shape as Vesper's, smaller
        this.hpBg = scene.add.rectangle(x, y - 15, 16, 3, 0x1a1a1a, 0.8)
            .setStrokeStyle(1, 0x333333).setDepth(21);
        this.hpFill = scene.add.rectangle(x, y - 15, 14, 1, 0x7FE7FF).setDepth(22);

        // Materialise: from a sliver of light to full size
        this.sprite.setScale(0.2, 1.6).setAlpha(0);
        scene.tweens.add({
            targets: this.sprite, scaleX: 1, scaleY: 1, alpha: 1,
            duration: 260, ease: 'Back.easeOut',
        });
    }

    get x() { return this.posX; }
    get y() { return this.posY; }

    update(delta) {
        if (!this.alive) return;

        this.life -= delta;
        if (this.life <= 0) { this._expire(); return; }
        if (this.hasteTimer > 0) this.hasteTimer -= delta;

        this._think(delta);
        this._move(delta);
        this._fight(delta);
        this._sync(delta);
    }

    // ─── Deciding ───────────────────────────────────────
    _think(delta) {
        // Held by an enemy: that is the fight, nothing to decide
        if (this.holding && this.holding.alive) { this.target = this.holding; return; }

        this.rethink -= delta;
        if (this.rethink > 0 && this.target && this.target.alive) return;
        this.rethink = RETHINK_MS;

        let best = null;
        let bestScore = Infinity;
        for (const e of this.scene.enemies) {
            if (!e.alive) continue;
            const d = Phaser.Math.Distance.Between(this.posX, this.posY, e.x, e.y);
            if (d > AGGRO) continue;
            if (Phaser.Math.Distance.Between(this.rallyX, this.rallyY, e.x, e.y) > LEASH) continue;
            // Spread out: an enemy another sentinel is already on costs extra,
            // so three of them split three ways when there are three to take.
            const taken = this.scene.sentinels.some(s => s !== this && s.alive && s.target === e);
            const score = d + (taken ? 60 : 0);
            if (score < bestScore) { best = e; bestScore = score; }
        }
        this.target = best;
    }

    // ─── Moving ─────────────────────────────────────────
    _move(delta) {
        const dt = delta / 1000;
        let gx;
        let gy;
        let stopAt;

        if (this.target && this.target.alive) {
            // The spot ENGAGE px short of the enemy, on this sentinel's side of it
            const dx = this.posX - this.target.x;
            const dy = this.posY - this.target.y;
            const d = Math.hypot(dx, dy) || 1;
            gx = this.target.x + (dx / d) * ENGAGE;
            gy = this.target.y + (dy / d) * ENGAGE;
            stopAt = 2;
        } else {
            gx = this.rallyX + this.slot.x;
            gy = this.rallyY + this.slot.y;
            stopAt = 3;
        }

        // Arrive, don't overshoot: full speed far away, easing in over the last 24px
        let wx = gx - this.posX;
        let wy = gy - this.posY;
        const dist = Math.hypot(wx, wy);
        const speed = dist <= stopAt ? 0 : SPEED * Math.min(1, dist / 24);
        if (dist > 0) { wx = (wx / dist) * speed; wy = (wy / dist) * speed; }

        // Keep apart from the other sentinels
        for (const s of this.scene.sentinels) {
            if (s === this || !s.alive) continue;
            const sx = this.posX - s.posX;
            const sy = this.posY - s.posY;
            const sd = Math.hypot(sx, sy);
            if (sd > 0 && sd < SPACING) {
                const push = (SPACING - sd) / SPACING * SPEED;
                wx += (sx / sd) * push;
                wy += (sy / sd) * push;
            }
        }

        // Held in a fight: plant the feet
        if (this.holding && this.holding.alive) { wx *= 0.15; wy *= 0.15; }

        const k = Math.min(1, delta / STEER_MS);
        this.vx += (wx - this.vx) * k;
        this.vy += (wy - this.vy) * k;
        this.posX = Phaser.Math.Clamp(this.posX + this.vx * dt, 8, this.scene.gridSystem.worldWidth - 8);
        this.posY = Phaser.Math.Clamp(this.posY + this.vy * dt, 10, this.scene.gridSystem.worldHeight - 8);
    }

    // ─── Fighting ───────────────────────────────────────
    _fight(delta) {
        const rate = this.spell.attackMs / (this.hasteTimer > 0 ? 1.3 : 1);
        this.attackTimer -= delta;
        if (this.attackTimer > 0) return;

        const t = this.target;
        if (t && t.alive && Phaser.Math.Distance.Between(this.posX, this.posY, t.x, t.y) <= this.spell.attackRange) {
            this._strike(t);
            this.attackTimer = rate;
        } else {
            this.attackTimer = 0;
        }
    }

    _strike(enemy) {
        const dx = enemy.x - this.posX;
        const dy = enemy.y - this.posY;

        enemy.takeDamage(this.spell.damage);

        // Vesper's slash, cooled to the blade's colour and scaled down to it
        const ang = Math.atan2(dy, dx);
        const s = this.scene.add.image(
            this.posX + Math.cos(ang) * 8, this.posY + Math.sin(ang) * 8 - 2, HERO_SLASH_KEY
        ).setDepth(21).setRotation(ang).setScale(0.5).setTint(0x7FE7FF).setAlpha(0.95);
        this.scene.tweens.add({
            targets: s, scaleX: 0.8, scaleY: 0.75, alpha: 0, duration: 160,
            ease: 'Quad.easeOut', onComplete: () => s.destroy(),
        });

        // A lunge into the blow — an offset, so it never fights the walk
        this.scene.tweens.add({
            targets: this.lunge, x: dx * 0.18, y: dy * 0.18,
            duration: 60, yoyo: true, onComplete: () => { this.lunge.x = 0; this.lunge.y = 0; },
        });
    }

    // ─── Drawing ────────────────────────────────────────
    _sync(delta) {
        const moving = Math.hypot(this.vx, this.vy);

        // Hovering, not standing — and bobbing quicker while it travels
        this.bob += delta * (0.006 + moving * 0.00012);
        const floatY = -2 + Math.sin(this.bob) * 1.5;

        // Face what it fights, or where it is going
        const faceX = this.target && this.target.alive ? this.target.x - this.posX : this.vx;
        if (Math.abs(faceX) > 1) this.sprite.setFlipX(faceX < 0);

        // Leans into the walk
        this.sprite.setRotation(Phaser.Math.Clamp(this.vx * 0.004, -0.2, 0.2));
        this.sprite.setPosition(this.posX + this.lunge.x, this.posY + floatY + this.lunge.y);
        this.sprite.setDepth(19 + this.posY * 0.001);
        this.shadow.setPosition(this.posX, this.posY + 9).setScale(1 - 0.08 * Math.sin(this.bob));

        // Fades in its last two seconds, so the end is never a surprise
        if (this.life < 2000) this.sprite.setAlpha(0.45 + 0.55 * Math.abs(Math.sin(this.life * 0.01)));

        const pct = Math.max(0, this.hp / this.maxHp);
        const barY = this.posY + floatY - 13;
        this.hpBg.setPosition(this.posX, barY);
        this.hpFill.width = 14 * pct;
        this.hpFill.setPosition(this.posX - (14 * (1 - pct)) / 2, barY);
    }

    takeDamage(amount) {
        if (!this.alive) return;
        this.hp -= amount;
        this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        this.scene.time.delayedCall(60, () => {
            if (!this.alive) return;
            this.sprite.setTintMode(Phaser.TintModes.MULTIPLY);
            this.sprite.clearTint();
        });
        if (this.hp <= 0) this._expire();
    }

    heal(fraction) {
        if (!this.alive) return 0;
        const before = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * fraction);
        return this.hp - before;
    }

    haste(ms) {
        if (this.alive) this.hasteTimer = Math.max(this.hasteTimer, ms);
    }

    /** Killed or timed out: either way it goes as a burst of the light it was made of. */
    _expire() {
        if (!this.alive) return;
        this.alive = false;
        this.holding = null;
        this.target = null;

        const { burstRadius, burstDamage } = this.spell;
        const x = this.posX;
        const y = this.posY;

        for (const e of this.scene.enemies) {
            if (!e.alive) continue;
            if (Phaser.Math.Distance.Between(x, y, e.x, e.y) <= burstRadius) e.takeDamage(burstDamage);
        }

        audio.play('hit');
        const ring = this.scene.add.circle(x, y, 6, 0x7FE7FF, 0.25)
            .setStrokeStyle(2, 0xB388FF, 0.9).setDepth(23);
        this.scene.tweens.add({
            targets: ring, scale: burstRadius / 6, alpha: 0, duration: 320,
            ease: 'Quad.easeOut', onComplete: () => ring.destroy(),
        });
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const f = this.scene.add.rectangle(x, y - 4, 2, 2, i % 2 ? 0x7FE7FF : 0xB388FF).setDepth(23);
            this.scene.tweens.add({
                targets: f, x: x + Math.cos(a) * 18, y: y - 4 + Math.sin(a) * 12, alpha: 0,
                duration: 360, ease: 'Quad.easeOut', onComplete: () => f.destroy(),
            });
        }

        this.destroy();
    }

    destroy() {
        this.alive = false;
        this.sprite.destroy();
        this.shadow.destroy();
        this.hpBg.destroy();
        this.hpFill.destroy();
    }
}
