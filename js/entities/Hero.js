import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../systems/GridSystem.js';
import { HERO_ABILITIES, ABILITY_ORDER, COMBO, comboMultiplier } from '../data/HeroData.js';
import {
    DEFAULT_LOOK, LANTERNS, HERO_GLOW_KEY, HERO_SLASH_KEY, WALK_CYCLE,
    ensureHeroTexture, lanternTierFor,
} from '../data/HeroLook.js';
import { audio } from '../systems/AudioSystem.js';
import { pointerWorld } from '../systems/Viewport.js';

// One sword swing, and how long each walk frame is held. The walk is the
// two-frame cycle in HeroLook (stride, pass), so 145ms a frame puts a full
// cycle just under a third of a second — a walk, not a scurry.
const SWING_MS = 260;
const WALK_FRAME_MS = 145;

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

        // What Vesper currently looks like. A recipe, not a texture key: an
        // upgrade that changes the appearance calls setLook() with the slot it
        // affects, and the sprite for that combination is baked on first use.
        // See HeroLook.js for the slots and the fiction behind them.
        this.look = { ...DEFAULT_LOOK };
        // Which frame of which action is showing. Independent of `look`: the
        // two multiply out in HeroLook rather than here.
        this.pose = 'stand';
        this.walkPhase = 0;
        // Frames left of the current sword swing, in scaled ms. While this runs
        // the walk cycle stands down — one action owns the sprite at a time.
        this.swing = 0;

        this.sprite = scene.add.sprite(pos.x, pos.y, ensureHeroTexture(scene, this.look, 'stand'));
        // 32×32 art at one texel per world pixel, like everything else on the board.
        this.sprite.setScale(1);
        this.sprite.setDepth(20);

        // The lantern's halo. Its own object rather than part of the sprite, so
        // it can breathe on its own clock without rebaking anything.
        this.lanternGlow = scene.add.image(pos.x - 7, pos.y + 4, HERO_GLOW_KEY)
            .setDepth(19.5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);

        this.speed = 155;
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

        // ── Combo state ─────────────────────────
        // Motes picked up inside the window compound. Counted here rather than
        // in the economy because the streak belongs to the hero — a temple's
        // steady drip is precisely the thing it is not.
        this.comboCount = 0;
        this.comboTimer = 0;

        // ── Ability state ───────────────────────
        // Remaining cooldown per ability, in scaled milliseconds — so a cast at
        // double game speed also recharges at double speed.
        this.abilityCd = {};
        for (const key of ABILITY_ORDER) this.abilityCd[key] = 0;
        // Time left in the current cast. While it runs the auto-attack is
        // suppressed: an ability the normal swing talks over is not an ability.
        this.busy = 0;
        this.invuln = 0;
        this.dashing = false;
        this.dashTarget = null;
        this.dashSpeed = 0;

        this.collectField = scene.add.circle(pos.x, pos.y, this.collectRadius, 0xB388FF, 0.05);
        this.collectField.setStrokeStyle(1, 0xB388FF, 0.2);
        this.collectField.setDepth(1);
        this.collectField.setVisible(false);

        // Streak readout, parked over the hero's head while a combo is live.
        this.comboLabel = scene.add.text(pos.x, pos.y - 32, '', {
            fontFamily: '"Press Start 2P"', fontSize: '8px',
            color: '#FFD54F', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(29).setVisible(false);

        this.targetPos = null;
        this.moving = false;

        this.maxHp = 100;
        this.hp = 100;
        this.isDead = false;

        // HP bar
        this.hpBg = scene.add.rectangle(pos.x, pos.y - 21, 26, 4, 0x1a1a1a, 0.8).setDepth(21);
        this.hpBg.setStrokeStyle(1, 0x333333);
        this.hpFill = scene.add.rectangle(pos.x, pos.y - 21, 24, 2, 0x4CAF50).setDepth(22);

        // Move indicator
        this.moveIndicator = scene.add.circle(0, 0, 6, 0xB388FF, 0);
        this.moveIndicator.setStrokeStyle(1, 0xB388FF, 0);
        this.moveIndicator.setDepth(19);
    }

    get x() { return this.posX; }
    get y() { return this.posY; }

    /** Named to match Temple, so one absorption scan can drive both. */
    get absorbRadius() { return this.collectRadius; }

    get comboMult() { return comboMultiplier(this.comboCount); }

    // ─── Appearance ─────────────────────────────────────
    /**
     * Change one or more look slots and swap to the sprite for the result.
     *
     * This is the whole interface a future upgrade needs: add an entry to the
     * relevant table in HeroLook and call `hero.setLook({ blade: 'estrellada' })`.
     * The texture bakes itself the first time that combination appears and is a
     * cache hit forever after, so appearance upgrades cost nothing per frame and
     * nothing in the boot texture list.
     *
     * Tints are reapplied afterwards: setTexture drops nothing, but a dash ghost
     * or a damage flash set mid-swap would otherwise be read off the old sprite.
     */
    setLook(patch) {
        const next = { ...this.look, ...patch };
        const changed = Object.keys(next).some(k => next[k] !== this.look[k]);
        if (!changed || !this.sprite) return false;

        this.look = next;
        this.sprite.setTexture(ensureHeroTexture(this.scene, next, this.pose));
        this._refreshLantern();
        return true;
    }

    /**
     * Show a given animation frame. Cheap enough to call every tick — it bails
     * when the pose has not changed, and the texture behind each (look, pose)
     * is baked once and cached.
     */
    _setPose(pose) {
        if (this.pose === pose || !this.sprite) return;
        this.pose = pose;
        this.sprite.setTexture(ensureHeroTexture(this.scene, this.look, pose));
    }

    /**
     * Picks the frame that matches what Vesper is doing this instant.
     *
     * Order matters: a swing outranks walking, and walking outranks standing.
     * Without this the character slid across the ground with its legs welded
     * together, which is most of what read as "moving backwards".
     */
    _animate(delta) {
        if (this.isDead) return;

        if (this.swing > 0) {
            this.swing -= delta;
            // Wind-up for the first third, the strike for the rest: a swing
            // that spends equal time in both halves reads as a slow wave.
            this._setPose(this.swing > SWING_MS * 0.62 ? 'windUp' : 'strike');
            if (this.swing <= 0) this.walkPhase = 0;
            return;
        }

        if (this.moving || this.dashing) {
            this.walkPhase += delta;
            const frame = Math.floor(this.walkPhase / WALK_FRAME_MS) % WALK_CYCLE.length;
            this._setPose(WALK_CYCLE[frame]);
        } else {
            this.walkPhase = 0;
            this._setPose('stand');
        }
    }

    /**
     * The lantern reports the collection streak. Vesper carries the maná that
     * has been drunk and not yet banked, so the character itself is the combo
     * readout — the number over the head is the redundant copy, not this.
     */
    _refreshLantern() {
        if (!this.lanternGlow) return;
        const l = LANTERNS[this.look.lantern] ?? LANTERNS.apagado;
        this.scene.tweens.add({
            targets: this.lanternGlow,
            alpha: this.isDead ? 0 : l.glow,
            scaleX: l.radius ? l.radius / 9 : 0.3,
            scaleY: l.radius ? l.radius / 9 : 0.3,
            duration: 220,
            ease: 'Quad.easeOut',
        });
    }

    // ─── Abilities ──────────────────────────────────────
    /** 0 → ready, 1 → just cast. Drives the cooldown wipe in the UI. */
    cooldownPct(key) {
        const a = HERO_ABILITIES[key];
        if (!a) return 0;
        return Phaser.Math.Clamp(this.abilityCd[key] / a.cooldown, 0, 1);
    }

    cooldownSeconds(key) {
        return Math.ceil((this.abilityCd[key] ?? 0) / 1000);
    }

    isReady(key) {
        return !this.isDead && this.busy <= 0 && (this.abilityCd[key] ?? 0) <= 0;
    }

    /**
     * Fire an ability. Returns false — and complains — when it cannot, so the
     * keyboard and the sidebar button never have to duplicate the check.
     */
    useAbility(key) {
        const a = HERO_ABILITIES[key];
        if (!a) return false;
        if (!this.isReady(key)) {
            audio.play('deny');
            return false;
        }

        if (key === 'dash') this._castDash(a);
        else if (key === 'quake') this._castQuake(a);
        else return false;

        this.abilityCd[key] = a.cooldown;
        this.busy = a.castTime;
        this.scene.events.emit('hero-ability', key);
        return true;
    }

    /**
     * A burst toward the cursor. Deliberately not toward the move target: the
     * point of a dash is reacting to where the trouble is right now, which is
     * where you are already looking.
     */
    _castDash(a) {
        // Through the camera: the canvas is a supersampled buffer, so the raw
        // pointer is in a space several times larger than the world.
        const raw = this.scene.input.activePointer;
        const p = raw ? pointerWorld(this.scene, raw) : null;
        let dx = (p ? p.x : this.posX + (this.sprite.flipX ? -1 : 1) * 50) - this.posX;
        let dy = (p ? p.y : this.posY) - this.posY;

        // Pointer parked on the sidebar, or exactly on the hero: fall back to
        // whichever way he is facing rather than dashing nowhere.
        if (Math.abs(dx) + Math.abs(dy) < 4) {
            dx = this.sprite.flipX ? -1 : 1;
            dy = 0;
        }

        const len = Math.hypot(dx, dy) || 1;
        const reach = Math.min(a.range, Math.max(60, len));

        this.dashTarget = {
            x: Phaser.Math.Clamp(this.posX + (dx / len) * reach, 10, GAME_WIDTH - 10),
            y: Phaser.Math.Clamp(this.posY + (dy / len) * reach, 12, GAME_HEIGHT - 10),
        };
        this.dashing = true;
        this.dashSpeed = (reach / a.castTime) * 1000;
        this.invuln = a.castTime + a.invulnExtra;

        // A queued walk order would resume mid-dash and drag him back.
        this.moving = false;
        this.targetPos = null;

        audio.play('dash');
        this._dashTrail(a.color);
    }

    _dashTrail(color) {
        for (let i = 0; i < 4; i++) {
            // Off the live texture, not a fixed key: the trail has to be
            // whatever Vesper looks like right now.
            const ghost = this.scene.add.sprite(this.posX, this.posY, this.sprite.texture.key)
                .setScale(1).setDepth(18).setAlpha(0.45).setTint(color);
            ghost.flipX = this.sprite.flipX;
            this.scene.tweens.add({
                targets: ghost,
                alpha: 0,
                duration: 260,
                delay: i * 45,
                onComplete: () => ghost.destroy(),
            });
        }
    }

    /** Ground slam: damage plus a slow in a ring around the hero. */
    _castQuake(a) {
        audio.play('quake');
        this.scene.cameras.main.shake(180, 0.006);

        const ring = this.scene.add.circle(this.posX, this.posY, a.radius * 0.35, a.color, 0.18);
        ring.setStrokeStyle(3, a.color, 0.9).setDepth(3);
        this.scene.tweens.add({
            targets: ring,
            scaleX: a.radius / (a.radius * 0.35),
            scaleY: a.radius / (a.radius * 0.35),
            alpha: 0,
            duration: 380,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
        });

        let hits = 0;
        for (const enemy of this.scene.enemies) {
            if (!enemy.alive) continue;
            const d = Phaser.Math.Distance.Between(this.posX, this.posY, enemy.x, enemy.y);
            if (d > a.radius) continue;
            enemy.takeDamage(a.damage);
            enemy.applySlow(a.slow, a.slowDuration);
            hits++;
        }

        if (hits === 0 && this.scene.floating) {
            this.scene.floating.show(this.posX, this.posY - 26, 'sin blancos', {
                color: '#78909C', size: 7, rise: 16,
            });
        }
    }

    // ─── Life force ─────────────────────────────────────
    /**
     * A mote finished its flight into the hero. Credited at face value times
     * whatever the current streak is worth: the refining bonus is what a temple
     * is for, and the combo is what the hero has instead of one.
     */
    absorbMote(value) {
        this.comboCount = this.comboTimer > 0 ? this.comboCount + 1 : 1;
        this.comboTimer = COMBO.window;

        const mult = this.comboMult;
        const gained = Math.round(value * mult);
        const bonus = gained - value;

        this.manaCollected += gained;
        this.scene.events.emit('mana-collected', gained);
        this.scene.events.emit('hero-collected', gained);
        if (this.comboCount > 1) {
            this.scene.events.emit('hero-combo', this.comboCount, mult, bonus);
        }

        this._showPickup(gained, bonus, mult);
        this._refreshComboLabel();

        this.scene.tweens.add({
            targets: this.collectField,
            fillAlpha: 0.22,
            duration: 90,
            yoyo: true,
            onComplete: () => { if (this.collectField) this.collectField.fillAlpha = 0.05; },
        });
    }

    _showPickup(gained, bonus, mult) {
        const f = this.scene.floating;
        if (f) {
            f.show(this.posX, this.posY - 22, `+${gained}`, {
                color: bonus > 0 ? '#FFD54F' : '#B388FF',
                size: bonus > 0 ? 9 : 7,
                rise: 18,
                jitter: 8,
            });
            if (bonus > 0) {
                f.show(this.posX, this.posY - 34, `x${mult.toFixed(2)} +${bonus}`, {
                    color: '#FFD54F', size: 7, rise: 22, duration: 780,
                });
            }
            return;
        }

        // FloatingText is created by the scene; if it somehow is not there yet
        // the pickup must still be visible.
        const t = this.scene.add.text(this.posX, this.posY - 22, `+${gained}`, {
            fontFamily: '"Press Start 2P"', fontSize: '8px',
            color: '#B388FF', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(28);
        this.scene.tweens.add({
            targets: t, y: this.posY - 38, alpha: 0, duration: 700,
            ease: 'Quad.easeOut', onComplete: () => t.destroy(),
        });
    }

    _refreshComboLabel() {
        // The lantern fills with the streak — including the very first mote,
        // which is below the threshold the label cares about. Driven from here
        // rather than from absorbMote so the two readouts cannot disagree.
        this.setLook({ lantern: lanternTierFor(this.comboCount) });

        const live = this.comboCount > 1 && this.comboTimer > 0;
        this.comboLabel.setVisible(live);
        if (!live) return;

        this.comboLabel.setText(`COMBO x${this.comboMult.toFixed(2)}`);
        this.comboLabel.setScale(1.35);
        this.scene.tweens.add({
            targets: this.comboLabel,
            scaleX: 1, scaleY: 1,
            duration: 180,
            ease: 'Back.easeOut',
        });
    }

    _endCombo() {
        const had = this.comboCount;
        this.comboCount = 0;
        this.comboLabel.setVisible(false);
        // Let the streak lapse and the lantern goes out. That is the fiction and
        // the rule at once: what is not held evaporates.
        this.setLook({ lantern: lanternTierFor(0) });
        if (had > 1) this.scene.events.emit('hero-combo-end', had);
    }

    moveTo(worldX, worldY) {
        if (this.isDead) return;
        // A dash owns the hero's motion until it lands; queueing a walk on top
        // of it is how you end up teleporting back to where you started.
        if (this.dashing) return;

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
        // Cooldowns keep ticking through death, so respawning does not hand
        // back a hero with everything on full charge.
        this._tickTimers(delta);
        if (this.isDead) return;

        // ── Movement ────────────────────────────
        if (this.dashing) {
            this._stepToward(this.dashTarget, this.dashSpeed * (delta / 1000));
            if (this.busy <= 0 || this._reached(this.dashTarget)) {
                this.dashing = false;
                this.dashTarget = null;
            }
        } else if (this.moving && this.targetPos) {
            if (this._stepToward(this.targetPos, this.speed * (delta / 1000))) {
                this.moving = false;
            }
        }

        this.posX = Phaser.Math.Clamp(this.posX, 10, GAME_WIDTH - 10);
        this.posY = Phaser.Math.Clamp(this.posY, 12, GAME_HEIGHT - 10);

        this._syncSprite(delta);

        // ── Auto-attack nearby enemies ──────────
        // Suppressed mid-cast: the ability is the action right now.
        if (this.busy <= 0 && time - this.lastAttack >= this.attackRate) {
            const target = this._findNearest();
            if (target) {
                target.takeDamage(this.attackDamage);
                this.lastAttack = time;

                const dx = target.x - this.posX;
                const dy = target.y - this.posY;

                // Turn to face what he is hitting. Without this the hero
                // lunged at an enemy behind him while still facing forward and
                // swung out of his own back — which is exactly what "corre de
                // espaldas" looked like. Movement sets facing; so must combat.
                if (Math.abs(dx) > 1) this.sprite.flipX = dx < 0;

                this.swing = SWING_MS;
                this._animate(0);
                this._slash(dx, dy);

                // Slight lunge toward target — applied as an offset so it
                // never overwrites the hero's real position.
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

    /**
     * The crescent the edge leaves, thrown at whatever was hit.
     *
     * Rotated onto the actual attack vector rather than drawn from the hero to
     * the target: a straight line between two points is a beam, and Vesper is
     * carrying a sword.
     */
    _slash(dx, dy) {
        const ang = Math.atan2(dy, dx);
        const s = this.scene.add.image(
            this.posX + Math.cos(ang) * 12,
            this.posY + Math.sin(ang) * 12 - 2,
            HERO_SLASH_KEY
        ).setDepth(21).setRotation(ang).setScale(0.7).setAlpha(0.95);

        this.scene.tweens.add({
            targets: s,
            scaleX: 1.15, scaleY: 1.05,
            alpha: 0,
            duration: 170,
            ease: 'Quad.easeOut',
            onComplete: () => s.destroy(),
        });
    }

    /** Cooldowns, cast time, invulnerability and the combo window. */
    _tickTimers(delta) {
        for (const key of ABILITY_ORDER) {
            if (this.abilityCd[key] > 0) {
                this.abilityCd[key] = Math.max(0, this.abilityCd[key] - delta);
            }
        }
        if (this.busy > 0) this.busy = Math.max(0, this.busy - delta);
        if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - delta);

        if (this.comboTimer > 0) {
            this.comboTimer = Math.max(0, this.comboTimer - delta);
            if (this.comboTimer === 0) this._endCombo();
        }
    }

    /** Moves toward a point; true once it is reached. */
    _stepToward(target, step) {
        if (!target) return true;
        const dx = target.x - this.posX;
        const dy = target.y - this.posY;
        const dist = Math.hypot(dx, dy);

        if (dist <= step || dist < 0.001) {
            this.posX = target.x;
            this.posY = target.y;
            if (Math.abs(dx) > 1) this.sprite.flipX = dx < 0;
            return true;
        }

        this.posX += (dx / dist) * step;
        this.posY += (dy / dist) * step;
        if (Math.abs(dx) > 1) this.sprite.flipX = dx < 0;
        return false;
    }

    _reached(target) {
        if (!target) return true;
        return Math.hypot(target.x - this.posX, target.y - this.posY) < 1;
    }

    /** Pushes logical position + idle bob + lunge offset onto the sprite. */
    _syncSprite(delta) {
        this.bobPhase += (delta / 1000) * (this.moving || this.dashing ? 9 : 3.4);
        const bob = this.moving || this.dashing
            ? 0                                        // the walk frames do this
            : Math.sin(this.bobPhase) * 1.5;           // slow float while idle

        // The pose carries its own bounce now, so the idle float stays and the
        // walking hop goes: two bounces on the same body fight each other.
        this._animate(delta);

        this.sprite.x = this.posX + this.lunge.x;
        this.sprite.y = this.posY + this.lunge.y + bob;
        this.shadow.x = this.posX;
        this.shadow.y = this.posY + 14;
        this.shadow.setScale(this.moving || this.dashing ? 0.9 : 1, 1);

        // The halo rides the lantern, which hangs on whichever hip is currently
        // facing the camera — so it has to flip with the sprite.
        this.lanternGlow.x = this.sprite.x + (this.sprite.flipX ? 7 : -7);
        this.lanternGlow.y = this.sprite.y + 4;

        // The pickup field is only drawn when there is something to pick up —
        // a circle trailing the hero at all times is noise the rest of the time.
        this.collectField.setPosition(this.posX, this.posY);
        this.collectField.setVisible(this.scene.manaMotes.length > 0);

        this.comboLabel.setPosition(this.posX, this.posY - 32);

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
        this.hpBg.y = this.posY - 21;
        this.hpFill.width = 24 * pct;
        this.hpFill.x = this.posX - (24 * (1 - pct)) / 2;
        this.hpFill.y = this.posY - 21;

        if (pct > 0.6) this.hpFill.fillColor = 0x4CAF50;
        else if (pct > 0.3) this.hpFill.fillColor = 0xFFC107;
        else this.hpFill.fillColor = 0xEF5350;
    }

    takeDamage(amount) {
        if (this.isDead) return;

        // Mid-dash he is not there to be hit — that is what the dash is for.
        if (this.invuln > 0) {
            if (this.scene.floating) {
                this.scene.floating.show(this.posX, this.posY - 24, 'esquiva', {
                    color: '#4FC3F7', size: 7, rise: 18,
                });
            }
            return;
        }

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
        this.dashing = false;
        this.dashTarget = null;
        this.busy = 0;
        this.invuln = 0;
        this.comboTimer = 0;
        this._endCombo();
        this.sprite.setVisible(false);
        this.shadow.setVisible(false);
        this.hpBg.setVisible(false);
        this.hpFill.setVisible(false);
        this.collectField.setVisible(false);
        this.lanternGlow.setAlpha(0);

        // Vesper does not die so much as come apart: the ash lifts, and the
        // lantern light goes with it. Drawn rather than typeset — an emoji is
        // the one thing on this board that cannot match the art.
        this._ashBurst();

        // Cancel all empowerment since hero is dead
        for (const tower of this.scene.towers) {
            tower.setEmpowered(false);
        }

        // Respawn after 8 seconds (the Clock already applies timeScale)
        this.scene.time.delayedCall(8000, () => this._respawn());
    }

    /** Flakes of ash lifting off the spot where Vesper stood. */
    _ashBurst() {
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + Math.random();
            const d = 6 + Math.random() * 14;
            const fleck = this.scene.add.rectangle(
                this.posX, this.posY,
                1 + Math.round(Math.random()), 1,
                i % 3 === 0 ? 0xb388ff : 0x6f6b80
            ).setDepth(21);
            this.scene.tweens.add({
                targets: fleck,
                x: this.posX + Math.cos(a) * d,
                y: this.posY + Math.sin(a) * d - 14 - Math.random() * 10,
                alpha: 0,
                duration: 900 + Math.random() * 600,
                ease: 'Quad.easeOut',
                onComplete: () => fleck.destroy(),
            });
        }
    }

    _respawn() {
        this.isDead = false;
        this.hp = this.maxHp;
        this.lunge.x = 0;
        this.lunge.y = 0;
        this.swing = 0;
        this.walkPhase = 0;
        this._setPose('stand');

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
        this._refreshLantern();

        this.sprite.setScale(0);
        this.scene.tweens.add({
            targets: this.sprite, scale: 1, duration: 400, ease: 'Back.easeOut'
        });
    }
}
