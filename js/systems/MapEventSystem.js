import * as Phaser from 'phaser';
import { TILE_SIZE, TILE } from './GridSystem.js';
import { audio } from './AudioSystem.js';

/**
 * What makes each map more than a different road: the rules a level adds on
 * top of the game's own, declared in its `mechanics` (LevelData) and run here.
 *
 *   stallGold   Plaza del Mercado — every market stall still standing fills
 *               with this much gold when a wave is cleared (up to `stallCap`),
 *               and Vesper has to walk up to it (`collectRadius`) to take it.
 *               A boss attack aimed at Vesper (line, target circle) that lands
 *               on a stall wrecks it, gold and all — so the hero fights bosses
 *               away from the market. The Titan's slam, centred on itself,
 *               spares them: it walks the avenue, and a loss nobody can
 *               prevent is a tax.
 *   breaches    Plaza del Mercado — when wave `wave` starts, the enemies light
 *               the crates of breakable plug `block` (an index into the
 *               level's breakableBlocks); `fuseMs` later they blow, and the
 *               short way is open for good.
 *   meteors     Caldera de Magma — from wave `from`, every `every` ms of a wave
 *               (`everyLate` from the eruption on) the volcano throws `count`
 *               meteors, each marked on the ground before it lands. One that
 *               lands on the road leaves a basalt rock there (up to `rockCap`
 *               at once) that the enemies have to walk round or smash; on an
 *               obsidian plug it blasts the plug open; on a tower it stuns it
 *               for `stunMs`. Enemies and Vesper under it get hurt. On wave
 *               `eruption.wave` the volcano erupts: a bigger volley, the first
 *               meteors aimed at plug `eruption.plug`.
 *   blizzard    Glaciar Quebrado — every `every` ms of a wave, a gust freezes
 *               `share` of the exposed towers solid for `duration` ms: they do
 *               not fire at all. Towers of a `warm` element are never frozen,
 *               nor is anything within `warmRadius` cells of one — and a warm
 *               tower beside a frozen one melts it out early.
 *   darkPulse   Cripta Ancestral — every `every` ms of a wave, each pillar
 *               still standing shields the enemies within `radius` cells of
 *               it for `shield` of their max health, for `shieldMs`.
 *
 * Each of them is announced before or as it happens and drawn on the board
 * while it lasts: a rule the player cannot see is one they cannot play.
 *
 * Everything that changes the board goes through GameScene (blocks, towers,
 * enemies); everything the player is told goes out as 'map-event' for
 * UIScene to say. What has to survive a save is in serialize()/restore().
 */

// How long before the blizzard the first flakes and the warning come.
const BLIZZARD_WARN_MS = 3000;
// The meteor's mark on the ground, before it lands.
const METEOR_WARN_MS = 1400;
const D_FX = 28;

export class MapEventSystem {
    constructor(scene) {
        this.scene = scene;
        this.mech = scene.levelData.mechanics || {};

        this._blizzardClock = 0;
        this._blizzardWarned = false;
        this._blizzardLeft = 0;
        this._pulseClock = 0;
        this._meteorClock = 0;
        // Cells where a meteor left a rock, so the cap counts only those.
        this.rocks = new Set();
        this._told = new Set();
        for (const st of this.stalls) { st.pending = 0; st.pile = null; }

        this._makeTextures();

        this._handlers = [];
        const on = (ev, fn) => { scene.events.on(ev, fn); this._handlers.push([ev, fn]); };
        if (this.mech.breaches) on('wave-started', (wave) => this._breach(wave));
        if (this.mech.meteors) on('wave-started', (wave) => this._eruption(wave));
        if (this.mech.stallGold) {
            on('wave-started', () => this._once('stalls',
                `Mercado: los puestos juntan +${this.mech.stallGold} oro por oleada. Lleva a Vesper a cobrarlos`,
                '#FFD700'));
            on('wave-paid', () => this._fillStalls());
            on('hazard-detonated', (covers, aimed) => { if (aimed) this._hazardOnStalls(covers); });
        }
    }

    /** Says something the first time it matters, and never again this game. */
    _once(key, text, color) {
        if (this._told.has(key)) return;
        this._told.add(key);
        this.scene.events.emit('map-event', text, color);
    }

    // ─── Per frame ──────────────────────────────────────
    update(delta) {
        // These run between waves too: Vesper collects whenever he gets
        // there, a fire tower melts its neighbour whenever it stands beside
        // it, and a blizzard that started late still ends on time.
        if (this.mech.stallGold) this._collectStalls();
        const b = this.mech.blizzard;
        if (b) {
            this._meltFrozen(b);
            if (this._blizzardLeft > 0) {
                this._blizzardLeft -= delta;
                if (this._blizzardLeft <= 0) this._endBlizzard();
            }
        }
        if (!this.scene.waveManager.waveActive) return;

        if (b) {
            this._blizzardClock += delta;
            if (!this._blizzardWarned && this._blizzardClock >= b.every - BLIZZARD_WARN_MS) {
                this._blizzardWarned = true;
                this.scene.events.emit('map-event', 'Se acerca una ventisca...', '#B3E5FC');
                this._snow(BLIZZARD_WARN_MS, 1);
            }
            if (this._blizzardClock >= b.every) {
                this._blizzardClock = 0;
                this._blizzardWarned = false;
                this._blizzard(b);
            }
        }

        const p = this.mech.darkPulse;
        if (p) {
            this._pulseClock += delta;
            if (this._pulseClock >= p.every) {
                this._pulseClock = 0;
                this._darkPulse(p);
            }
        }

        const m = this.mech.meteors;
        const wave = this.scene.waveManager.currentWave;
        if (m && wave >= m.from) {
            const every = m.eruption && wave >= m.eruption.wave ? (m.everyLate ?? m.every) : m.every;
            this._meteorClock += delta;
            if (this._meteorClock >= every) {
                this._meteorClock = 0;
                this._volley(m.count, []);
            }
        }
    }

    // ─── Shared effects ─────────────────────────────────
    /** Textures drawn once: the ice a frozen tower sits in, a meteor. */
    _makeTextures() {
        const tex = this.scene.textures;
        if (!tex.exists('fx_iceblock')) {
            const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
            // A block of ice the whole tower is inside: a translucent body, a
            // paler top face, bright edges and a crack or two.
            g.fillStyle(0xA8E6FF, 0.42).fillRect(3, 6, 26, 24);
            g.fillStyle(0xE1F7FF, 0.55).fillRect(3, 2, 26, 5);
            g.lineStyle(1, 0xFFFFFF, 0.95).strokeRect(3.5, 2.5, 25, 27);
            g.lineStyle(1, 0x6CC8EE, 0.9).lineBetween(4, 7.5, 28, 7.5);
            g.lineStyle(1, 0xFFFFFF, 0.7).lineBetween(7, 11, 11, 17).lineBetween(11, 17, 9, 22);
            g.lineBetween(22, 12, 25, 16);
            g.fillStyle(0xFFFFFF, 1).fillRect(5, 4, 3, 1).fillRect(5, 9, 1, 4).fillRect(24, 25, 2, 1);
            g.generateTexture('fx_iceblock', 32, 32);
            g.destroy();
        }
        if (!tex.exists('fx_meteor')) {
            const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
            g.fillStyle(0x2B1A14, 1).fillCircle(8, 8, 7);
            g.fillStyle(0x5D3A2A, 1).fillCircle(7, 7, 5);
            g.fillStyle(0xFF7A1A, 1).fillRect(5, 8, 3, 2).fillRect(9, 5, 2, 3);
            g.fillStyle(0xFFD54F, 1).fillRect(6, 8, 1, 1).fillRect(9, 6, 1, 1);
            g.generateTexture('fx_meteor', 16, 16);
            g.destroy();
        }
    }

    /**
     * A blast: flash, fireball, shock ring, debris thrown out and falling,
     * smoke rising after. `debris` is the colour of whatever just came apart.
     */
    _explosion(x, y, { debris = 0x8D6E63, fire = 0xFF9800, scale = 1 } = {}) {
        const scene = this.scene;
        const tw = (cfg) => scene.tweens.add(cfg);

        const flash = scene.add.circle(x, y, 8 * scale, 0xFFFFFF, 0.95).setDepth(D_FX + 1);
        tw({ targets: flash, scale: 4, alpha: 0, duration: 200, onComplete: () => flash.destroy() });

        const ball = scene.add.circle(x, y, 10 * scale, fire, 0.9).setDepth(D_FX);
        tw({ targets: ball, scale: 3, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => ball.destroy() });

        const ring = scene.add.circle(x, y, 10 * scale, 0xFFE082, 0)
            .setStrokeStyle(2, 0xFFE082, 0.95).setDepth(D_FX);
        tw({ targets: ring, scale: 4.5, alpha: 0, duration: 480, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });

        for (let i = 0; i < 9; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = (22 + Math.random() * 26) * scale;
            const bit = scene.add.rectangle(x, y, 3, 3, debris).setDepth(D_FX);
            // Out and up, then down: two legs make an arc without physics.
            tw({
                targets: bit, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6 - 18,
                angle: 360, duration: 260, ease: 'Quad.easeOut',
                onComplete: () => tw({
                    targets: bit, y: bit.y + 22, alpha: 0, duration: 320, ease: 'Quad.easeIn',
                    onComplete: () => bit.destroy(),
                }),
            });
        }

        for (let i = 0; i < 3; i++) {
            const puff = scene.add.circle(x + (i - 1) * 8, y, 6, 0x5f5a58, 0.55).setDepth(D_FX - 1);
            tw({
                targets: puff, y: y - 34, scale: 2.6, alpha: 0, delay: 120 + i * 60,
                duration: 900, ease: 'Sine.easeOut', onComplete: () => puff.destroy(),
            });
        }
    }

    _cellCenter(col, row) {
        return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
    }

    // ─── Market: the crates ─────────────────────────────
    /**
     * The plug this wave blows, if any is still standing. Lit first — the
     * crates flash and spark for `fuseMs` — so the player sees it coming and
     * sees which way is about to open.
     */
    _breach(wave) {
        for (const b of this.mech.breaches) {
            if (b.wave !== wave) continue;
            const cells = this._standingCells(b.block);
            if (cells.length === 0) continue;

            const scene = this.scene;
            const fuse = b.fuseMs ?? 2200;
            const mid = this._cellCenter(cells[Math.floor(cells.length / 2)].col, cells[Math.floor(cells.length / 2)].row);
            scene.events.emit('map-event', '¡Los enemigos encendieron las cajas!', '#FFA726');
            scene.floating?.show(mid.x, mid.y - 26, '¡VAN A VOLAR!', {
                color: '#FF7043', size: 9, rise: 10, duration: fuse,
            });
            audio.play('boss_warn');

            const lit = cells.map(({ col, row }) => {
                const s = scene.decor.get(`${col},${row}`);
                if (s) {
                    s.setTint(0xFF6E40);
                    scene.tweens.add({ targets: s, alpha: 0.45, duration: 140, yoyo: true, repeat: -1 });
                }
                return { col, row, s };
            });
            const sparks = scene.time.addEvent({
                delay: 90, loop: true, callback: () => {
                    const c = lit[Math.floor(Math.random() * lit.length)];
                    const { x, y } = this._cellCenter(c.col, c.row);
                    const sp = scene.add.rectangle(x + (Math.random() - 0.5) * 18, y - 8, 2, 2, 0xFFEB3B).setDepth(D_FX);
                    scene.tweens.add({
                        targets: sp, y: sp.y - 10 - Math.random() * 8, x: sp.x + (Math.random() - 0.5) * 10,
                        alpha: 0, duration: 380, onComplete: () => sp.destroy(),
                    });
                },
            });

            scene.time.delayedCall(fuse, () => {
                sparks.remove();
                const still = lit.filter(c => scene.breakableBlocks.has(`${c.col},${c.row}`));
                for (const c of lit) if (c.s) scene.tweens.killTweensOf(c.s);
                if (still.length === 0) return;
                for (const c of still) {
                    const { x, y } = this._cellCenter(c.col, c.row);
                    this._explosion(x, y, { debris: 0xB07840, scale: 1.2 });
                }
                scene.breakBlocks(still);
                scene.cameras.main.shake(450, 0.009);
                scene.cameras.main.flash(180, 255, 170, 80, false);
                audio.play('boss_slam');
                audio.play('quake');
                scene.floating?.show(mid.x, mid.y - 10, '¡BOOM!', {
                    color: '#FFB74D', size: 14, rise: 26, duration: 1100,
                });
                scene.events.emit('map-event', '¡Volaron las cajas! Se abrio el atajo', '#FFA726');
            });
        }
    }

    /** Cells of one of the level's breakable rects that are still standing. */
    _standingCells(index) {
        const rect = this.scene.levelData.breakableBlocks?.[index];
        if (!rect) return [];
        const out = [];
        for (let row = rect.r1; row <= rect.r2; row++) {
            for (let col = rect.c1; col <= rect.c2; col++) {
                if (this.scene.breakableBlocks.has(`${col},${row}`)) out.push({ col, row });
            }
        }
        return out;
    }

    // ─── Market: the stalls ─────────────────────────────
    get stalls() { return this.scene.stalls || []; }

    /**
     * Each stall still standing fills up after a wave: a pile of coins with
     * the amount on it, bobbing, until Vesper comes for it. Said in the
     * notices a moment after the wave's own reward, so the two do not land
     * on top of each other.
     */
    _fillStalls() {
        const intact = this.stalls.filter(s => s.intact);
        if (intact.length === 0) return;
        const gold = this.mech.stallGold;
        const cap = this.mech.stallCap ?? Infinity;
        for (const s of intact) {
            s.pending = Math.min(cap, s.pending + gold);
            this._drawPile(s, true);
        }
        audio.play('coin');
        const total = intact.reduce((sum, s) => sum + s.pending, 0);
        this.scene.time.delayedCall(900, () => {
            this.scene.events.emit('map-event', `Mercado: ${total} oro esperando a Vesper`, '#FFD700');
        });
    }

    /** The pile over a stall: a coin, the amount, a ring calling Vesper over. */
    _drawPile(s, pop = false) {
        const scene = this.scene;
        if (s.pile) { scene.tweens.killTweensOf(s.pile.list); s.pile.destroy(); s.pile = null; }
        if (!s.intact || s.pending <= 0) return;

        const ring = scene.add.circle(0, 6, 15, 0xFFD54F, 0.12).setStrokeStyle(1, 0xFFE082, 0.9);
        const coin = scene.add.image(0, -2, 'icon_coin').setScale(0.9);
        const label = scene.add.text(0, 17, `${s.pending}`, {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#FFD700',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);
        s.pile = scene.add.container(s.x, s.y + 8, [ring, coin, label]).setDepth(D_FX - 2);
        scene.tweens.add({ targets: coin, y: -6, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: ring, scale: 1.25, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });
        if (pop) {
            s.pile.setScale(0.3);
            scene.tweens.add({ targets: s.pile, scale: 1, duration: 260, ease: 'Back.easeOut' });
            scene.tweens.add({ targets: s.sprite, scaleY: 1.12, duration: 90, yoyo: true });
        }
    }

    /** Vesper close enough to a stall with gold in it takes the gold. */
    _collectStalls() {
        const hero = this.scene.hero;
        if (!hero || hero.isDead) return;
        const reach = this.mech.collectRadius ?? 40;
        for (const s of this.stalls) {
            if (!s.intact || s.pending <= 0) continue;
            if (Phaser.Math.Distance.Between(hero.x, hero.y, s.x, s.y) > reach) continue;
            const gold = s.pending;
            s.pending = 0;
            this._drawPile(s);
            this.scene.economySystem.addGold(gold);
            audio.play('coin');
            for (let i = 0; i < Math.min(5, Math.ceil(gold / 10)); i++) {
                const c = this.scene.add.image(s.x, s.y + 6, 'icon_coin').setDepth(D_FX).setScale(0.7);
                this.scene.tweens.add({
                    targets: c, x: hero.x, y: hero.y - 10, delay: i * 70, duration: 320, ease: 'Quad.easeIn',
                    onComplete: () => c.destroy(),
                });
            }
            this.scene.floating?.show(hero.x, hero.y - 26, `+${gold} ORO`, {
                color: '#FFD700', size: 9, rise: 16, duration: 1200,
            });
            this._once('collected', 'Vesper cobro el puesto: el oro vuelve a juntarse cada oleada', '#FFD700');
        }
    }

    _hazardOnStalls(covers) {
        for (const s of this.stalls) {
            if (s.intact && covers(s.x, s.y)) this._wreckStall(s, true);
        }
    }

    _wreckStall(s, loud) {
        s.intact = false;
        s.pending = 0;
        this._drawPile(s);
        s.sprite.setTint(0x5a4a40).setAlpha(0.55);
        if (!loud) return;
        this._explosion(s.x, s.y, { debris: 0xC98B4A, scale: 0.8 });
        this.scene.floating?.show(s.x, s.y - 14, '¡PUESTO DESTRUIDO!', {
            color: '#EF5350', size: 8, rise: 18, duration: 1200,
        });
        this.scene.events.emit('map-event', 'Un jefe destrozo un puesto del mercado', '#EF5350');
    }

    // ─── Caldera: meteors ───────────────────────────────
    /** The eruption wave: the volcano shakes, then a heavy volley, plug first. */
    _eruption(wave) {
        const m = this.mech.meteors;
        if (wave === m.from && wave !== m.eruption?.wave) {
            this._once('meteors', '¡El volcan escupe meteoritos! Dejan rocas en el camino', '#FF7043');
        }
        const e = m.eruption;
        if (!e || wave !== e.wave) return;
        const scene = this.scene;
        scene.cameras.main.shake(900, 0.007);
        audio.play('quake');
        scene.events.emit('map-event', '¡ERUPCION! Llueven meteoritos sobre la caldera', '#FF5722');
        this._told.add('meteors');

        // The plug's two ends: each blast takes its neighbours with it, so
        // two meteors open all four rocks.
        const rect = scene.levelData.breakableBlocks?.[e.plug];
        const aimed = [];
        if (rect && this._standingCells(e.plug).length > 0) {
            aimed.push({ col: rect.c1, row: rect.r1 }, { col: rect.c2, row: rect.r2 });
        }
        this._volley(e.count, aimed);
    }

    /** `count` meteors, `aimed` cells first and the rest picked off the board. */
    _volley(count, aimed) {
        const targets = [...aimed];
        const taken = new Set(targets.map(t => `${t.col},${t.row}`));
        while (targets.length < count) {
            const t = this._pickTarget(taken);
            if (!t) break;
            taken.add(`${t.col},${t.row}`);
            targets.push(t);
        }
        targets.forEach((t, i) => this.scene.time.delayedCall(i * 260, () => this._meteor(t)));
    }

    /**
     * Where the next one lands: mostly the road (that is what reshapes the
     * map), sometimes a tower, sometimes open ground. Never the first or last
     * column, where the gates are.
     */
    _pickTarget(taken) {
        const { grid, cols, rows } = this.scene.gridSystem;  // grid: rows of tiles
        const road = [], towers = [], ground = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 1; c < cols - 1; c++) {
                const key = `${c},${r}`;
                if (taken.has(key)) continue;
                const tile = grid[r][c];
                if (tile === TILE.PATH) road.push({ col: c, row: r });
                else if (tile === TILE.GRASS) {
                    if (this.scene.towers.some(t => t.alive && t.col === c && t.row === r)) towers.push({ col: c, row: r });
                    else if (!this.scene.occupiedCells.has(key)) ground.push({ col: c, row: r });
                }
            }
        }
        const roll = Math.random();
        const pool = roll < 0.5 && road.length ? road
            : roll < 0.8 && towers.length ? towers
            : ground.length ? ground : road;
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }

    _meteor({ col, row }) {
        const scene = this.scene;
        const { x, y } = this._cellCenter(col, row);

        // The mark: a closing ring and a hot spot, there for the whole fall.
        const spot = scene.add.circle(x, y, 13, 0xFF3D00, 0.18).setDepth(3);
        const ring = scene.add.circle(x, y, 30, 0xFF5722, 0).setStrokeStyle(2, 0xFF7043, 0.95).setDepth(3);
        scene.tweens.add({ targets: ring, scale: 13 / 30, duration: METEOR_WARN_MS, ease: 'Quad.easeIn' });
        scene.tweens.add({ targets: spot, alpha: 0.45, duration: 180, yoyo: true, repeat: -1 });

        // The rock itself, falling the last part of the warning with a trail.
        const fallMs = 480;
        scene.time.delayedCall(METEOR_WARN_MS - fallMs, () => {
            const rock = scene.add.image(x + 110, y - 230, 'fx_meteor').setDepth(D_FX + 2).setScale(1.4);
            const trail = scene.time.addEvent({
                delay: 28, loop: true, callback: () => {
                    const t = scene.add.circle(rock.x, rock.y, 4, Math.random() < 0.5 ? 0xFF9800 : 0xFFD54F, 0.85)
                        .setDepth(D_FX + 1);
                    scene.tweens.add({ targets: t, scale: 0.2, alpha: 0, duration: 320, onComplete: () => t.destroy() });
                },
            });
            scene.tweens.add({
                targets: rock, x, y, angle: 240, duration: fallMs, ease: 'Quad.easeIn',
                onComplete: () => {
                    trail.remove();
                    rock.destroy();
                    scene.tweens.killTweensOf(spot);
                    spot.destroy();
                    ring.destroy();
                    this._impact(col, row);
                },
            });
        });
    }

    _impact(col, row) {
        const scene = this.scene;
        const m = this.mech.meteors;
        const { x, y } = this._cellCenter(col, row);
        this._explosion(x, y, { debris: 0x3E2723, fire: 0xFF6D00, scale: 1.1 });
        scene.cameras.main.shake(220, 0.008);
        audio.play('boss_fire');

        // Whatever stood under it gets hurt.
        for (const e of scene.enemies) {
            if (e.alive && Phaser.Math.Distance.Between(x, y, e.x, e.y) <= 28) e.takeDamage(m.enemyDamage);
        }
        const hero = scene.hero;
        if (hero && !hero.isDead && Phaser.Math.Distance.Between(x, y, hero.x, hero.y) <= 28) {
            hero.takeDamage(m.heroDamage);
        }

        const tile = scene.gridSystem.grid[row][col];
        if (tile === TILE.BREAKABLE) {
            // A plug: the blast takes the rocks either side of it as well.
            const hit = [{ col, row }, { col: col - 1, row }, { col: col + 1, row }, { col, row: row - 1 }, { col, row: row + 1 }];
            scene.breakBlocks(hit);
            scene.floating?.show(x, y - 18, '¡SE ABRIO UN PASO!', { color: '#FF7043', size: 8, rise: 18, duration: 1300 });
            return;
        }

        const tower = scene.towers.find(t => t.alive && t.col === col && t.row === row);
        if (tower) {
            tower.stun(m.stunMs);
            return;
        }

        const enemyOnIt = scene.enemies.some(e => e.alive && Phaser.Math.Distance.Between(x, y, e.x, e.y) <= 30);
        const rocksUp = [...this.rocks].filter(k => scene.breakableBlocks.has(k)).length;
        if (tile === TILE.PATH && !enemyOnIt && rocksUp < m.rockCap) {
            scene.addBlock(col, row, m.rockHp);
            this.rocks.add(`${col},${row}`);
            const s = scene.decor.get(`${col},${row}`);
            if (s) {
                s.setScale(0.2);
                scene.tweens.add({ targets: s, scale: 1, duration: 220, ease: 'Back.easeOut' });
            }
            scene.floating?.show(x, y - 18, '¡ROCA!', { color: '#FFAB91', size: 8, rise: 14, duration: 900 });
            return;
        }

        // Open ground, or a road it cannot block right now: a scorch mark.
        const scorch = scene.add.circle(x, y, 12, 0x1a0d08, 0.6).setDepth(0.55);
        const ember = scene.add.circle(x, y, 5, 0xFF6D00, 0.7).setDepth(0.56);
        scene.tweens.add({
            targets: [scorch, ember], alpha: 0, delay: 2500, duration: 1500,
            onComplete: () => { scorch.destroy(); ember.destroy(); },
        });
    }

    // ─── Glacier: blizzard ──────────────────────────────
    /** The towers a warm one keeps from freezing: itself and its neighbours. */
    _warmCover(b) {
        const warm = this.scene.towers.filter(t => t.alive && b.warm.includes(t.element));
        return {
            warm,
            covered: (t) => warm.some(w => Math.max(Math.abs(w.col - t.col), Math.abs(w.row - t.row)) <= b.warmRadius),
        };
    }

    _blizzard(b) {
        const scene = this.scene;
        const { warm, covered } = this._warmCover(b);
        const exposed = scene.towers.filter(t => t.alive && !covered(t));
        // Half of the exposed ones, at random: enough to hurt, never the lot.
        const frozen = Phaser.Utils.Array.Shuffle([...exposed])
            .slice(0, exposed.length ? Math.max(1, Math.ceil(exposed.length * b.share)) : 0);
        for (const t of frozen) {
            t.freeze(b.duration);
            scene.floating?.show(t.x, t.y - 24, '¡CONGELADA!', { color: '#B3E5FC', size: 7, rise: 12, duration: 1200 });
        }

        this._blizzardLeft = b.duration;
        this._snow(b.duration, 3);
        const { worldWidth: w, worldHeight: h } = scene.gridSystem;
        if (this._veil) this._veil.destroy();
        this._veil = scene.add.rectangle(w / 2, h / 2, w, h, 0xDDF3FF, 0).setDepth(25);
        scene.tweens.add({ targets: this._veil, fillAlpha: 0.16, duration: 500 });
        scene.cameras.main.flash(260, 200, 230, 255, false);
        audio.play('boss_warn');

        // What the fire keeps warm, for as long as it lasts.
        for (const g of this._heat || []) { scene.tweens.killTweensOf(g); g.destroy(); }
        this._heat = warm.map(t => {
            const r = (b.warmRadius + 0.5) * TILE_SIZE;
            const glow = scene.add.rectangle(t.x, t.y, r * 2, r * 2, 0xFF8A3D, 0.1)
                .setStrokeStyle(1, 0xFFB74D, 0.6).setDepth(1);
            scene.tweens.add({ targets: glow, fillAlpha: 0.2, duration: 600, yoyo: true, repeat: -1 });
            return glow;
        });

        const secs = Math.round(b.duration / 1000);
        scene.events.emit('map-event',
            frozen.length === 0
                ? '¡VENTISCA! El fuego mantuvo calientes a todas tus torres'
                : `¡VENTISCA! ${frozen.length} ${frozen.length === 1 ? 'torre congelada' : 'torres congeladas'}: no disparan por ${secs}s`,
            '#B3E5FC');
        this._once('warmth', 'El fuego protege: las torres a 1 casilla de una de fuego no se congelan', '#FFB74D');
    }

    /** A warm tower standing next to a frozen one melts it out right away. */
    _meltFrozen(b) {
        const towers = this.scene.towers;
        if (!towers.some(t => t.alive && t.frozen)) return;
        const { covered } = this._warmCover(b);
        for (const t of towers) {
            if (t.alive && t.frozen && covered(t)) t.thaw(true);
        }
    }

    _endBlizzard() {
        const scene = this.scene;
        if (this._veil) {
            const v = this._veil;
            this._veil = null;
            scene.tweens.add({ targets: v, fillAlpha: 0, duration: 600, onComplete: () => v.destroy() });
        }
        for (const g of this._heat || []) { scene.tweens.killTweensOf(g); g.destroy(); }
        this._heat = [];
    }

    /** Snow streaking across the board for `ms`, `density` flakes a tick. */
    _snow(ms, density) {
        const scene = this.scene;
        const { worldWidth: w, worldHeight: h } = scene.gridSystem;
        const ticks = Math.ceil(ms / 80);
        scene.time.addEvent({
            delay: 80, repeat: ticks - 1, callback: () => {
                for (let i = 0; i < density; i++) {
                    const x = Math.random() * (w + 120);
                    const y = Math.random() * h - 20;
                    const flake = scene.add.rectangle(x, y, 2, 2, 0xFFFFFF, 0.9).setDepth(26);
                    scene.tweens.add({
                        targets: flake, x: x - 110 - Math.random() * 50, y: y + 50 + Math.random() * 30,
                        alpha: 0, duration: 1000 + Math.random() * 400, onComplete: () => flake.destroy(),
                    });
                }
            },
        });
    }

    // ─── Crypt: pillars ─────────────────────────────────
    /**
     * Each standing pillar glows, sends out a dark ring, and draws a beam to
     * every enemy it wards — the beam is what says where the shield came from.
     */
    _darkPulse(p) {
        const scene = this.scene;
        const rects = scene.levelData.breakableBlocks || [];
        let pulsed = false;

        rects.forEach((rect, i) => {
            const cells = this._standingCells(i);
            if (cells.length === 0) return;
            pulsed = true;

            for (const c of cells) {
                const s = scene.decor.get(`${c.col},${c.row}`);
                if (!s) continue;
                s.setTint(0xB388FF);
                scene.time.delayedCall(450, () => { if (s.active) s.clearTint(); });
            }

            const cx = ((rect.c1 + rect.c2 + 1) / 2) * TILE_SIZE;
            const cy = ((rect.r1 + rect.r2 + 1) / 2) * TILE_SIZE;
            const ring = scene.add.circle(cx, cy, 12, 0x4A148C, 0.35)
                .setStrokeStyle(3, 0xD1C4E9, 0.95).setDepth(9);
            scene.tweens.add({
                targets: ring,
                scaleX: (p.radius + 1) * 2.4, scaleY: (p.radius + 1) * 2.4,
                alpha: 0, duration: 700, ease: 'Quad.easeOut',
                onComplete: () => ring.destroy(),
            });

            for (const e of scene.enemies) {
                if (!e.alive) continue;
                const ec = Math.floor(e.x / TILE_SIZE);
                const er = Math.floor(e.y / TILE_SIZE);
                const from = cells.find(c =>
                    Math.max(Math.abs(c.col - ec), Math.abs(c.row - er)) <= p.radius);
                if (!from) continue;
                const fresh = e.shield <= 0;
                e.grantShield(e.maxHp * p.shield, p.shieldMs);
                const o = this._cellCenter(from.col, from.row);
                const beam = scene.add.line(0, 0, o.x, o.y, e.x, e.y, 0xB388FF, 0.95)
                    .setOrigin(0, 0).setLineWidth(2).setDepth(14);
                scene.tweens.add({ targets: beam, alpha: 0, duration: 450, onComplete: () => beam.destroy() });
                if (fresh) {
                    scene.floating?.show(e.x, e.y - 30, '+ESCUDO', { color: '#FFE082', size: 7, rise: 12, duration: 900 });
                }
            }
        });

        if (pulsed) audio.play('boss_nova');
        if (pulsed) this._once('pulse', 'Los pilares escudan a los enemigos cercanos: rompelos', '#B388FF');
    }

    // ─── Save ───────────────────────────────────────────
    serialize() {
        return {
            stallsLost: this.stalls.map((s, i) => (s.intact ? -1 : i)).filter(i => i >= 0),
            stallsPending: this.stalls.map(s => s.pending || 0),
            rocks: [...this.rocks].filter(k => this.scene.breakableBlocks.has(k)),
        };
    }

    restore(state) {
        for (const i of state?.stallsLost || []) {
            const s = this.stalls[i];
            if (s && s.intact) this._wreckStall(s, false);
        }
        (state?.stallsPending || []).forEach((n, i) => {
            const s = this.stalls[i];
            if (s && s.intact) { s.pending = n; this._drawPile(s); }
        });
        this.rocks = new Set(state?.rocks || []);
    }

    destroy() {
        for (const [ev, fn] of this._handlers) this.scene.events.off(ev, fn);
        this._handlers = [];
    }
}
