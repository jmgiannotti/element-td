import * as Phaser from 'phaser';
import { GridSystem, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT, GRID_COLS, GRID_ROWS, WAYPOINTS, TILE } from '../systems/GridSystem.js';
import { WaveManager } from '../systems/WaveManager.js';
import { EconomySystem, BARRICADE_COST, refundValue } from '../systems/EconomySystem.js';
import { FusionSystem } from '../systems/FusionSystem.js';
import { TempleSystem } from '../systems/TempleSystem.js';
import { RouteView } from '../systems/RouteView.js';
import { audio } from '../systems/AudioSystem.js';
import { Tower } from '../entities/Tower.js';
import { Temple } from '../entities/Temple.js';
import { Hero } from '../entities/Hero.js';
import { TOWER_DATA, ELEMENTS } from '../data/TowerData.js';
import { TEMPLE_DATA } from '../data/TempleData.js';
import {
    GRASS_VARIANTS, DIRT_VARIANTS, EDGE_VARIANTS, RUT_VARIANTS, BREAKABLE_VARIANTS,
} from './BootScene.js';
import { safeTexture } from '../systems/TextureGuard.js';

// Depth budget for the terrain layers (all below entities at depth ≥ 1).
const D_BASE = 0;
const D_RUT = 0.1;
const D_SCATTER = 0.15;
const D_EDGE = 0.2;
const D_CORNER = 0.25;
const D_GRID = 0.5;
const D_DECOR = 0.6;

// Why a barricade is refused. Only the two blocking cases get a message —
// hovering plain grass is already answered by the red tile.
const BLOCK_REASON = {
    route: 'Cerraria el camino',
    enemy: 'Encerraria a un enemigo',
};

/** Stable per-cell hash — same cell always draws the same variant. */
function cellHash(col, row) {
    let h = Math.imul(col + 1, 374761393) ^ Math.imul(row + 1, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
}

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    create() {
        // ── Systems ─────────────────────────────
        this.gridSystem = new GridSystem();
        this.economySystem = new EconomySystem(this);
        this.waveManager = new WaveManager(this);
        this.fusionSystem = new FusionSystem(this);

        // ── Entity lists ────────────────────────
        this.towers = [];
        this.temples = [];
        this.enemies = [];
        this.projectiles = [];
        this.manaMotes = [];
        this.occupiedCells = new Set();
        this.breakableBlocks = new Map();
        // 'c,r' → gold paid. Barricades are decor plus a grid flag rather than
        // entities, so their price has to be remembered somewhere.
        this.barricades = new Map();

        // TempleSystem reads scene.temples, so it is built after the lists.
        this.templeSystem = new TempleSystem(this);

        // ── State ───────────────────────────────
        this.selectedElement = null;
        this.placementMode = false;
        this.gameOver = false;
        this.gameWon = false;
        this.isBarricadeMode = false;
        this.isTempleMode = false;
        this.sellMode = false;
        // Set by UIScene while the temple upgrade panel is open, so clicks
        // meant for the panel never fall through onto the map behind it.
        this.uiModalOpen = false;

        // ── Render map ──────────────────────────
        this._renderMap();
        this.routeView = new RouteView(this);
        // Wave 1 has not started, so the board opens in planning mode.
        this._refreshRouteVisibility();

        // ── Hero ────────────────────────────────
        this.hero = new Hero(this, 10, 7);

        // ── Placement preview ───────────────────
        this.previewSprite = this.add.sprite(0, 0, `tower_${ELEMENTS.WATER}`);
        this.previewSprite.setScale(2).setAlpha(0.55).setVisible(false).setDepth(30);

        this.previewRange = this.add.circle(0, 0, 100, 0xffffff, 0.06);
        this.previewRange.setStrokeStyle(1, 0xffffff, 0.15);
        this.previewRange.setVisible(false).setDepth(1);

        this.previewTile = this.add.rectangle(0, 0, TILE_SIZE - 2, TILE_SIZE - 2, 0x00ff00, 0.2);
        this.previewTile.setStrokeStyle(1, 0x00ff00, 0.4);
        this.previewTile.setVisible(false).setDepth(2);

        // What the cell under the cursor is about to cost or pay you, or why it
        // is refused. Said before the click, because an outcome you cannot see
        // in advance is one you cannot plan around.
        this.cursorLabel = this.add.text(0, 0, '', {
            fontFamily: '"Press Start 2P"', fontSize: '8px',
            color: '#FFD700', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 1).setVisible(false).setDepth(31);

        // ── Input ───────────────────────────────
        this.input.mouse.disableContextMenu();
        this.input.on('pointerdown', (pointer, gameObjects) => {
            if (this.gameOver || this.gameWon) return;
            if (this.uiModalOpen) return;       // upgrade panel has the floor
            if (pointer.x >= GAME_WIDTH) return; // sidebar click

            // Right click → move hero exact position, even if clicking on a tower
            if (pointer.button === 2) {
                this.hero.moveTo(pointer.x, pointer.y);
                return;
            }

            // Only genuine UI overlays (e.g. the fusion badge) swallow the click.
            // Tower sprites must not, or you cannot build right next to them.
            const blocked = gameObjects.some(o => o.getData && o.getData('uiBlocker'));
            if (blocked && !this.sellMode) return;

            this._handleClick(pointer);
        });
        this.input.on('pointermove', (pointer) => this._handleMove(pointer));
        this.input.keyboard.on('keydown-ESC', () => this._cancelPlacement());

        // ── Internal events ─────────────────────
        this.events.on('select-element', (el) => {
            this.selectedElement = el;
            this.isBarricadeMode = false;
            this.isTempleMode = false;
            this._setSellMode(false);
            this._clearBarricadeProbe();
            this.placementMode = true;
            this.previewSprite.setTexture(safeTexture(this, `tower_${el}`, 'tower_earth'));
            this.previewRange.setVisible(true);
            // Show the range the tower will actually have, upgrades included.
            this.previewRange.setRadius(
                TOWER_DATA[el].range * this.templeSystem.multiplier(el, 'range')
            );
            this.buildGrid.setVisible(true);
            this._refreshRouteVisibility();
        });

        this.events.on('select-barricade', () => {
            this.selectedElement = 'barricade';
            this.isBarricadeMode = true;
            this.isTempleMode = false;
            this._setSellMode(false);
            this.placementMode = true;
            this.previewSprite.setTexture('tile_barricade');
            this.previewRange.setVisible(false);
            this.buildGrid.setVisible(true);
            this._refreshRouteVisibility();
            this._barricadeProbeKey = null;
        });

        this.events.on('select-temple', (el) => {
            this.selectedElement = el;
            this.isTempleMode = true;
            this.isBarricadeMode = false;
            this._setSellMode(false);
            this._clearBarricadeProbe();
            this.placementMode = true;
            this.previewSprite.setTexture(safeTexture(this, `temple_${el}`, 'temple_earth'));
            this.previewRange.setVisible(true);
            this.previewRange.setRadius(TEMPLE_DATA[el].absorbRadius);
            this.buildGrid.setVisible(true);
            this._refreshRouteVisibility();
        });

        // Selling is a placement mode in reverse: a cursor mode that acts on
        // the cell you click, so it takes the build cursor's slot rather than
        // living inside a per-building menu.
        this.events.on('select-sell', () => {
            this.selectedElement = null;
            this.placementMode = false;
            this.isBarricadeMode = false;
            this.isTempleMode = false;
            this.previewSprite.setVisible(false);
            this.previewRange.setVisible(false);
            this._setSellMode(true);
            this._clearBarricadeProbe();
            this._refreshRouteVisibility();
            this.buildGrid.setVisible(true);
        });

        // Anything that moves a wall moves the route with it.
        this.events.on('path-changed', () => {
            this.routeView.refresh();
            this._barricadeProbeKey = null;
        });

        this.events.on('start-wave', () => this.waveManager.startWave());

        // The route hides for the duration of a wave and comes back the moment
        // the board is clear again, which is when planning resumes.
        this.events.on('wave-started', () => this._refreshRouteVisibility());
        this.events.on('wave-complete', () => this._refreshRouteVisibility());

        this.events.on('game-over', () => { this.gameOver = true; });
        this.events.on('all-waves-complete', () => {
            if (!this.gameOver) this.gameWon = true;
        });

        // ── Audio ───────────────────────────────
        // Wired off the events the game already emits, so the systems stay
        // unaware that anything is listening.
        this.audio = audio;
        const on = (event, cue, arg) => this.events.on(event, () => audio.play(cue, arg));
        on('enemy-died', 'die');
        on('enemy-reached-end', 'leak');
        on('mana-collected', 'mana');
        on('fusion-complete', 'fusion');
        on('temple-upgraded', 'upgrade');
        on('temple-built', 'temple');
        on('wave-started', 'wave');
        on('game-over', 'gameOver');
        on('all-waves-complete', 'victory');

        // ── Launch parallel UI scene ────────────
        this.scene.launch('UIScene', { gameScene: this });
    }

    // ─── Map rendering ──────────────────────────────────
    _renderMap() {
        this.tileNodes = new Map();  // 'c,r' → terrain sprites for that cell
        this.decor = new Map();      // 'c,r' → boulder / barricade sprite

        for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
                this._paintCell(c, r);
                if (this.gridSystem.grid[r][c] === TILE.BREAKABLE) {
                    this.breakableBlocks.set(`${c},${r}`, 80); // 80 HP for breakable
                    this._setDecor(c, r, `breakable_${cellHash(c, r) % BREAKABLE_VARIANTS}`);
                }
            }
        }

        // Faint build grid, only shown while placing something
        this.buildGrid = this.add.graphics().setDepth(D_GRID).setVisible(false);
        this.buildGrid.lineStyle(1, 0xffffff, 0.07);
        for (let c = 1; c < GRID_COLS; c++) {
            this.buildGrid.lineBetween(c * TILE_SIZE, 0, c * TILE_SIZE, GAME_HEIGHT);
        }
        for (let r = 1; r < GRID_ROWS; r++) {
            this.buildGrid.lineBetween(0, r * TILE_SIZE, GAME_WIDTH, r * TILE_SIZE);
        }

        // Entrance / Exit markers
        const enter = WAYPOINTS[1]; // first visible waypoint
        this.add.text(
            8, enter.row * TILE_SIZE + TILE_SIZE / 2,
            '▶', { fontSize: '18px', color: '#66BB6A' }
        ).setOrigin(0, 0.5).setDepth(3);

        const exit = WAYPOINTS[WAYPOINTS.length - 2]; // last visible
        this.add.text(
            exit.col * TILE_SIZE + TILE_SIZE, exit.row * TILE_SIZE + TILE_SIZE / 2,
            '🏠', { fontSize: '14px' }
        ).setOrigin(0, 0.5).setDepth(3);
    }

    _isGrass(col, row) {
        if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false;
        return this.gridSystem.grid[row][col] === TILE.GRASS;
    }

    _isRoad(col, row) {
        if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false;
        return this.gridSystem.grid[row][col] !== TILE.GRASS;
    }

    /**
     * (Re)builds the terrain sprites for one cell: base tile plus whatever
     * transition overlays its neighbours call for.
     */
    _paintCell(col, row) {
        const key = `${col},${row}`;
        const prev = this.tileNodes.get(key);
        if (prev) for (const s of prev) s.destroy();

        const nodes = [];
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        const h = cellHash(col, row);

        const put = (texture, depth) => {
            const img = this.add
                .image(x, y, safeTexture(this, texture, 'grass_0'))
                .setOrigin(0, 0).setDepth(depth);
            nodes.push(img);
            return img;
        };

        // Mirroring the full-bleed base tile turns N variants into 4N patterns,
        // which is what stops the lawn from reading as a repeated stamp.
        const putBase = (texture) => {
            put(texture, D_BASE)
                .setFlipX(((h >>> 17) & 1) === 1)
                .setFlipY(((h >>> 18) & 1) === 1);
        };

        const up = this._isRoad(col, row - 1);
        const down = this._isRoad(col, row + 1);
        const left = this._isRoad(col - 1, row);
        const right = this._isRoad(col + 1, row);

        if (this._isGrass(col, row)) {
            putBase(`grass_${h % GRASS_VARIANTS}`);
            // Dirt kicked onto the verge by whatever walks past
            if (up) put('scat_top', D_SCATTER);
            if (down) put('scat_bottom', D_SCATTER);
            if (left) put('scat_left', D_SCATTER);
            if (right) put('scat_right', D_SCATTER);
        } else {
            putBase(`dirt_${(h >>> 3) % DIRT_VARIANTS}`);

            // Ruts follow the direction of travel so the road reads continuous
            const rv = (h >>> 7) % RUT_VARIANTS;
            if (left && right && !(up && down)) put(`rut_h_${rv}`, D_RUT);
            else if (up && down && !(left && right)) put(`rut_v_${rv}`, D_RUT);

            // Grass overhanging each side that borders a lawn
            const ev = (h >>> 11) % EDGE_VARIANTS;
            if (this._isGrass(col, row - 1)) put(`edge_top_${ev}`, D_EDGE);
            if (this._isGrass(col, row + 1)) put(`edge_bottom_${ev}`, D_EDGE);
            if (this._isGrass(col - 1, row)) put(`edge_left_${ev}`, D_EDGE);
            if (this._isGrass(col + 1, row)) put(`edge_right_${ev}`, D_EDGE);

            // Inside corners: grass pokes through where two road tiles meet
            if (this._isGrass(col - 1, row - 1) && up && left) put('corner_tl', D_CORNER);
            if (this._isGrass(col + 1, row - 1) && up && right) put('corner_tr', D_CORNER);
            if (this._isGrass(col - 1, row + 1) && down && left) put('corner_bl', D_CORNER);
            if (this._isGrass(col + 1, row + 1) && down && right) put('corner_br', D_CORNER);
        }

        this.tileNodes.set(key, nodes);
    }

    /** Repaints a cell and its 8 neighbours, so transitions stay consistent. */
    _repaintArea(col, row) {
        for (let r = row - 1; r <= row + 1; r++) {
            for (let c = col - 1; c <= col + 1; c++) {
                if (c >= 0 && c < GRID_COLS && r >= 0 && r < GRID_ROWS) this._paintCell(c, r);
            }
        }
    }

    _setDecor(col, row, texture) {
        const key = `${col},${row}`;
        const existing = this.decor.get(key);
        if (existing) existing.destroy();
        if (!texture) {
            this.decor.delete(key);
            return;
        }
        const s = this.add.image(
            col * TILE_SIZE + TILE_SIZE / 2,
            row * TILE_SIZE + TILE_SIZE / 2,
            safeTexture(this, texture, 'breakable_0')
        ).setDepth(D_DECOR).setFlipX(((cellHash(col, row) >>> 19) & 1) === 1);
        this.decor.set(key, s);
    }

    // ─── Input handling ─────────────────────────────────
    _handleClick(pointer) {
        if (pointer.button !== 0) return;
        const { col, row } = this.gridSystem.worldToGrid(pointer.x, pointer.y);

        if (this.sellMode) {
            this._trySell(col, row);
            return;
        }

        // Left click → place tower
        if (this.placementMode && this.selectedElement) this._tryPlace(col, row);
    }

    _handleMove(pointer) {
        if ((!this.placementMode && !this.sellMode) || pointer.x >= GAME_WIDTH) {
            this.previewSprite.setVisible(false);
            this.previewRange.setVisible(false);
            this.previewTile.setVisible(false);
            this.cursorLabel.setVisible(false);
            this._clearBarricadeProbe();
            return;
        }

        const { col, row } = this.gridSystem.worldToGrid(pointer.x, pointer.y);
        const pos = this.gridSystem.gridToWorld(col, row);

        if (this.sellMode) {
            const sale = this._sellableAt(col, row);
            // Only cells that hold something get marked: a red square on every
            // patch of empty grass reads as "you cannot build here" instead.
            this.previewTile.setPosition(pos.x, pos.y).setVisible(!!sale);
            this.previewTile.fillColor = 0xFF5252;
            this.previewTile.fillAlpha = 0.28;
            this.previewTile.setStrokeStyle(1, 0xFF5252, 0.6);

            if (sale) this._showCursorLabel(pos, `+${sale.refund}`, '#FFD700');
            else this.cursorLabel.setVisible(false);
            return;
        }

        let ok = false;
        if (this.isBarricadeMode) {
            const probe = this._probeBarricade(col, row);
            ok = probe.ok;

            // The detour this barricade would carve, drawn before you pay for
            // it — that preview is the whole point of the readout.
            if (probe.ok) this.routeView.showPreview(probe.route);
            else this.routeView.hidePreview();

            if (probe.reason) this._showCursorLabel(pos, BLOCK_REASON[probe.reason], '#FF8A80');
            else this.cursorLabel.setVisible(false);
        } else {
            ok = this.gridSystem.canBuildTower(col, row) && !this.occupiedCells.has(`${col},${row}`);
            this.cursorLabel.setVisible(false);
        }

        // The ghost only appears on buildable ground; drawing it over an
        // existing tower just produced a smear of two overlapping sprites.
        this.previewSprite.setPosition(pos.x, pos.y).setVisible(ok);
        this.previewRange.setPosition(pos.x, pos.y).setVisible(ok && !this.isBarricadeMode);

        this.previewTile.setPosition(pos.x, pos.y).setVisible(true);
        this.previewTile.fillColor = ok ? 0x00ff00 : 0xff0000;
        this.previewTile.fillAlpha = ok ? 0.2 : 0.28;
        this.previewTile.setStrokeStyle(1, ok ? 0x00ff00 : 0xff0000, 0.5);
    }

    // ─── Barricades ─────────────────────────────────────
    /**
     * What a barricade on this cell would do to the map: the route it would
     * leave behind, or the reason it has to be refused.
     *
     * Mazing is only fun while every enemy still has somewhere to go, so this
     * asks two questions rather than one — whether the spawn can still reach
     * the exit, and whether everything already walking can too. A wall that
     * seals a straggler into a pocket passes the first test and still parks it
     * against the bricks for the rest of the game.
     */
    _barricadeOutcome(col, row) {
        if (!this.gridSystem.canBuildBarricade(col, row)) return { ok: false };

        const exit = WAYPOINTS[WAYPOINTS.length - 1];
        const previous = this.gridSystem.grid[row][col];
        this.gridSystem.grid[row][col] = TILE.BARRICADE;

        const route = this.gridSystem.findPath(
            WAYPOINTS[0].col, WAYPOINTS[0].row, exit.col, exit.row
        );

        let stranded = false;
        if (route) {
            for (const e of this.enemies) {
                if (!e.alive) continue;
                const raw = this.gridSystem.worldToGrid(e.x, e.y);
                const cell = this.gridSystem.nearestWalkable(raw.col, raw.row);
                if (!this.gridSystem.findPath(cell.col, cell.row, exit.col, exit.row)) {
                    stranded = true;
                    break;
                }
            }
        }

        this.gridSystem.grid[row][col] = previous;

        if (!route) return { ok: false, reason: 'route' };
        if (stranded) return { ok: false, reason: 'enemy' };
        return { ok: true, route };
    }

    /**
     * Same answer, cached per cell. The hover fires on every mouse move and the
     * outcome costs a pathfind per living enemy, so it is only recomputed when
     * the cursor actually changes cell. The commit re-asks for real.
     */
    _probeBarricade(col, row) {
        const key = `${col},${row}`;
        if (key !== this._barricadeProbeKey) {
            this._barricadeProbeKey = key;
            this._barricadeProbe = this._barricadeOutcome(col, row);
        }
        return this._barricadeProbe;
    }

    /**
     * The route is on while you are placing something, and on between rounds
     * whether or not you are — those are the two moments it is a thing you act
     * on. Mid-wave with nothing on the cursor it goes away: the enemies walking
     * it are a better answer to where the route goes than a line about it.
     */
    _refreshRouteVisibility() {
        if (!this.routeView) return;
        this.routeView.setActive(this.placementMode || !this.waveManager.waveActive);
    }

    /** Drops the cached answer and the detour it was drawing. */
    _clearBarricadeProbe() {
        this._barricadeProbeKey = null;
        this._barricadeProbe = null;
        if (this.routeView) this.routeView.hidePreview();
    }

    _showCursorLabel(pos, text, color) {
        // Clamped so a long refusal never runs off the edge of the map.
        this.cursorLabel
            .setPosition(Phaser.Math.Clamp(pos.x, 90, GAME_WIDTH - 90), pos.y - 16)
            .setText(text)
            .setColor(color)
            .setVisible(true);
    }

    _tryPlace(col, row) {
        if (this.isBarricadeMode) {
            // Asked again at commit time: the cached hover answer can be a few
            // frames old, and enemies move.
            const outcome = this._barricadeOutcome(col, row);
            if (!outcome.ok) {
                if (outcome.reason) {
                    audio.play('deny');
                    this.cameras.main.shake(100, 0.005);
                    this.events.emit('hint', BLOCK_REASON[outcome.reason], '#FF8A80');
                }
                return;
            }

            if (!this.economySystem.spendGold(BARRICADE_COST)) return;

            this.gridSystem.grid[row][col] = TILE.BARRICADE;
            audio.play('build');
            this._setDecor(col, row, 'tile_barricade');
            this.barricades.set(`${col},${row}`, BARRICADE_COST);
            this.events.emit('path-changed');
            return;
        }

        const ok = this.gridSystem.canBuildTower(col, row) && !this.occupiedCells.has(`${col},${row}`);
        if (!ok) return;

        if (this.isTempleMode) {
            const element = this.selectedElement;
            const cost = this.templeSystem.nextCost;
            if (!this.economySystem.spendGold(cost)) return;

            const temple = new Temple(this, col, row, element, cost);
            this.temples.push(temple);
            this.occupiedCells.add(`${col},${row}`);

            this.fusionSystem.refresh();
            this.events.emit('temple-built', element);

            // Every temple standing raises the price of the next one, so the
            // one just placed almost always ends the build streak.
            if (this.economySystem.gold < this.templeSystem.nextCost) {
                this._cancelPlacement();
            }
            return;
        }

        // Latch the element before paying: spendGold emits 'gold-changed'
        // synchronously, and UIScene reacts by cancelling placement as soon as
        // the tower becomes unaffordable — which nulls this.selectedElement
        // out from under us mid-build.
        const element = this.selectedElement;
        const data = TOWER_DATA[element];
        if (!this.economySystem.spendGold(data.cost)) return;

        audio.play('build');
        const tower = new Tower(this, col, row, element, data.cost);
        this.towers.push(tower);
        this.occupiedCells.add(`${col},${row}`);

        // Check fusion opportunity
        this.fusionSystem.refresh();

        // Cancel placement if can't afford another
        if (this.economySystem.gold < data.cost) {
            this._cancelPlacement();
        }
    }

    // ─── Selling ────────────────────────────────────────
    _setSellMode(on) {
        this.sellMode = on;
        // The build cursor marks empty ground, so its tile belongs under the
        // sprites; the sell cursor marks a building, and a highlight hidden
        // beneath the very thing it points at is no highlight at all.
        if (this.previewTile) this.previewTile.setDepth(on ? 20 : 2);
        if (!on && this.cursorLabel) this.cursorLabel.setVisible(false);
    }

    /** What the player can sell on a given cell, and what it pays back. */
    _sellableAt(col, row) {
        const key = `${col},${row}`;

        const tower = this.towers.find(t => t.alive && t.col === col && t.row === row);
        if (tower) return { kind: 'tower', target: tower, refund: refundValue(tower.paidCost) };

        const temple = this.temples.find(t => t.alive && t.col === col && t.row === row);
        if (temple) return { kind: 'temple', target: temple, refund: refundValue(temple.paidCost) };

        if (this.barricades.has(key)) {
            return { kind: 'barricade', refund: refundValue(this.barricades.get(key)) };
        }
        return null;
    }

    _trySell(col, row) {
        const sale = this._sellableAt(col, row);
        if (!sale) return;

        const key = `${col},${row}`;
        const pos = this.gridSystem.gridToWorld(col, row);

        if (sale.kind === 'barricade') {
            this.barricades.delete(key);
            this.gridSystem.grid[row][col] = TILE.PATH;
            this._setDecor(col, row, null);
            this.events.emit('path-changed');
        } else {
            sale.target.destroy();
            if (sale.kind === 'tower') this.towers = this.towers.filter(t => t !== sale.target);
            else this.temples = this.temples.filter(t => t !== sale.target);
            this.occupiedCells.delete(key);
            // Demolishing one half of a pair kills that offer and can free the
            // tile for a different one, so every offer is recomputed.
            this.fusionSystem.refresh();
        }

        this.economySystem.addGold(sale.refund);
        audio.play('sell');
        this._sellPoof(pos.x, pos.y, sale.refund);
        this.events.emit('structure-sold', sale.kind, sale.refund);

        // The cell is empty now, so the readout hanging over it is stale.
        this.cursorLabel.setVisible(false);
        this.previewTile.setVisible(false);
    }

    _sellPoof(x, y, refund) {
        const ring = this.add.circle(x, y, 10, 0xFFD700, 0).setDepth(30);
        ring.setStrokeStyle(2, 0xFFD700, 0.9);
        this.tweens.add({
            targets: ring,
            scaleX: 2.2, scaleY: 2.2,
            alpha: 0,
            duration: 320,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
        });

        const t = this.add.text(x, y - 10, `+${refund}`, {
            fontFamily: '"Press Start 2P"', fontSize: '8px',
            color: '#FFD700', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(31);

        this.tweens.add({
            targets: t,
            y: y - 32,
            alpha: 0,
            duration: 700,
            ease: 'Quad.easeOut',
            onComplete: () => t.destroy(),
        });
    }

    _cancelPlacement() {
        this.placementMode = false;
        this.selectedElement = null;
        this.isBarricadeMode = false;
        this.isTempleMode = false;
        this._setSellMode(false);
        this.previewSprite.setVisible(false);
        this.previewRange.setVisible(false);
        this.previewTile.setVisible(false);
        this.cursorLabel.setVisible(false);
        if (this.buildGrid) this.buildGrid.setVisible(false);
        this._clearBarricadeProbe();
        this._refreshRouteVisibility();
        this.events.emit('placement-cancelled');
    }

    // ─── Game loop ──────────────────────────────────────
    update(time, delta) {
        if (this.gameOver || this.gameWon) return;

        delta *= this.time.timeScale;

        // Raw `time`, not the scaled delta above: the dots crawl at their own
        // pace regardless of the game speed.
        this.routeView.update(time);

        // Towers
        for (const t of this.towers) t.update(time, this.enemies);

        // Enemies
        for (const e of this.enemies) e.update(time, delta);

        // Mana motes — only temples harvest them now
        for (const m of this.manaMotes) m.update(time, delta);
        this.templeSystem.updateAbsorption(this.manaMotes);

        // Life force nobody can drink just evaporates, and that is invisible
        // unless we say so — this is the one moment the rule has to be taught.
        if (!this._manaHintShown && this.temples.length === 0 && this.manaMotes.length > 0) {
            this._manaHintShown = true;
            this.events.emit('hint', 'Templo o heroe: alguien debe absorber ✦');
        }

        // Wave manager
        this.waveManager.update(time, delta);

        // Hero
        this.hero.update(time, delta);

        // Cleanup dead entities
        this.towers = this.towers.filter(t => t.alive);
        this.temples = this.temples.filter(t => t.alive);
        this.enemies = this.enemies.filter(e => e.alive);
        this.projectiles = this.projectiles.filter(p => p.alive);
        this.manaMotes = this.manaMotes.filter(m => m.alive);
    }

    // ─── Breakable Blocks ───────────────────────────────
    damageBlock(col, row, amount) {
        const key = `${col},${row}`;
        if (!this.breakableBlocks.has(key)) return;
        const hp = this.breakableBlocks.get(key) - amount;
        if (hp <= 0) {
            this.breakableBlocks.delete(key);
            this.gridSystem.grid[row][col] = TILE.PATH;
            this._setDecor(col, row, null);
            this._repaintArea(col, row);
            this.cameras.main.shake(100, 0.005);
            this.events.emit('path-changed');
        } else {
            this.breakableBlocks.set(key, hp);
            const s = this.decor.get(key);
            if (s) {
                s.setTint(0xff5555);
                this.time.delayedCall(100, () => {
                    if (s && s.active) s.clearTint();
                });
            }
        }
    }
}
