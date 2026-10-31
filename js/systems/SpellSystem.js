import * as Phaser from 'phaser';
import { SPELLS, SPELL_ORDER } from '../data/SpellData.js';
import { SOUL, MARBLE } from '../data/Palette.js';
import { audio } from './AudioSystem.js';
import { TILE } from './GridSystem.js';
import { Sentinel } from '../entities/Sentinel.js';

/**
 * Casting, cooldowns, and the show each spell puts on.
 *
 * ── Where the line is ────────────────────────────────────
 * This owns the *rules* (can you afford it, is it charged, is the hero alive)
 * and the *performance* (the moon, the rings, the impact). It owns no state the
 * hero needs and touches no entity except through their public methods, so a
 * spell can never leave an enemy or the hero in a state the rest of the game
 * does not already know how to handle.
 *
 * ── Why the animation lives here and not in the hero art ─
 * The hand-drawn strip has four walk frames and nothing else — no cast pose, and
 * adding one means a human drawing it. So the spell animates *around* Vesper
 * instead of animating Vesper: the light he has been keeping wraps him, leaves,
 * and comes back down out of the sky. That reads as a cast, costs no new art,
 * and is the one place in this game where procedural drawing is clearly the
 * right tool — a moon falling is a tween, not a sprite sheet.
 */

/** Why a cast was refused. The UI says these back in the player's words. */
export const REFUSAL = {
    DEAD: 'dead',
    COOLING: 'cooling',
    MANA: 'mana',
    ROAD: 'road',
};

const REFUSAL_TEXT = {
    [REFUSAL.DEAD]: 'Vesper no esta',
    [REFUSAL.COOLING]: 'todavia no',
    [REFUSAL.MANA]: 'falta ✦',
    [REFUSAL.ROAD]: 'solo sobre el camino',
};

export class SpellSystem {
    constructor(scene) {
        this.scene = scene;

        /** Remaining cooldown per spell, in scaled ms — so a cast at double game
         *  speed also recharges at double speed. */
        this.cooldown = {};
        for (const key of SPELL_ORDER) this.cooldown[key] = 0;

        // VFX pinned to the hero for the length of a channel. Kept as a list
        // rather than parented to the sprite so nothing a tween does to these
        // can ever touch the hero's own transform.
        this._attached = [];
    }

    // ─── Rules ──────────────────────────────────────────
    update(delta) {
        for (const key of SPELL_ORDER) {
            if (this.cooldown[key] > 0) {
                this.cooldown[key] = Math.max(0, this.cooldown[key] - delta);
            }
        }

        const hero = this.scene.hero;
        for (let i = this._attached.length - 1; i >= 0; i--) {
            const a = this._attached[i];
            if (!a.obj.active) { this._attached.splice(i, 1); continue; }
            // The hero dying mid-channel takes the light with him
            if (!hero || hero.isDead) { a.obj.destroy(); this._attached.splice(i, 1); continue; }
            a.obj.x = hero.x + a.dx;
            a.obj.y = hero.y + a.dy;
        }
    }

    /** A spell's recharge for this run: the table's, cut by CANAL FLUIDO. */
    cooldownOf(key) {
        const s = SPELLS[key];
        if (!s) return 0;
        return Math.round(s.cooldown * (this.scene.talents?.spellCooldownMult ?? 1));
    }

    /** Luna's hit for this run (LUNA LLENA raises it). */
    lunaDamage() {
        return Math.round(SPELLS.luna.damage * (this.scene.talents?.lunaDamageMult ?? 1));
    }

    /** How many soldiers CENTINELAS calls this run (CUARTO CENTINELA adds one). */
    sentinelCount() {
        return SPELLS.centinelas.count + (this.scene.talents?.sentinelBonus ?? 0);
    }

    /** 0 → ready, 1 → just cast. Drives the cooldown wipe in the UI. */
    cooldownPct(key) {
        const total = this.cooldownOf(key);
        if (!total) return 0;
        return Phaser.Math.Clamp(this.cooldown[key] / total, 0, 1);
    }

    cooldownSeconds(key) {
        return Math.ceil((this.cooldown[key] ?? 0) / 1000);
    }

    /**
     * `null` when the spell can be cast, otherwise the first thing standing in
     * the way. Ordered by what the player can do about it soonest: a dead hero
     * and a cooling spell both fix themselves, a missing 40✦ does not.
     */
    refusal(key) {
        const s = SPELLS[key];
        if (!s) return REFUSAL.COOLING;
        const hero = this.scene.hero;
        if (!hero || hero.isDead) return REFUSAL.DEAD;
        if (this.cooldown[key] > 0) return REFUSAL.COOLING;
        if (this.scene.economySystem.mana < s.cost) return REFUSAL.MANA;
        return null;
    }

    canCast(key) {
        return this.refusal(key) === null;
    }

    /**
     * Says why a spell cannot be cast, over the hero — where the player is
     * already looking — and returns true if it said anything.
     *
     * Public because the refusal has to happen when the spell is *armed*, not
     * when it is aimed: letting the player pick a target for a spell they
     * cannot pay for and only refusing on the click reads as a broken button.
     */
    announceRefusal(key) {
        const why = this.refusal(key);
        if (!why) return false;

        audio.play('deny');
        const hero = this.scene.hero;
        if (this.scene.floating && hero) {
            this.scene.floating.show(hero.x, hero.y - 26, REFUSAL_TEXT[why], {
                color: '#FF8A80', size: 7, rise: 16,
            });
        }
        return true;
    }

    /**
     * Whether this spell may land on (x, y). Separate from refusal() because it
     * is about the point, not the caster: the cursor asks it on every move, and
     * a bad point keeps the spell armed rather than spending the click.
     */
    targetRefusal(key, x, y) {
        const s = SPELLS[key];
        if (!s?.roadOnly) return null;
        const { col, row } = this.scene.gridSystem.worldToGrid(x, y);
        return this.scene.gridSystem.grid[row]?.[col] === TILE.PATH ? null : REFUSAL.ROAD;
    }

    /** Says a target refusal over the point itself. */
    announceTargetRefusal(key, x, y) {
        const why = this.targetRefusal(key, x, y);
        if (!why) return false;
        audio.play('deny');
        if (this.scene.floating) {
            this.scene.floating.show(x, y - 14, REFUSAL_TEXT[why], { color: '#FF8A80', size: 7, rise: 14 });
        }
        return true;
    }

    /**
     * Fire a spell at a point. Returns false — and says why, where the player is
     * looking — when it cannot, so the button and the hotkey never have to
     * duplicate the check.
     */
    cast(key, x, y) {
        const spell = SPELLS[key];
        const perform = spell && this._performer(key);
        if (!perform) return false;

        if (this.announceRefusal(key)) return false;
        if (this.announceTargetRefusal(key, x, y)) return false;

        // Checked above, but spendMana is the one that actually moves the
        // number — going through it keeps the 'mana-changed' event honest.
        if (!this.scene.economySystem.spendMana(spell.cost)) return false;

        this.cooldown[key] = this.cooldownOf(key);
        perform.call(this, spell, x, y);
        this.scene.events.emit('spell-cast', key, x, y);
        return true;
    }

    /** key → the routine that plays it. A new spell adds one line here. */
    _performer(key) {
        if (key === 'luna') return this._castLuna;
        if (key === 'centinelas') return this._castCentinelas;
        if (key === 'egida') return this._castEgida;
        return null;
    }

    /**
     * A tween duration that keeps step with the game clock.
     *
     * Phaser's tweens run off their own timeline and know nothing about
     * `time.timeScale`, which is what the VEL 2x button drives. Everywhere else
     * in this game that mismatch is invisible — a dash ghost fading at the wrong
     * speed is nobody's problem. In a spell it is: the beats are scheduled on the
     * clock, so at double speed an unscaled fall would still be in the air when
     * the moon has already landed.
     */
    _vfxMs(ms) {
        return ms / (this.scene.time.timeScale || 1);
    }

    // ─── LUNA ───────────────────────────────────────────
    /**
     * Three beats, and they are the three the player asked for out loud:
     * Vesper wraps himself in a moon, a moon falls out of the sky, it lands.
     *
     * Scheduled on `scene.time` rather than with raw timers so the whole cast
     * speeds up with the VEL 2x toggle, like every other clock in the game.
     */
    _castLuna(spell, x, y) {
        const scene = this.scene;
        const hero = scene.hero;

        hero.lookAt(x, y);
        hero.channel(spell.channelMs + spell.fallMs);
        audio.play('cast');

        this._wrapHero(spell);
        this._markTarget(spell, x, y);

        scene.time.delayedCall(spell.channelMs, () => this._dropMoon(spell, x, y));
    }

    /**
     * Beat one: two rings of kept light close onto the hero, turning opposite
     * ways. Counter-rotation is doing real work — one ring reads as a flat disc
     * lying on the floor, two crossing ones read as a sphere being formed.
     */
    _wrapHero(spell) {
        const scene = this.scene;
        const hero = scene.hero;

        for (const [spin, delay, from] of [[1, 0, 3.1], [-1, 90, 2.3]]) {
            const ring = scene.add.image(hero.x, hero.y - 3, 'spell_moon_ring')
                .setDepth(21)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setAlpha(0)
                .setScale(from);
            this._attached.push({ obj: ring, dx: 0, dy: -3 });

            scene.tweens.add({
                targets: ring,
                scale: 0.9,
                alpha: 0.9,
                angle: spin * 200,
                duration: this._vfxMs(spell.channelMs),
                delay: this._vfxMs(delay),
                ease: 'Quad.easeIn',
                onComplete: () => {
                    // The light does not fade, it leaves: the rings snap outward
                    // and vanish on the frame the moon is called.
                    scene.tweens.add({
                        targets: ring,
                        scale: 2.2,
                        alpha: 0,
                        duration: this._vfxMs(200),
                        ease: 'Quad.easeOut',
                        onComplete: () => ring.destroy(),
                    });
                },
            });
        }

        // Motes of the same violet the lantern holds, spiralling in. Cheap, and
        // it is what ties the spell to the resource it just spent.
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            const d = 22 + Math.random() * 12;
            const fleck = scene.add.rectangle(
                hero.x + Math.cos(a) * d, hero.y + Math.sin(a) * d - 3,
                2, 2, i % 3 === 0 ? MARBLE.glow : SOUL.light,
            ).setDepth(22).setBlendMode(Phaser.BlendModes.ADD);

            scene.tweens.add({
                targets: fleck,
                x: hero.x, y: hero.y - 3,
                alpha: 0.2,
                duration: this._vfxMs(spell.channelMs * (0.6 + Math.random() * 0.4)),
                ease: 'Quad.easeIn',
                onComplete: () => fleck.destroy(),
            });
        }
    }

    /**
     * Beat two, part one: where it is going to land, said before it lands.
     *
     * A ring on the ground and a shadow that tightens as the moon comes down.
     * The shadow is the honest part — it is the only cue that reads without
     * looking up, and the player is watching the lane, not the sky.
     */
    _markTarget(spell, x, y) {
        const scene = this.scene;
        const total = spell.channelMs + spell.fallMs;

        const ring = scene.add.circle(x, y, spell.radius, spell.color, 0.05)
            .setStrokeStyle(1, spell.color, 0.4)
            .setDepth(2);
        scene.tweens.add({
            targets: ring, alpha: 0.9, duration: this._vfxMs(160), yoyo: true, repeat: 2,
            onComplete: () => {
                scene.tweens.add({
                    targets: ring, scaleX: 1.1, scaleY: 1.1, alpha: 0,
                    duration: this._vfxMs(220), onComplete: () => ring.destroy(),
                });
            },
        });

        const shade = scene.add.ellipse(x, y + 2, spell.radius * 2.1, spell.radius * 0.8, 0x000000, 0.05)
            .setDepth(2);
        scene.tweens.add({
            targets: shade,
            scaleX: 0.42, scaleY: 0.42, fillAlpha: 0.42,
            duration: this._vfxMs(total),
            ease: 'Quad.easeIn',
            onComplete: () => shade.destroy(),
        });
    }

    /** Beat two, part two: it actually comes down. */
    _dropMoon(spell, x, y) {
        const scene = this.scene;

        const startY = Math.min(y - 210, -40);
        const drop = (y - 6) - startY;
        const startX = x - drop * Math.tan(Phaser.Math.DegToRad(spell.fallAngle || 0));

        const moon = scene.add.image(startX, startY, 'spell_moon')
            .setDepth(24)
            .setScale(0.45)
            .setAlpha(0.95);

        scene.tweens.add({
            targets: moon,
            x,
            y: y - 6,
            scale: 1.25,
            duration: this._vfxMs(spell.fallMs),
            ease: 'Quad.easeIn',
        });

        // The hit is scheduled on the clock, not hung off the tween that draws
        // the fall. Two reasons, and the first one is the serious one: the maná
        // is already spent, so the damage cannot be allowed to depend on a
        // tween completing. The second is that the clock is the thing VEL 2x
        // speeds up — see _vfxMs for how the visual is kept in step with it.
        scene.time.delayedCall(spell.fallMs, () => {
            this._impact(spell, x, y);
            // It does not bounce and it does not sit there: it breaks into the
            // light it was made of.
            scene.tweens.add({
                targets: moon,
                scale: 1.9,
                alpha: 0,
                duration: this._vfxMs(260),
                ease: 'Quad.easeOut',
                onComplete: () => moon.destroy(),
            });
        });
    }

    /** Beat three: what the moon actually does when it gets there. */
    _impact(spell, x, y) {
        const scene = this.scene;

        audio.play('moon');
        scene.cameras.main.shake(240, 0.009);

        const flash = scene.add.circle(x, y, spell.radius * 0.5, 0xffffff, 0.5)
            .setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
            targets: flash, scale: 2.2, alpha: 0, duration: 300,
            ease: 'Quad.easeOut', onComplete: () => flash.destroy(),
        });

        const wave = scene.add.circle(x, y, spell.radius * 0.3, spell.color, 0.12)
            .setStrokeStyle(3, spell.color, 0.9)
            .setDepth(3);
        scene.tweens.add({
            targets: wave,
            scaleX: spell.radius / (spell.radius * 0.3),
            scaleY: spell.radius / (spell.radius * 0.3),
            alpha: 0,
            duration: 420,
            ease: 'Quad.easeOut',
            onComplete: () => wave.destroy(),
        });

        // Ash thrown off the rim, so the ground reads as having been hit
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2 + Math.random();
            const fleck = scene.add.rectangle(x, y, 2, 1, i % 3 === 0 ? SOUL.light : MARBLE.mid)
                .setDepth(23);
            scene.tweens.add({
                targets: fleck,
                x: x + Math.cos(a) * spell.radius * (0.5 + Math.random() * 0.5),
                y: y + Math.sin(a) * spell.radius * 0.45 - Math.random() * 12,
                alpha: 0,
                duration: 420 + Math.random() * 260,
                ease: 'Quad.easeOut',
                onComplete: () => fleck.destroy(),
            });
        }

        let hits = 0;
        for (const enemy of scene.enemies) {
            if (!enemy.alive) continue;
            const d = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
            if (d > spell.radius) continue;
            enemy.takeDamage(this.lunaDamage());
            enemy.applySlow(spell.slow, spell.slowDuration);
            hits++;
        }

        // Spending 120✦ on empty grass should say so, the same way a quake does.
        if (hits === 0 && scene.floating) {
            scene.floating.show(x, y - 26, 'sin blancos', {
                color: '#78909C', size: 7, rise: 16,
            });
        }
    }

    // ─── CENTINELAS ─────────────────────────────────────
    /**
     * A rune flashes where the player points — road or grass — and three
     * soldiers step out of it in a triangle. From there they hunt on their own
     * (see Sentinel): onto the grass in front of a temple to catch a golem on
     * its way to it, then on to whatever else is near.
     */
    _castCentinelas(spell, x, y) {
        const scene = this.scene;
        const hero = scene.hero;
        const at = { x, y };

        hero.lookAt(at.x, at.y);
        hero.channel(spell.channelMs);
        audio.play('cast');

        this._rune(at.x, at.y, spell.color);

        scene.time.delayedCall(spell.channelMs, () => {
            audio.play('summon');
            if (!scene.sentinels) scene.sentinels = [];
            // A triangle of three; with CUARTO CENTINELA, a square of four.
            const n = this.sentinelCount();
            const formation = n >= 4
                ? [[-9, -8], [9, -8], [-9, 8], [9, 8]]
                : [[0, -10], [-10, 7], [10, 7]];
            for (const [dx, dy] of formation.slice(0, n)) {
                scene.sentinels.push(new Sentinel(scene, at.x + dx, at.y + dy, spell, { x: dx, y: dy }));
            }
        });
    }

    /** The runic flash a summon steps out of: a turning sigil, a ring, a flare. */
    _rune(x, y, color) {
        const scene = this.scene;
        const sigil = scene.add.rectangle(x, y, 22, 22, color, 0.08)
            .setStrokeStyle(1, color, 0.9).setAngle(45).setDepth(3);
        const ring = scene.add.circle(x, y, 14, color, 0).setStrokeStyle(1, SOUL.light, 0.8).setDepth(3);
        scene.tweens.add({
            targets: sigil, angle: 135, scale: 1.25, alpha: 0,
            duration: this._vfxMs(620), ease: 'Quad.easeOut', onComplete: () => sigil.destroy(),
        });
        scene.tweens.add({
            targets: ring, scale: 1.8, alpha: 0,
            duration: this._vfxMs(520), ease: 'Quad.easeOut', onComplete: () => ring.destroy(),
        });
        const flare = scene.add.rectangle(x, y - 10, 3, 28, 0xffffff, 0.8)
            .setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
            targets: flare, scaleX: 0.2, alpha: 0,
            duration: this._vfxMs(380), ease: 'Quad.easeIn', onComplete: () => flare.destroy(),
        });
    }

    // ─── EGIDA ──────────────────────────────────────────
    /**
     * A dome of green light settles over the circle. Everything friendly in it
     * is mended or quickened, and each one says so with its own number — a
     * heal nobody can see is a heal nobody plans around.
     */
    _castEgida(spell, x, y) {
        const scene = this.scene;
        const hero = scene.hero;
        const r = spell.radius;
        const inside = (ox, oy) => Phaser.Math.Distance.Between(x, y, ox, oy) <= r;

        hero.lookAt(x, y);
        hero.channel(spell.channelMs);
        audio.play('aegis');
        this._dome(spell, x, y);

        const healed = (who, amount) => {
            if (amount > 0 && scene.floating) {
                scene.floating.show(who.x, who.y - 22, `+${Math.round(amount)}`, {
                    color: spell.colorHex, size: 7, rise: 16,
                });
            }
        };

        if (hero && !hero.isDead && inside(hero.x, hero.y)) {
            healed(hero, hero.heal(spell.heal));
            hero.haste(spell.hasteMs);
        }
        for (const s of scene.sentinels || []) {
            if (!s.alive || !inside(s.x, s.y)) continue;
            healed(s, s.heal(spell.heal));
            s.haste(spell.hasteMs);
        }
        for (const t of scene.towers) {
            if (t.alive && inside(t.x, t.y)) t.haste(spell.hasteMs);
        }

        // Barricades have no health to give back; the breakable blocks do, and
        // every hit they have taken is a step the next enemy does not have to
        // take. Mended to full, not rebuilt — a block that already fell is road.
        for (const [key, hp] of scene.breakableBlocks) {
            const [c, rr] = key.split(',').map(Number);
            const p = scene.gridSystem.gridToWorld(c, rr);
            if (!inside(p.x, p.y)) continue;
            const full = scene.gridSystem.breakableHp(c, rr);
            if (hp >= full) continue;
            scene.breakableBlocks.set(key, full);
            const sprite = scene.decor.get(key);
            if (sprite) {
                sprite.setTint(spell.color);
                scene.time.delayedCall(220, () => { if (sprite.active) sprite.clearTint(); });
            }
        }
    }

    _dome(spell, x, y) {
        const scene = this.scene;
        const r = spell.radius;
        const dome = scene.add.circle(x, y, r, spell.color, 0.16)
            .setStrokeStyle(2, spell.color, 0.9).setDepth(3).setScale(0.2);
        scene.tweens.add({
            targets: dome, scale: 1, duration: this._vfxMs(260), ease: 'Back.easeOut',
            onComplete: () => scene.tweens.add({
                targets: dome, alpha: 0, duration: this._vfxMs(700), delay: this._vfxMs(300),
                onComplete: () => dome.destroy(),
            }),
        });
        // Motes rising out of the ground all over the circle
        for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.sqrt(Math.random()) * r;
            const px = x + Math.cos(a) * d;
            const py = y + Math.sin(a) * d;
            const m = scene.add.rectangle(px, py, 1, 3, i % 3 ? spell.color : 0xffffff).setDepth(22);
            scene.tweens.add({
                targets: m, y: py - 18, alpha: 0,
                duration: this._vfxMs(600 + Math.random() * 400), delay: this._vfxMs(Math.random() * 200),
                ease: 'Sine.easeOut', onComplete: () => m.destroy(),
            });
        }
    }
}
