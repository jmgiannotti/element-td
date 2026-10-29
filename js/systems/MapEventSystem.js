import * as Phaser from 'phaser';
import { TILE_SIZE } from './GridSystem.js';
import { audio } from './AudioSystem.js';

/**
 * What makes each map more than a different road: the rules a level adds on
 * top of the game's own, declared in its `mechanics` (LevelData) and run here.
 *
 *   stallGold   Plaza del Mercado — every market stall still standing pays
 *               this much gold when a wave is cleared. A boss attack aimed at
 *               Vesper (line, target circle) that lands on a stall wrecks it
 *               for the rest of the run — so the hero fights bosses away from
 *               the market. The Titan's slam, centred on itself, spares them:
 *               it walks the avenue, and a loss nobody can prevent is a tax.
 *   breaches    Plaza del Mercado, Caldera de Magma — when wave `wave` starts,
 *               the breakable plug `block` (an index into the level's
 *               breakableBlocks) goes down by itself: the enemies blow the
 *               crates, or the volcano shakes the obsidian loose. Opens a road
 *               the player had been able to ignore.
 *   blizzard    Glaciar Quebrado — every `every` ms of a wave, a gust chills
 *               the towers: `slow` less cadence for `duration` ms. Towers of
 *               a `warm` element are spared, and so is anything within
 *               `warmRadius` cells of one — fire keeps its neighbours going.
 *   darkPulse   Cripta Ancestral — every `every` ms of a wave, each pillar
 *               still standing shields the enemies within `radius` cells of
 *               it for `shield` of their max health, for `shieldMs`.
 *
 * Everything that changes the board goes through GameScene (blocks, towers,
 * enemies); everything the player is told goes out as 'map-event' for
 * UIScene to say. What has to survive a save is in serialize()/restore().
 */
export class MapEventSystem {
    constructor(scene) {
        this.scene = scene;
        this.mech = scene.levelData.mechanics || {};

        // Read by Tower.fireRate while a tower is chilled.
        this.chillSlow = this.mech.blizzard?.slow ?? 0;
        this._blizzardClock = 0;
        this._chillLeft = 0;
        this._pulseClock = 0;
        this._pulseExplained = false;

        this._handlers = [];
        const on = (ev, fn) => { scene.events.on(ev, fn); this._handlers.push([ev, fn]); };
        if (this.mech.breaches) on('wave-started', (wave) => this._breach(wave));
        if (this.mech.stallGold) {
            on('wave-complete', () => this._payStalls());
            on('hazard-detonated', (covers, aimed) => { if (aimed) this._hazardOnStalls(covers); });
        }
    }

    // ─── Per frame ──────────────────────────────────────
    update(delta) {
        // The chill wears off on its own clock, wave or no wave, so a gust in
        // the last seconds of a wave does not freeze the planning phase.
        if (this._chillLeft > 0) {
            this._chillLeft -= delta;
            if (this._chillLeft <= 0) this._setChill([]);
        }
        if (!this.scene.waveManager.waveActive) return;

        const b = this.mech.blizzard;
        if (b) {
            this._blizzardClock += delta;
            if (this._blizzardClock >= b.every) {
                this._blizzardClock = 0;
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
    }

    // ─── Breaches ───────────────────────────────────────
    /** The plug this wave knocks down, if any is still standing. */
    _breach(wave) {
        for (const b of this.mech.breaches) {
            if (b.wave !== wave) continue;
            const cells = this._standingCells(b.block);
            if (cells.length === 0) continue;

            const scene = this.scene;
            for (const { col, row } of cells) {
                const x = col * TILE_SIZE + TILE_SIZE / 2;
                const y = row * TILE_SIZE + TILE_SIZE / 2;
                scene.particleSystem?.emitBurst(x, y, b.cause === 'quake' ? 0x8E7CC3 : 0xFFA726);
                scene.particleSystem?.emitBurst(x, y, 0xFFFFFF);
            }
            scene.breakBlocks(cells);

            if (b.cause === 'quake') {
                scene.cameras.main.shake(700, 0.006);
                audio.play('quake');
                scene.events.emit('map-event', '¡TEMBLOR! La obsidiana se quebro', '#FF7043');
            } else {
                scene.cameras.main.shake(260, 0.01);
                audio.play('boss_slam');
                scene.events.emit('map-event', '¡Los enemigos volaron las cajas!', '#FFA726');
            }
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

    // ─── Market stalls ──────────────────────────────────
    get stalls() { return this.scene.stalls || []; }

    _payStalls() {
        const intact = this.stalls.filter(s => s.intact);
        if (intact.length === 0) return;
        const gold = this.mech.stallGold;
        this.scene.economySystem.addGold(gold * intact.length);
        audio.play('coin');
        for (const s of intact) {
            this.scene.floating?.show(s.x, s.y - 14, `+${gold} ORO`, {
                color: '#FFD700', size: 8, rise: 20, duration: 1200,
            });
        }
    }

    _hazardOnStalls(covers) {
        for (const s of this.stalls) {
            if (s.intact && covers(s.x, s.y)) this._wreckStall(s, true);
        }
    }

    _wreckStall(s, loud) {
        s.intact = false;
        s.sprite.setTint(0x5a4a40).setAlpha(0.55);
        if (!loud) return;
        this.scene.particleSystem?.emitBurst(s.x, s.y, 0xC98B4A);
        this.scene.floating?.show(s.x, s.y - 14, '¡PUESTO DESTRUIDO!', {
            color: '#EF5350', size: 8, rise: 18, duration: 1200,
        });
        this.scene.events.emit('map-event', 'Un jefe destrozo un puesto del mercado', '#EF5350');
    }

    // ─── Blizzard ───────────────────────────────────────
    _blizzard(b) {
        const towers = this.scene.towers.filter(t => t.alive);
        const warm = towers.filter(t => b.warm.includes(t.element));
        const near = (t) => warm.some(w =>
            Math.max(Math.abs(w.col - t.col), Math.abs(w.row - t.row)) <= b.warmRadius);
        const chilled = towers.filter(t => !near(t));

        this._chillLeft = b.duration;
        this._setChill(chilled);
        this._snowGust();
        for (const w of warm) {
            const ring = this.scene.add.circle(w.x, w.y, 14, 0xFF8A3D, 0)
                .setStrokeStyle(2, 0xFFB74D, 0.8).setDepth(27);
            this.scene.tweens.add({
                targets: ring, scaleX: 3, scaleY: 3, alpha: 0, duration: 700,
                onComplete: () => ring.destroy(),
            });
        }
        this.scene.events.emit('map-event', '¡VENTISCA! Las torres se enfrian', '#B3E5FC');
    }

    /** Exactly these towers chilled, every other one warm again. */
    _setChill(chilled) {
        const set = new Set(chilled);
        for (const t of this.scene.towers) {
            const want = set.has(t);
            if (!!t.chilled === want) continue;
            t.chilled = want;
            t._applyTint();
        }
        this.scene._refreshStatLabel?.();
    }

    /** Snow streaking across the board, so the gust is seen and not only read. */
    _snowGust() {
        const { worldWidth: w, worldHeight: h } = this.scene.gridSystem;
        for (let i = 0; i < 60; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const flake = this.scene.add.rectangle(x, y, 2, 2, 0xFFFFFF, 0.9).setDepth(26);
            this.scene.tweens.add({
                targets: flake,
                x: x - 90 - Math.random() * 60,
                y: y + 40 + Math.random() * 40,
                alpha: 0,
                delay: Math.random() * 400,
                duration: 900 + Math.random() * 500,
                onComplete: () => flake.destroy(),
            });
        }
        this.scene.cameras.main.flash(260, 200, 230, 255, false);
    }

    // ─── Crypt pillars ──────────────────────────────────
    _darkPulse(p) {
        const scene = this.scene;
        const rects = scene.levelData.breakableBlocks || [];
        let pulsed = false;

        rects.forEach((rect, i) => {
            const cells = this._standingCells(i);
            if (cells.length === 0) return;
            pulsed = true;

            const cx = ((rect.c1 + rect.c2 + 1) / 2) * TILE_SIZE;
            const cy = ((rect.r1 + rect.r2 + 1) / 2) * TILE_SIZE;
            const ring = scene.add.circle(cx, cy, 12, 0x4A148C, 0.25)
                .setStrokeStyle(2, 0xB388FF, 0.85).setDepth(9);
            scene.tweens.add({
                targets: ring,
                scaleX: (p.radius + 1) * 2.4, scaleY: (p.radius + 1) * 2.4,
                alpha: 0, duration: 650, ease: 'Quad.easeOut',
                onComplete: () => ring.destroy(),
            });

            for (const e of scene.enemies) {
                if (!e.alive) continue;
                const ec = Math.floor(e.x / TILE_SIZE);
                const er = Math.floor(e.y / TILE_SIZE);
                const close = cells.some(c =>
                    Math.max(Math.abs(c.col - ec), Math.abs(c.row - er)) <= p.radius);
                if (close) e.grantShield(e.maxHp * p.shield, p.shieldMs);
            }
        });

        // Explained once, the first time it happens: a shield nobody was told
        // about reads as towers missing.
        if (pulsed && !this._pulseExplained) {
            this._pulseExplained = true;
            scene.events.emit('map-event', 'Los pilares escudan a los enemigos cercanos', '#B388FF');
        }
    }

    // ─── Save ───────────────────────────────────────────
    serialize() {
        return { stallsLost: this.stalls.map((s, i) => (s.intact ? -1 : i)).filter(i => i >= 0) };
    }

    restore(state) {
        for (const i of state?.stallsLost || []) {
            const s = this.stalls[i];
            if (s && s.intact) this._wreckStall(s, false);
        }
    }

    destroy() {
        for (const [ev, fn] of this._handlers) this.scene.events.off(ev, fn);
        this._handlers = [];
    }
}
