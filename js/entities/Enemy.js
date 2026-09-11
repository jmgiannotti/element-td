import * as Phaser from 'phaser';
import { ENEMY_DATA } from '../data/EnemyData.js';
import { EFFECT } from '../data/Elements.js';
import { TILE_SIZE, TILE } from '../systems/GridSystem.js';
import { audio } from '../systems/AudioSystem.js';

export class Enemy {
    static pool = [];

    static obtain(scene, type, spawnX = null, spawnY = null, hpMultiplier = 1) {
        const e = this.pool.pop();
        if (e) {
            e._reset(scene, type, spawnX, spawnY, hpMultiplier);
            return e;
        }
        return new Enemy(scene, type, spawnX, spawnY, hpMultiplier);
    }

    constructor(scene, type, spawnX = null, spawnY = null, hpMultiplier = 1) {
        this.scene = scene;
        this.type = type;
        this.data = { ...ENEMY_DATA[type] };
        
        // Endless mode scaling
        this.hpMultiplier = hpMultiplier;
        this.maxHp = Math.round(this.data.hp * this.hpMultiplier);
        this.hp = this.maxHp;
        // Limit speed boost to 150% max
        const speedMult = Math.min(1.5, 1 + ((this.hpMultiplier - 1) * 0.1));
        this.speed = this.data.speed * speedMult;
        
        this.alive = true;
        this.reachedEnd = false;

        // Status effects
        this.slowAmount = 0;
        this.slowTimer = 0;
        this.frozen = false;
        this.freezeTimer = 0;
        this.burning = false;
        this.burnDps = 0;
        this.burnTimer = 0;
        this.burnTick = 0;

        // ── Agro ────────────────────────────────
        // See EnemyData: most enemies have no `agro` and never read any of this.
        // `mode` is 'road' or 'chase', and it is the only thing that decides
        // whether the path below or the straight line in _chase is in charge.
        this.agro = this.data.agro ?? null;
        this.mode = 'road';
        this.isReturning = false;
        this.departPos = null;
        this.departCell = null;
        this.agroTarget = null;
        this.agroRing = null;
        this.strikeTimer = 0;
        this.strikes = 0;
        // Set once an errand has been *finished* rather than merely abandoned.
        // A velador that loses the hero must be able to pick him up again — that
        // is the pressure. A sillar that has spent its strikes must not re-lock
        // on the temple it is still standing next to, or maxHits buys nothing.
        this.errandDone = false;
        this.distanceTraveled = 0;

        // ── Boss fields ─────────────────────────
        this.isBoss = !!this.data.isBoss;
        this.bossSkills = this.data.bossSkills ? [...this.data.bossSkills] : null;
        this.currentSkillIndex = 0;
        this.skillCooldownTimer = this.bossSkills ? (this.bossSkills[0].initialCd || 3000) : 0;

        // Path and Spawning
        const exitWp = scene.gridSystem.exitPoint;
        if (spawnX !== null && spawnY !== null) {
            this.sprite = scene.add.sprite(spawnX, spawnY, `enemy_${type}`);

            // The scatter offset a dying parent hands down is cosmetic and can
            // land on the grass beside a bend. Path from the nearest road cell
            // instead, and start at index 0 so the child walks to that cell's
            // centre before travelling — heading straight for the *next* cell
            // is what sent it diagonally across the corner.
            const raw = scene.gridSystem.worldToGrid(spawnX, spawnY);
            const cell = scene.gridSystem.nearestWalkable(raw.col, raw.row);
            this.path = scene.gridSystem.findPath(cell.col, cell.row, exitWp.col, exitWp.row);
            this.pathIndex = 0;
        } else {
            const startWp = scene.gridSystem.spawnPoint;
            this.path = scene.gridSystem.findPath(startWp.col, startWp.row, exitWp.col, exitWp.row);
            this.pathIndex = 1;
            const sx = this.path ? this.path[0].col * TILE_SIZE + TILE_SIZE / 2 : 0;
            const sy = this.path ? this.path[0].row * TILE_SIZE + TILE_SIZE / 2 : 0;
            this.sprite = scene.add.sprite(sx, sy, `enemy_${type}`);
        }
        
        if (!this.path) {
            this.alive = false; // Failsafe if path is completely blocked
        } else {
            // 32×32 art on a 32px tile (or 64×64 for giant bosses)
            this.sprite.setScale(1);
            this.sprite.setDepth(10);

            const animKey = `enemy_${type}_pulse`;
            if (scene.anims.exists(animKey)) {
                this.sprite.play(animKey);
            }

            // HP bar, clear of the taller/larger sprite
            this.hpOffsetY = (this.sprite.height > 32) ? Math.round(this.sprite.height / 2 + 6) : 21;
            this.hpBg = scene.add.rectangle(this.sprite.x, this.sprite.y - this.hpOffsetY, 26, 4, 0x1a1a1a, 0.8);
            this.hpBg.setStrokeStyle(1, 0x333333).setDepth(11);
            this.hpFill = scene.add.rectangle(this.sprite.x, this.sprite.y - this.hpOffsetY, 24, 2, 0x4CAF50).setDepth(12);

            // Listen for path changes
            this.pathChangeHandler = () => this.recalculatePath();
            this.scene.events.on('path-changed', this.pathChangeHandler);
        }
    }

    get x() { return this.sprite ? this.sprite.x : 0; }
    get y() { return this.sprite ? this.sprite.y : 0; }
    get pathProgress() { return this.distanceTraveled || this.pathIndex; }

    recalculatePath() {
        if (!this.alive) return;
        const exitWp = this.scene.gridSystem.exitPoint;

        // If chasing or returning, anchor pathfinding to the departure cell on the original track.
        // This prevents the enemy from shortcutting ahead if it crosses later road tiles during a chase.
        if ((this.mode === 'chase' || this.isReturning) && this.departCell) {
            const dep = this.departCell;
            const validCell = this.scene.gridSystem.isWalkable(dep.col, dep.row)
                ? dep
                : this.scene.gridSystem.nearestWalkable(dep.col, dep.row);
            const newPath = this.scene.gridSystem.findPath(validCell.col, validCell.row, exitWp.col, exitWp.row);
            if (newPath) {
                this.path = newPath;
                this.pathIndex = 0;
            }
            return;
        }

        // Forward continuation: if the waypoint the enemy is currently walking towards
        // is still walkable, find the path from that next waypoint onwards to the exit.
        // This keeps the enemy walking forward smoothly without turning backwards.
        const nextWp = (this.path && this.pathIndex < this.path.length) ? this.path[this.pathIndex] : null;
        if (nextWp && this.scene.gridSystem.isWalkable(nextWp.col, nextWp.row)) {
            const forwardPath = this.scene.gridSystem.findPath(nextWp.col, nextWp.row, exitWp.col, exitWp.row);
            if (forwardPath) {
                this.path = forwardPath;
                this.pathIndex = 0; // forwardPath[0] is nextWp, which the enemy is ALREADY heading towards!
                return;
            }
        }

        // If next waypoint is blocked or not available, re-path from current cell or nearest walkable
        const raw = this.scene.gridSystem.worldToGrid(this.x, this.y);
        const cell = this.scene.gridSystem.isWalkable(raw.col, raw.row)
            ? raw
            : this.scene.gridSystem.nearestWalkable(raw.col, raw.row);
        const newPath = this.scene.gridSystem.findPath(cell.col, cell.row, exitWp.col, exitWp.row);
        if (newPath) {
            this.path = newPath;
            this.pathIndex = 0;
        }
    }

    update(_time, delta) {
        if (!this.alive || !this.path) return;

        // ── Status effects ──────────────────────
        if (this.frozen) {
            this.freezeTimer -= delta;
            if (this.freezeTimer <= 0) {
                this.frozen = false;
                this.sprite.clearTint();
            }
            this._updateHpBar();
            return;
        }

        if (this.slowTimer > 0) {
            this.slowTimer -= delta;
            if (this.slowTimer <= 0) this.slowAmount = 0;
        }

        if (this.burning) {
            this.burnTimer -= delta;
            this.burnTick += delta;
            if (this.burnTick >= 500) {
                this.takeDamage(this.burnDps, { silent: true, source: this.burnSource });
                this.burnTick -= 500;
            }
            if (this.burnTimer <= 0) {
                this.burning = false;
                this.burnSource = null;
            }
        }

        // ── Boss abilities ──────────────────────
        if (this.isBoss && this.bossSkills && this.bossSkills.length > 0) {
            this.skillCooldownTimer -= delta;
            if (this.skillCooldownTimer <= 0) {
                this._castBossSkill();
            }
        }

        // ── Agro ────────────────────────────────
        // Decided before combat and before movement, because it is the thing
        // that says which of the two is even running this frame.
        if (this.agro) this._thinkAgro();

        // ── Hero combat ─────────────────────────
        const hero = this.scene.hero;
        if (hero && !hero.isDead) {
            const d = Phaser.Math.Distance.Between(this.x, this.y, hero.x, hero.y);
            if (d < 45) {
                this.heroAttackTimer = (this.heroAttackTimer || 0) + delta;
                if (this.heroAttackTimer >= 1000) {
                    hero.takeDamage(this.data.hp * 0.2 + 5);
                    this.heroAttackTimer = 0;
                    
                    const slash = this.scene.add.text(hero.x, hero.y - 10, '💥', { fontSize: '8px' }).setOrigin(0.5).setDepth(30);
                    this.scene.tweens.add({
                        targets: slash, scale: 2, alpha: 0, duration: 300, onComplete: () => slash.destroy()
                    });
                }
                if (d < 25) {
                    this._updateHpBar();
                    return; // Stop moving to fight hero
                }
            }
        }

        // Off the road: the errand replaces the route entirely, so nothing
        // below this line runs until it goes back to 'road'.
        if (this.mode === 'chase') {
            this._chase(delta);
            return;
        }

        // ── Movement & Block breaking ───────────
        if (this.pathIndex >= this.path.length) {
            this._reachExit();
            return;
        }

        const nextCell = this.path[this.pathIndex];
        const tileType = this.scene.gridSystem.grid[nextCell.row]?.[nextCell.col];

        if (tileType === TILE.BREAKABLE) {
            // Attack the breakable block
            this.blockAttackTimer = (this.blockAttackTimer || 0) + delta;
            if (this.blockAttackTimer >= 1000) {
                // High damage to blocks based on enemy strength
                this.scene.damageBlock(nextCell.col, nextCell.row, this.maxHp * 0.5 + 10);
                this.blockAttackTimer = 0;
            }
            
            // Jiggle sprite slightly
            this.sprite.x += (Math.random() - 0.5) * 2;
            this.sprite.y += (Math.random() - 0.5) * 2;
            this._updateHpBar();
            return; // Wait until block is broken
        }

        // Normal / Returning movement
        const tx = nextCell.col * TILE_SIZE + TILE_SIZE / 2;
        const ty = nextCell.row * TILE_SIZE + TILE_SIZE / 2;
        const dx = tx - this.x;
        const dy = ty - this.y;

        const returnMult = this.isReturning ? (this.agro?.returnSpeedMult ?? 2.5) : 1;
        const effectiveSpeed = this.speed * returnMult * (1 - this.slowAmount);
        const step = effectiveSpeed * (delta / 1000);

        // Movement is resolved one axis at a time, so the distance a frame has
        // to cover is Manhattan, not Euclidean. On a straight lane one of the
        // two legs is zero and the pair agree, so this costs nothing normally.
        const remaining = Math.abs(dx) + Math.abs(dy);

        if (remaining <= step) {
            this.distanceTraveled += remaining;
            this.sprite.x = tx;
            this.sprite.y = ty;
            this.pathIndex++;
            // Reached the road cell when returning — transition back to normal pace
            if (this.isReturning && this.pathIndex >= 1) {
                this.isReturning = false;
                this.departPos = null;
                this.departCell = null;
            }
        } else {
            // Never travel diagonally. The path is 4-connected, so a diagonal
            // component only ever means the enemy is off-lane — scattered
            // there by a dying parent, or re-pathed mid-step. Spending it as
            // one diagonal slide is exactly what reads as cutting the corner;
            // closing the cross-axis first puts it back on the road and keeps
            // the turn square.
            const legs = Math.abs(dx) <= Math.abs(dy)
                ? [['x', dx], ['y', dy]]
                : [['y', dy], ['x', dx]];

            let budget = step;
            for (const [axis, delta_] of legs) {
                if (budget <= 0) break;
                const mag = Math.abs(delta_);
                if (mag < 0.001) continue;
                const move = Math.min(budget, mag);
                if (axis === 'x') this.sprite.x += Math.sign(delta_) * move;
                else this.sprite.y += Math.sign(delta_) * move;
                this.distanceTraveled += move;
                budget -= move;
            }
        }

        // Ghosting trail while returning at increased speed
        if (this.isReturning && Math.random() < 0.35 && this.sprite) {
            const ghost = this.scene.add.sprite(this.x, this.y, this.sprite.texture.key)
                .setScale(this.sprite.scaleX, this.sprite.scaleY)
                .setFlipX(this.sprite.flipX)
                .setAlpha(0.35)
                .setTint(this.agro?.color ?? 0x9A86C4)
                .setDepth(9.5);
            this.scene.tweens.add({
                targets: ghost,
                alpha: 0,
                scaleX: this.sprite.scaleX * 0.8,
                scaleY: this.sprite.scaleY * 0.8,
                duration: 220,
                onComplete: () => ghost.destroy(),
            });
        }

        // Keep facing whichever way it last moved horizontally, rather than
        // snapping back to the right on every vertical stretch.
        if (Math.abs(dx) > 0.01) this.sprite.flipX = dx < 0;
        this._updateHpBar();
    }

    // ─── Agro ───────────────────────────────────────────
    /**
     * Decide whether to be on the road or on an errand this frame.
     *
     * Two thresholds: breaks off at `range`, gives up at `leash` from where it
     * left the road (or if hero is out of reach / sheltered).
     */
    _thinkAgro() {
        if (this.mode === 'chase') {
            const t = this.agroTarget;
            const gone = !t || (t.isDead ?? false) || t.alive === false;

            if (this._sheltered(t)) {
                // Said once by the UI. A hunter that simply turns around is the
                // kind of rule a player never works out on their own.
                this.scene.events.emit('hero-sheltered');
                this._breakOff();
                return;
            }

            // Leash limit: distance from where the enemy abandoned the road
            let leashExceeded = false;
            if (this.departPos) {
                const maxLeash = this.agro.leashTiles
                    ? this.agro.leashTiles * TILE_SIZE
                    : (this.agro.leash ?? 144);
                const distFromDepart = Phaser.Math.Distance.Between(this.x, this.y, this.departPos.x, this.departPos.y);
                if (distFromDepart > maxLeash) {
                    leashExceeded = true;
                }
            }

            // Target out of reach or dead
            const targetDist = t ? Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y) : Infinity;
            const targetTooFar = !gone && targetDist > (this.agro.targetLeash ?? 220);

            if (gone || leashExceeded || targetTooFar) {
                if (leashExceeded && this.scene.floating) {
                    this.scene.floating.show(this.x, this.y - 24, '?', {
                        color: this.agro.colorHex ?? '#B388FF', size: 8, rise: 12, duration: 600,
                    });
                }
                this._breakOff();
            }
            return;
        }

        // Do not re-agro while sprinting back to the road or after finishing errand
        if (this.isReturning || this.errandDone) return;

        const target = this._findAgroTarget();
        if (!target) return;
        if (Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) > this.agro.range) return;
        // Checked before locking on as well as during the chase: without it a
        // velador beside a temple would lock on and break off on alternate
        // frames, strobing the ring and never going anywhere.
        if (this._sheltered(target)) return;

        this._lockOn(target);
    }

    /**
     * Is the target standing on consecrated ground?
     *
     * Only the hero can be: a temple does not shelter itself, and a sillar that
     * dropped its errand every time it arrived would never land a strike.
     *
     * Note what this does not do — it drops the *hunt*, not the damage. An enemy
     * whose road happens to run past the temple can still swing at a hero
     * standing there, because that block applies to every enemy on the board and
     * always has. A temple is a place a velador loses interest in you, not a
     * bubble.
     */
    _sheltered(target) {
        if (this.agro.target !== 'hero' || !target) return false;
        const ts = this.scene.templeSystem;
        return !!ts && !!ts.shelterAt(target.x, target.y);
    }

    /** The thing this enemy has an errand with, if it is on the board right now. */
    _findAgroTarget() {
        if (this.agro.target === 'hero') {
            const h = this.scene.hero;
            return h && !h.isDead ? h : null;
        }

        // Nearest standing temple. A temple already held shut is still a valid
        // target — refusing it would make two sillares gang up on one temple and
        // then politely take turns.
        let best = null;
        let bestDist = Infinity;
        for (const t of this.scene.temples) {
            if (!t.alive) continue;
            const d = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);
            if (d < bestDist) { best = t; bestDist = d; }
        }
        return best;
    }

    _lockOn(target) {
        this.mode = 'chase';
        this.isReturning = false;
        this.departPos = { x: this.x, y: this.y };
        // Anchor to the road cell where the enemy was standing/heading when the chase started.
        // This prevents shortcutting to later road loops if the hero kites it across other road tiles.
        const currentCell = (this.path && this.pathIndex < this.path.length)
            ? this.path[this.pathIndex]
            : this.scene.gridSystem.nearestWalkable(
                Math.floor(this.x / TILE_SIZE),
                Math.floor(this.y / TILE_SIZE)
            );
        this.departCell = { col: currentCell.col, row: currentCell.row };
        this.agroTarget = target;
        this.strikeTimer = 0;
        this.strikes = 0;
        // Defensive: every path into here goes through 'road', which has no
        // ring — but a second ring on one enemy is invisible and permanent, so
        // it is not a leak that would ever get noticed.
        if (this.agroRing) this.agroRing.destroy();

        // Nothing else on this board ever leaves the road, so the moment one
        // does has to be legible or it reads as a pathfinding bug.
        if (this.scene.floating) {
            this.scene.floating.show(this.x, this.y - 24, '!', {
                color: this.agro.colorHex, size: 8, rise: 12, duration: 600,
            });
        }

        this.agroRing = this.scene.add.circle(this.x, this.y + 10, 9, this.agro.color, 0.16)
            .setStrokeStyle(1, this.agro.color, 0.7)
            .setDepth(9);
        this.scene.tweens.add({
            targets: this.agroRing,
            scaleX: 1.25, scaleY: 1.25,
            duration: 460, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
    }

    /** Errand over — rejoin the road at its departure checkpoint. */
    _breakOff() {
        this.mode = 'road';
        this.isReturning = true;
        this.agroTarget = null;
        this.strikeTimer = 0;
        this.strikes = 0;
        if (this.agroRing) { this.agroRing.destroy(); this.agroRing = null; }
        // Re-anchor to the departure cell and calculate path back to it and to the exit.
        this.recalculatePath();
    }

    /**
     * Straight at the target, and diagonally if that is the shortest way.
     *
     * The deliberate opposite of the road movement below, which resolves one
     * axis at a time precisely so nothing ever cuts a corner. That rule exists
     * because the path is 4-connected and a diagonal there means the enemy is
     * off-lane. Here off-lane is the whole point.
     */
    _chase(delta) {
        const t = this.agroTarget;
        if (!t) { this._breakOff(); return; }

        const dx = t.x - this.x;
        const dy = t.y - this.y;
        const dist = Math.hypot(dx, dy);
        const reach = this.agro.reach ?? 20;

        if (dist > reach) {
            const step = this.speed * (1 - this.slowAmount) * (delta / 1000);
            const move = Math.min(step, dist);
            this.sprite.x += (dx / dist) * move;
            this.sprite.y += (dy / dist) * move;
            if (Math.abs(dx) > 0.01) this.sprite.flipX = dx < 0;
        } else if (this.agro.target === 'temple') {
            // Arrived. It does not knock the building down, it holds it shut —
            // a few times, and then it moves on. See maxHits in EnemyData for
            // why it cannot be allowed to stay forever.
            this.strikeTimer += delta;
            if (this.strikeTimer >= this.agro.hitMs) {
                this.strikeTimer = 0;
                this.strikes++;
                t.sabotage(this.agro.stunMs);
                if (this.strikes >= (this.agro.maxHits ?? Infinity)) {
                    this.errandDone = true;
                    this._breakOff();
                }
            }
        }
        // A hero target needs nothing here: the hero-combat block above already
        // stops and hits once it is close enough, and does it for every enemy.

        if (this.agroRing) {
            this.agroRing.x = this.x;
            this.agroRing.y = this.y + 10;
        }
        this._updateHpBar();
    }

    _castBossSkill() {
        if (!this.alive || !this.bossSkills || this.bossSkills.length === 0) return;
        const skill = this.bossSkills[this.currentSkillIndex % this.bossSkills.length];
        this.currentSkillIndex++;
        this.skillCooldownTimer = skill.cd || 8000;

        if (this.scene.telegraphSystem) {
            this.scene.telegraphSystem.addTelegraph(this, skill);
        }

        this.scene.events.emit('boss-ability-cast', { boss: this, skill });

        if (this.scene.floating) {
            this.scene.floating.show(this.x, this.y - 28, `¡${skill.name.toUpperCase()}!`, {
                color: skill.colorHex || '#FFD54F', size: 9, rise: 18, duration: 1200,
            });
        }
    }

    _updateHpBar() {
        if (!this.hpBg) return;
        const pct = Math.max(0, this.hp / this.maxHp);
        const offY = this.hpOffsetY || 21;
        this.hpBg.x = this.x;
        this.hpBg.y = this.y - offY;
        this.hpFill.width = 24 * pct;
        this.hpFill.x = this.x - (24 * (1 - pct)) / 2;
        this.hpFill.y = this.y - offY;

        if (pct > 0.6) this.hpFill.fillColor = 0x4CAF50;
        else if (pct > 0.3) this.hpFill.fillColor = 0xFFC107;
        else this.hpFill.fillColor = 0xEF5350;
    }

    /**
     * @param {number} amount
     * @param {{silent?: boolean, effect?: string, showNumber?: boolean, source?: object}} [opts]
     *   `silent` suppresses the sound and the flash — burn ticks land twice a
     *   second and would otherwise strobe. `effect` is the elemental match-up,
     *   which decides the colour and glyph of the floating number. `source` is
     *   the structure/entity that caused the damage (receives recordDamage/recordKill).
     */
    takeDamage(amount, opts = {}) {
        if (!this.alive) return;
        const { silent = false, effect = EFFECT.NORMAL, showNumber = !silent, source = null } = opts;

        this.hp -= amount;

        if (this.isBoss) {
            this.scene.events.emit('boss-hp-changed', this);
        }

        if (source && source.recordDamage) {
            source.recordDamage(amount);
        }

        if (showNumber && this.scene.floating && this.sprite) {
            this.scene.floating.damage(this.x, this.y - 17, amount, effect);
        }
        // Said once per kind by the UI, the first time it ever happens: the
        // colour and the arrow only mean something if you were told what for.
        if (effect !== EFFECT.NORMAL) this.scene.events.emit('damage-effect', effect);

        if (!silent && this.sprite) {
            audio.play('hit');
            // setTintFill was removed in Phaser 4 — FILL is now a tint mode
            this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
            this.scene.time.delayedCall(60, () => {
                if (!this.alive || !this.sprite) return;
                this.sprite.setTintMode(Phaser.TintModes.MULTIPLY);
                this.sprite.clearTint();
                if (this.frozen) this.sprite.setTint(0x80DEEA);
                if (this.burning) this.sprite.setTint(0xFF7043);
            });
        }

        if (this.hp <= 0) {
            if (source && source.recordKill) {
                source.recordKill();
            }
            this._die();
        }
    }

    applySlow(amount, duration) {
        this.slowAmount = Math.max(this.slowAmount, amount);
        this.slowTimer = Math.max(this.slowTimer, duration);
    }

    applyFreeze(duration) {
        this.frozen = true;
        this.freezeTimer = duration;
        this.sprite.setTint(0x80DEEA);
    }

    applyBurn(dps, duration, source = null) {
        this.burning = true;
        this.burnDps = dps;
        this.burnTimer = duration;
        this.burnTick = 0;
        this.burnSource = source;
    }

    _die() {
        if (!this.alive) return;
        this.alive = false;
        
        if (this.pathChangeHandler) {
            this.scene.events.off('path-changed', this.pathChangeHandler);
        }

        // The errand ends the instant it dies, so the ring goes now rather than
        // fading with the body — _cleanup runs off a tween's onComplete, and a
        // marker that outlives a stalled tween is a marker stuck on the grass.
        if (this.agroRing) { 
            this.agroRing.destroy(); 
            this.agroRing = null; 
        }

        if (this.isBoss) {
            this.scene.events.emit('boss-defeated', this);
            if (this.scene.cameras?.main) {
                this.scene.cameras.main.flash(300, 255, 215, 0, false);
            }
        }

        this.scene.events.emit('enemy-died', this);

        // Spawn nested enemies
        if (this.data.spawns) {
            for (const spawn of this.data.spawns) {
                for (let i = 0; i < spawn.count; i++) {
                    const ox = (Math.random() - 0.5) * 20;
                    const oy = (Math.random() - 0.5) * 20;
                    // Children inherit the parent's HP multiplier
                    const child = Enemy.obtain(this.scene, spawn.type, this.x + ox, this.y + oy, this.hpMultiplier);
                    this.scene.enemies.push(child);
                }
            }
        }

        this.scene.tweens.add({
            targets: [this.sprite, this.hpFill, this.hpBg],
            alpha: 0,
            scaleX: 0,
            scaleY: 0,
            duration: 200,
            onComplete: () => this._cleanup(),
        });
    }

    _reachExit() {
        this.alive = false;
        this.reachedEnd = true;
        if (this.pathChangeHandler) {
            this.scene.events.off('path-changed', this.pathChangeHandler);
            this.pathChangeHandler = null;
        }
        this.scene.events.emit('enemy-reached-end', this);
        this._cleanup();
    }

    _cleanup() {
        if (this.sprite) {
            this.sprite.setActive(false).setVisible(false);
            this.sprite.clearTint();
        }
        if (this.hpBg) {
            this.hpBg.setActive(false).setVisible(false);
        }
        if (this.hpFill) {
            this.hpFill.setActive(false).setVisible(false);
        }
        if (this.agroRing) { 
            this.agroRing.destroy(); 
            this.agroRing = null; 
        }
        
        if (Enemy.pool.length < 200) {
            Enemy.pool.push(this);
        } else {
            // Hard destroy if pool is full
            if (this.sprite) { this.sprite.destroy(); this.sprite = null; }
            if (this.hpBg) { this.hpBg.destroy(); this.hpBg = null; }
            if (this.hpFill) { this.hpFill.destroy(); this.hpFill = null; }
        }
    }

    _reset(scene, type, spawnX = null, spawnY = null, hpMultiplier = 1) {
        this.scene = scene;
        this.type = type;
        this.data = { ...ENEMY_DATA[type] };
        
        this.hpMultiplier = hpMultiplier;
        this.maxHp = Math.round(this.data.hp * this.hpMultiplier);
        this.hp = this.maxHp;
        const speedMult = Math.min(1.5, 1 + ((this.hpMultiplier - 1) * 0.1));
        this.speed = this.data.speed * speedMult;
        
        this.alive = true;
        this.reachedEnd = false;

        this.slowAmount = 0;
        this.slowTimer = 0;
        this.frozen = false;
        this.freezeTimer = 0;
        this.burning = false;
        this.burnDps = 0;
        this.burnTimer = 0;
        this.burnTick = 0;
        this.burnSource = null;

        this.agro = this.data.agro ?? null;
        this.mode = 'road';
        this.isReturning = false;
        this.departPos = null;
        this.departCell = null;
        this.agroTarget = null;
        if (this.agroRing) { this.agroRing.destroy(); this.agroRing = null; }
        this.strikeTimer = 0;
        this.strikes = 0;
        this.errandDone = false;
        this.distanceTraveled = 0;
        this.heroAttackTimer = 0;
        this.blockAttackTimer = 0;

        this.isBoss = !!this.data.isBoss;
        this.bossSkills = this.data.bossSkills ? [...this.data.bossSkills] : null;
        this.currentSkillIndex = 0;
        this.skillCooldownTimer = this.bossSkills ? (this.bossSkills[0].initialCd || 3000) : 0;

        const exitWp = scene.gridSystem.exitPoint;
        if (spawnX !== null && spawnY !== null) {
            const raw = scene.gridSystem.worldToGrid(spawnX, spawnY);
            const cell = scene.gridSystem.nearestWalkable(raw.col, raw.row);
            this.path = scene.gridSystem.findPath(cell.col, cell.row, exitWp.col, exitWp.row);
            this.pathIndex = 0;
            this.sprite.setPosition(spawnX, spawnY);
        } else {
            const startWp = scene.gridSystem.spawnPoint;
            this.path = scene.gridSystem.findPath(startWp.col, startWp.row, exitWp.col, exitWp.row);
            this.pathIndex = 1;
            const sx = this.path ? this.path[0].col * TILE_SIZE + TILE_SIZE / 2 : 0;
            const sy = this.path ? this.path[0].row * TILE_SIZE + TILE_SIZE / 2 : 0;
            this.sprite.setPosition(sx, sy);
        }

        if (!this.path) {
            this.alive = false;
            return;
        }

        this.sprite.setTexture(`enemy_${type}`)
            .setScale(1)
            .setAlpha(1)
            .setActive(true)
            .setVisible(true);

        const animKey = `enemy_${type}_pulse`;
        if (this.scene.anims.exists(animKey)) {
            this.sprite.play(animKey);
        } else if (this.sprite.anims?.isPlaying) {
            this.sprite.anims.stop();
        }

        this.hpOffsetY = (this.sprite.height > 32) ? Math.round(this.sprite.height / 2 + 6) : 21;

        this.hpBg.setPosition(this.sprite.x, this.sprite.y - this.hpOffsetY)
            .setAlpha(1)
            .setScale(1)
            .setActive(true)
            .setVisible(true);
            
        this.hpFill.setPosition(this.sprite.x, this.sprite.y - this.hpOffsetY)
            .setAlpha(1)
            .setScale(1)
            .setActive(true)
            .setVisible(true);
            
        this._updateHpBar();

        if (this.pathChangeHandler) {
            this.scene.events.off('path-changed', this.pathChangeHandler);
        }
        this.pathChangeHandler = () => this.recalculatePath();
        this.scene.events.on('path-changed', this.pathChangeHandler);
    }
}
