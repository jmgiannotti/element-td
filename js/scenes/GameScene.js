import * as Phaser from 'phaser';
import { GridSystem, TILE_SIZE, TILE } from '../systems/GridSystem.js';
import { DEFAULT_LEVEL, getLevelById } from '../data/LevelData.js';
import { WaveManager } from '../systems/WaveManager.js';
import { EconomySystem, BARRICADE_COST, refundValue } from '../systems/EconomySystem.js';
import { FusionSystem } from '../systems/FusionSystem.js';
import { TempleSystem } from '../systems/TempleSystem.js';
import { BarricadeSystem } from '../systems/BarricadeSystem.js';
import { SealSystem } from '../systems/SealSystem.js';
import { BARRICADE_ENCHANTS, ENCHANT_ORDER, enchantCostLabel } from '../data/BarricadeData.js';
import { RouteView } from '../systems/RouteView.js';
import { FloatingText } from '../systems/FloatingText.js';
import { TutorialSystem, tutorialWanted } from '../systems/TutorialSystem.js';
import { SpellSystem } from '../systems/SpellSystem.js';
import { TelegraphSystem } from '../systems/TelegraphSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { audio } from '../systems/AudioSystem.js';
import { Enemy } from '../entities/Enemy.js';
import { Projectile } from '../entities/Projectile.js';
import { ABILITY_ORDER, HERO_ABILITIES } from '../data/HeroData.js';
import { SPELLS, SPELL_ORDER } from '../data/SpellData.js';
import { Tower } from '../entities/Tower.js';
import { Temple } from '../entities/Temple.js';
import { Hero } from '../entities/Hero.js';
import { TOWER_DATA, ELEMENTS, TOWER_UPGRADE } from '../data/TowerData.js';
import { TEMPLE_DATA, TRACK_ORDER, upgradeCost } from '../data/TempleData.js';
import {
    cellHash, cellLayers, breakableKey, biomeKey, resolveBiome, townProps, BIOMES,
} from '../systems/Terrain.js';
import { safeTexture } from '../systems/TextureGuard.js';
import { IconText } from '../systems/IconText.js';
import { applyBoardViewport, pointerWorld } from '../systems/Viewport.js';

// Depth budget above the terrain layers (see Terrain.js), below entities (≥ 1).
const D_GRID = 0.5;
const D_DECOR = 0.6;

// Why a barricade is refused. Only the two blocking cases get a message —
// hovering plain grass is already answered by the red tile.
const BLOCK_REASON = {
    route: 'Cerraria el camino',
    enemy: 'Encerraria a un enemigo',
};

// Three-letter track names for the inspector card. The upgrade panel has room
// for DAÑO/CADENCIA/ALCANCE; a label hanging over a 32px tile does not.
const TRACK_SHORT = { damage: 'DMG', fireRate: 'CAD', range: 'ALC' };

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data) {
        this.initData = data || {};
        this.levelData = data?.levelData || (data?.levelId ? getLevelById(data.levelId) : DEFAULT_LEVEL);
        // What the ground is made of. Paint only — the rules are the same on
        // every biome.
        this.biome = resolveBiome(this.levelData.biome);
    }

    create() {
        // ── Systems ─────────────────────────────
        this.gridSystem = new GridSystem(this.levelData);

        // The canvas is a supersampled buffer, so the camera has to be zoomed to
        // it before anything is drawn — otherwise the world would render into one
        // corner. A level bigger than 20×15 is also zoomed out to fit the board.
        // Done here rather than once at boot because restarting the game builds
        // a brand-new camera.
        this.boardZoom = applyBoardViewport(this, this.gridSystem.worldWidth, this.gridSystem.worldHeight);
        // Built before anything that can take damage: Enemy.takeDamage reaches
        // for it on the very first hit.
        this.floating = new FloatingText(this);
        this.economySystem = new EconomySystem(this);
        this.waveManager = new WaveManager(this);
        this.fusionSystem = new FusionSystem(this);
        this.telegraphSystem = new TelegraphSystem(this);
        // Reads the hero and the enemy list lazily, at cast time, so it can be
        // built before either exists.
        this.spellSystem = new SpellSystem(this);

        // ── Entity lists ────────────────────────
        this.towers = [];
        this.towerHistory = [];
        this.temples = [];
        this.enemies = [];
        this.projectiles = [];
        // CENTINELAS ARCANOS currently on the road (see SpellSystem).
        this.sentinels = [];
        this.manaMotes = [];
        this.occupiedCells = new Set();
        this.breakableBlocks = new Map();
        // 'c,r' → gold paid. Barricades are decor plus a grid flag rather than
        // entities, so their price has to be remembered somewhere.
        this.barricades = new Map();

        // TempleSystem reads scene.temples, so it is built after the lists.
        this.templeSystem = new TempleSystem(this);
        // Enchantments on top of the barricades map above; reads it lazily.
        this.barricadeSystem = new BarricadeSystem(this);

        // ── State ───────────────────────────────
        this.selectedElement = null;
        this.placementMode = false;
        this.gameOver = false;
        this.gameWon = false;
        this.isBarricadeMode = false;
        this.isTempleMode = false;
        this.sellMode = false;
        // The spell whose cursor is armed, if any. Same one-at-a-time slot as
        // the build and sell cursors: all three act on the next click.
        this.spellMode = null;
        // Set by UIScene while the temple upgrade panel is open, so clicks
        // meant for the panel never fall through onto the map behind it.
        this.uiModalOpen = false;
        // The structure whose range is pinned open, if any.
        this.selectedStructure = null;

        // ── Render map ──────────────────────────
        this._renderMap();
        // After the ground is painted; towers read it lazily for their stats.
        this.sealSystem = new SealSystem(this, this.levelData);
        this.routeView = new RouteView(this);
        // Wave 1 has not started, so the board opens in planning mode.
        this._refreshRouteVisibility();

        // ── Hero ────────────────────────────────
        const { col: heroCol, row: heroRow } = this.levelData.heroSpawn;
        this.hero = new Hero(this, heroCol, heroRow);

        // ── Placement preview ───────────────────
        this.previewSprite = this.add.sprite(0, 0, `tower_${ELEMENTS.WATER}`);
        this.previewSprite.setScale(1).setAlpha(0.55).setVisible(false).setDepth(30);

        this.previewRange = this.add.circle(0, 0, 100, 0xffffff, 0.06);
        this.previewRange.setStrokeStyle(1, 0xffffff, 0.15);
        this.previewRange.setVisible(false).setDepth(1);

        // A single range circle used by all towers on hover/select, rather than
        // each tower having its own hidden graphics object.
        this.sharedRangeGfx = this.add.circle(0, 0, 100, 0xffffff, 0.07);
        this.sharedRangeGfx.setStrokeStyle(1, 0xffffff, 0.15);
        this.sharedRangeGfx.setVisible(false).setDepth(1);

        this.previewTile = this.add.rectangle(0, 0, TILE_SIZE - 2, TILE_SIZE - 2, 0x00ff00, 0.2);
        this.previewTile.setStrokeStyle(1, 0x00ff00, 0.4);
        this.previewTile.setVisible(false).setDepth(2);

        // Where a spell would land. Free of the grid on purpose — a spell hits
        // an area, not a cell, so snapping it to a tile would promise a
        // precision the effect does not have.
        this.spellCursor = this.add.circle(0, 0, 90, 0xffffff, 0.07);
        this.spellCursor.setStrokeStyle(1, 0xffffff, 0.5);
        this.spellCursor.setVisible(false).setDepth(2);

        // Particle system for fast visual effects
        this.particleSystem = new ParticleSystem(this);

        // What the cell under the cursor is about to cost or pay you, or why it
        // is refused. Said before the click, because an outcome you cannot see
        // in advance is one you cannot plan around.
        this.cursorLabel = new IconText(this, 0, 0, '', {
            fontFamily: '"Press Start 2P"', fontSize: '8px',
            color: '#FFD700', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 1).setVisible(false).setDepth(31);

        // The pinned tower's live numbers and individual upgrade interface.
        this._buildStatCard();

        // ── Input ───────────────────────────────
        this.input.mouse.disableContextMenu();
        this.input.on('pointerdown', (pointer, gameObjects) => {
            // Only a press the map itself received may later count as a click
            // on it — see the pointerup handler.
            this._pressStarted = false;
            if (pointer.event._uiConsumed) return;
            if (this.gameOver || this.gameWon) return;
            if (this.uiModalOpen) return;       // upgrade panel has the floor
            this._pressStarted = true;

            // Read through the camera, never off the pointer: `pointer.x` is in
            // the supersampled buffer's space, which is 2× or 3× the world.
            const p = pointerWorld(this, pointer);
            if (!this._onBoard(p)) return;       // sidebar click

            // Right click → cancel active mode, or move hero
            if (pointer.button === 2) {
                if (this.spellMode) {
                    this._setSpellMode(null);
                    audio.play('click');
                    return;
                }
                if (this.placementMode || this.sellMode) {
                    this._cancelPlacement();
                    audio.play('click');
                    return;
                }
                this.hero.moveTo(p.x, p.y);
                return;
            }

            // Only genuine UI overlays swallow the click. Tower sprites must
            // not, or you cannot build right next to them.
            const blocked = gameObjects.some(o => o.getData && o.getData('uiBlocker'));
            if (blocked && !this.sellMode) {
                this._pressConsumed = true;
                return;
            }

            // Handle active cursor modes (build, sell, spell)
            if (this.placementMode || this.sellMode || this.spellMode) {
                this._pressConsumed = this._handleClick(pointer, p);
                return;
            }

            // A press on a fusable building might be the start of a drag
            this.fusionSystem.onPointerDown(p);
        });

        this.input.on('pointermove', (pointer) => {
            const p = pointerWorld(this, pointer);
            this.fusionSystem.onPointerMove(p);
            this._handleMove(pointer);
        });

        // Inspecting a building happens on release, not on press. On press it is
        // indistinguishable from the first frame of a drag, and pinning a stat
        // card over the board every time someone reaches for a tower is the kind
        // of thing that makes a drag feel broken before it has even started.
        this.input.on('pointerup', (pointer, gameObjects) => {
            // A release whose press the map never saw is not a click on the
            // map. The case that needs this: CERRAR closes its panel on press,
            // so the UI is gone by the release, which then fell through to the
            // board and selected whatever tower sat under the button.
            const started = this._pressStarted;
            this._pressStarted = false;
            if (!started) { this._pressConsumed = false; return; }

            if (this.gameOver || this.gameWon || this.uiModalOpen) return;
            if (pointer.button !== 0 && pointer.button !== undefined) return;

            const p = pointerWorld(this, pointer);
            const wasDrag = this.fusionSystem.onPointerUp(p);
            const consumed = this._pressConsumed;
            this._pressConsumed = false;

            if (wasDrag || consumed) return;
            if (gameObjects && gameObjects.some(o => o.getData && o.getData('uiBlocker'))) return;
            if (!this._onBoard(p)) return;
            this._inspectAt(p);
        });
        this.input.keyboard.on('keydown-ESC', () => {
            this._cancelPlacement();
            this.selectStructure(null);
        });
        this.input.keyboard.on('keydown-U', () => {
            if (this.gameOver || this.gameWon || this.uiModalOpen) return;
            if (this.selectedStructure && this.selectedStructure instanceof Tower && this.selectedStructure.alive) {
                this._buyTowerUpgrade();
            }
        });

        // Hero abilities. Bound off the data so adding one to HeroData is the
        // only edit an extra ability needs.
        for (const key of ABILITY_ORDER) {
            const hotkey = HERO_ABILITIES[key].hotkey;
            this.input.keyboard.on(`keydown-${hotkey}`, () => {
                if (this.gameOver || this.gameWon || this.uiModalOpen) return;
                this.hero.useAbility(key);
            });
        }
        this._customHandlers = [];
        const onCustom = (ev, fn) => {
            this.events.on(ev, fn);
            this._customHandlers.push({ ev, fn });
        };
        this.events.once('shutdown', () => {
            for (const h of this._customHandlers) {
                this.events.off(h.ev, h.fn);
            }
        });

        onCustom('use-ability', (key) => {
            if (this.gameOver || this.gameWon) return;
            this.hero.useAbility(key);
        });

        // Spells. Same shape as the abilities, one difference: a spell arms a
        // cursor instead of firing, because it needs a place to land.
        for (const key of SPELL_ORDER) {
            this.input.keyboard.on(`keydown-${SPELLS[key].hotkey}`, () => {
                if (this.gameOver || this.gameWon || this.uiModalOpen) return;
                this._armSpell(key);
            });
        }
        onCustom('select-spell', (key) => {
            if (this.gameOver || this.gameWon) return;
            this._armSpell(key);
        });

        // ── Internal events ─────────────────────
        onCustom('select-element', (el) => {
            this.selectedElement = el;
            this.isBarricadeMode = false;
            this.isTempleMode = false;
            this._setSellMode(false);
            this._setSpellMode(null);
            this._clearBarricadeProbe();
            this.placementMode = true;
            // Temples take no seal bonus, so only a tower in hand lights them.
            this.sealSystem.setHighlight(el);
            this.previewSprite.setTexture(safeTexture(this, `tower_${el}`, 'tower_earth'));
            this.previewRange.setVisible(true);
            // Show the range the tower will actually have, upgrades included.
            this.previewRange.setRadius(
                TOWER_DATA[el].range * this.templeSystem.multiplier(el, 'range')
            );
            this.buildGrid.setVisible(true);
            this._refreshRouteVisibility();
        });

        onCustom('select-barricade', () => {
            this.selectedElement = 'barricade';
            this.isBarricadeMode = true;
            this.sealSystem.setHighlight(null);
            this.isTempleMode = false;
            this._setSellMode(false);
            this._setSpellMode(null);
            this.placementMode = true;
            this.previewSprite.setTexture('tile_barricade');
            this.previewRange.setVisible(false);
            this.buildGrid.setVisible(true);
            this._refreshRouteVisibility();
            this._barricadeProbeKey = null;
        });

        onCustom('select-temple', (el) => {
            this.selectedElement = el;
            this.isTempleMode = true;
            this.isBarricadeMode = false;
            this.sealSystem.setHighlight(null);
            this._setSellMode(false);
            this._setSpellMode(null);
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
        onCustom('select-sell', () => {
            this.selectedElement = null;
            this.placementMode = false;
            this.isBarricadeMode = false;
            this.isTempleMode = false;
            this.previewSprite.setVisible(false);
            this.previewRange.setVisible(false);
            this._setSellMode(true);
            this._setSpellMode(null);
            this._clearBarricadeProbe();
            this._refreshRouteVisibility();
            this.buildGrid.setVisible(true);
        });

        // Shutdown event to clean up static pools and systems
        this.events.on('shutdown', () => {
            this.input.keyboard.removeAllListeners();
            if (this.barricadeSystem) this.barricadeSystem.destroy();
            if (this.sealSystem) this.sealSystem.destroy();
            for (const s of this.sentinels || []) s.destroy();
            this.sentinels = [];
            if (this.particleSystem) {
                this.particleSystem.destroy();
                this.particleSystem = null;
            }
            // Clear static pools so they don't hold destroyed GameObjects
            Enemy.pool = [];
            Projectile.pool = [];
        });

        // Anything that moves a wall moves the route with it.
        this.events.on('path-changed', () => {
            this.routeView.refresh();
            this._barricadeProbeKey = null;
        });

        this.events.on('start-wave', () => this.waveManager.startWave());

        // A global upgrade is meant to be felt. If a tower is pinned open when
        // one lands, its numbers change under the cursor.
        this.events.on('temple-upgraded', () => this._refreshStatLabel());

        this.waveStartCheckpoint = null;

        // The route hides for the duration of a wave and comes back the moment
        // the board is clear again, which is when planning resumes.
        onCustom('wave-started', () => {
            this._refreshRouteVisibility();
            this.waveStartCheckpoint = {
                waveIndex: Math.max(0, this.waveManager.currentWave - 1),
                gold: this.economySystem.gold,
                mana: this.economySystem.mana,
                lives: this.economySystem.lives,
                heroPosX: this.hero ? this.hero.posX : null,
                heroPosY: this.hero ? this.hero.posY : null,
                heroHp: this.hero ? this.hero.hp : null,
                heroManaCollected: this.hero ? this.hero.manaCollected : null,
                towers: this.towers.map(t => ({
                    col: t.col,
                    row: t.row,
                    element: t.element,
                    paid: t.paidCost,
                    level: t.level || 1,
                    upg: t.upgradeSpent || 0,
                    damageDealt: t.totalDamageDealt || 0,
                    kills: t.enemiesKilled || 0,
                })),
                temples: this.temples.map(t => ({ col: t.col, row: t.row, element: t.element, paid: t.paidCost })),
                barricades: Array.from(this.barricades.entries()).map(([key, cost]) => {
                    const [c, r] = key.split(',').map(Number);
                    return { col: c, row: r, cost, enchant: this.barricadeSystem.typeAt(c, r) };
                }),
                breakableBlocks: Array.from(this.breakableBlocks.entries()).map(([key, hp]) => {
                    const [c, r] = key.split(',').map(Number);
                    return { col: c, row: r, hp };
                }),
                templeLevels: { ...this.templeSystem.levels },
            };
        });
        onCustom('gold-changed', () => {
            if (this.selectedStructure && this.selectedStructure.alive) {
                this._refreshStatLabel();
            }
        });
        // Only a bare barricade's card quotes a price in maná (Escarcha), and
        // maná moves every time a temple drinks, so nothing else listens.
        onCustom('mana-changed', () => {
            const s = this.selectedStructure;
            if (s && s.kind === 'barricade' && s.alive) this._refreshStatLabel();
        });
        onCustom('wave-complete', () => {
            this._refreshRouteVisibility();
            this.waveStartCheckpoint = null;
            SaveSystem.saveGame(this);
        });

        onCustom('game-over', () => {
            this.gameOver = true;
            this.waveStartCheckpoint = null;
            SaveSystem.clearSave();
        });
        onCustom('all-waves-complete', () => {
            if (!this.gameOver) this.gameWon = true;
            this.waveStartCheckpoint = null;
            SaveSystem.clearSave();
        });

        // ── Load Saved Game (if continuing) ─────
        let loaded = false;
        if (this.initData?.continueGame && SaveSystem.hasSave()) {
            loaded = SaveSystem.loadGame(this);
        }

        // ── Audio ───────────────────────────────
        // Wired off the events the game already emits, so the systems stay
        // unaware that anything is listening.
        this.audio = audio;
        const onAudio = (event, cue, arg) => onCustom(event, () => audio.play(cue, arg));
        onAudio('enemy-died', 'die');
        onAudio('enemy-reached-end', 'leak');
        onAudio('mana-collected', 'mana');
        onAudio('fusion-complete', 'fusion');
        onAudio('temple-upgraded', 'upgrade');
        onAudio('temple-built', 'temple');
        onAudio('wave-started', 'wave');
        onAudio('game-over', 'gameOver');
        onAudio('all-waves-complete', 'victory');

        // ── Launch parallel UI scene ────────────
        // Before the tutorial, which speaks through events UIScene renders.
        this.scene.launch('UIScene', { gameScene: this });

        // ── Tutorial ────────────────────────────
        // Only on the first map, and only until it has been seen once.
        this.tutorial = new TutorialSystem(this);
        if (loaded || this.waveManager.currentWave > 0 || this.temples.length > 0
            || !tutorialWanted(this.levelData)) {
            this.tutorial.active = false;
        }
    }

    /**
     * Whether a world point is on the board. The board camera shows exactly the
     * level's world, so anything outside it is the sidebar (or the margin round
     * a zoomed-out board) — the same test whatever the level's size.
     */
    _onBoard(p) {
        return p.x >= 0 && p.y >= 0 && p.x < this.gridSystem.worldWidth && p.y < this.gridSystem.worldHeight;
    }

    // ─── Map rendering ──────────────────────────────────
    _renderMap() {
        this.tileNodes = new Map();  // 'c,r' → terrain sprites for that cell
        this.decor = new Map();      // 'c,r' → boulder / barricade sprite

        const { cols, rows } = this.gridSystem;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                this._paintCell(c, r);
                if (this.gridSystem.grid[r][c] === TILE.BREAKABLE) {
                    this.breakableBlocks.set(`${c},${r}`, this.gridSystem.breakableHp(c, r));
                    this._setDecor(c, r, breakableKey(this.biome, c, r));
                }
            }
        }

        this._renderProps();

        // Faint build grid — corner marks instead of full lines for a spacious feel
        this.buildGrid = this.add.graphics().setDepth(D_GRID).setVisible(false);
        const MARK = 4;
        this.buildGrid.lineStyle(1, 0xffffff, 0.06);
        for (let c = 1; c < cols; c++) {
            for (let r = 1; r < rows; r++) {
                const gx = c * TILE_SIZE;
                const gy = r * TILE_SIZE;
                this.buildGrid.lineBetween(gx - MARK, gy, gx + MARK, gy);
                this.buildGrid.lineBetween(gx, gy - MARK, gx, gy + MARK);
            }
        }

        // Entrance and exit. Drawn buildings rather than a glyph and an emoji:
        // the two ends of the route are the most important landmarks on the
        // board, and a font is the one thing here that cannot match the art.
        // Both sit on the first/last cell inside the board; the keep stands
        // one cell in from the edge so it reads as the end of the road.
        const { spawnPoint: enter, exitPoint: exit } = this.gridSystem;
        const clampCol = (c) => Phaser.Math.Clamp(c, 0, cols - 1);
        const clampRow = (r) => Phaser.Math.Clamp(r, 0, rows - 1);
        const enterPos = this.gridSystem.gridToWorld(clampCol(enter.col), clampRow(enter.row));
        this.add.image(enterPos.x, enterPos.y, safeTexture(this, 'gate_spawn', 'tile_barricade'))
            .setDepth(D_DECOR);

        const exitPos = this.gridSystem.gridToWorld(clampCol(exit.col) - 1, clampRow(exit.row));
        this.add.image(exitPos.x, exitPos.y, safeTexture(this, 'gate_exit', 'tile_barricade'))
            .setDepth(D_DECOR);
    }

    /**
     * The town around a 'city' board (see Terrain.townProps). Each house, tree
     * and stall takes its cell, so nothing is built through a roof.
     */
    _renderProps() {
        if (!BIOMES[this.biome].town) return;
        for (const p of townProps(this.gridSystem)) {
            this.add.image(p.x, p.y, safeTexture(this, p.key, 'tile_barricade'))
                .setOrigin(0, 0).setDepth(D_DECOR);
            for (const cell of p.cells) this.occupiedCells.add(cell);
        }
    }

    /**
     * (Re)builds the terrain sprites for one cell: base tile plus whatever
     * transition overlays its neighbours call for (see Terrain.cellLayers).
     */
    _paintCell(col, row) {
        const key = `${col},${row}`;
        const prev = this.tileNodes.get(key);
        if (prev) for (const s of prev) s.destroy();

        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        const fallback = biomeKey(this.biome, 'grass_0');
        const nodes = cellLayers(this.gridSystem, this.biome, col, row).map(l =>
            this.add.image(x, y, safeTexture(this, l.key, fallback))
                .setOrigin(0, 0).setDepth(l.depth)
                .setFlip(!!l.flipX, !!l.flipY)
        );

        this.tileNodes.set(key, nodes);
    }

    /** Repaints a cell and its 8 neighbours, so transitions stay consistent. */
    _repaintArea(col, row) {
        for (let r = row - 1; r <= row + 1; r++) {
            for (let c = col - 1; c <= col + 1; c++) {
                if (this.gridSystem.inBounds(c, r)) this._paintCell(c, r);
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
            safeTexture(this, texture, biomeKey(this.biome, 'breakable_0'))
        ).setDepth(D_DECOR).setFlipX(((cellHash(col, row) >>> 19) & 1) === 1);
        this.decor.set(key, s);
    }

    // ─── Spells ─────────────────────────────────────────
    /**
     * Put a spell on the cursor, or refuse it out loud.
     *
     * Refused here rather than on the click that follows: aiming a spell you
     * cannot pay for and only being told at the end is the sort of thing that
     * reads as the button being broken. Pressing the key again disarms, so the
     * hotkey is a toggle and never a trap.
     */
    _armSpell(key) {
        if (!SPELLS[key]) return;
        if (this.spellMode === key) {
            this._setSpellMode(null);
            return;
        }
        if (this.spellSystem.announceRefusal(key)) return;

        this._cancelPlacement();
        this._setSpellMode(key);
        audio.play('click');
    }

    /** Arms or clears the targeting cursor. Null puts it away. */
    _setSpellMode(key) {
        if (this.spellMode === key) return;
        this.spellMode = key ?? null;

        if (!this.spellMode) {
            this.spellCursor.setVisible(false);
            this.cursorLabel.setVisible(false);
            this.events.emit('spell-disarmed');
            return;
        }

        const spell = SPELLS[this.spellMode];
        this.spellCursor.setRadius(spell.radius);
        this.spellCursor.setFillStyle(spell.color, 0.07);
        this.spellCursor.setStrokeStyle(1, spell.color, 0.5);

        // Shown where the pointer already is, without waiting for it to move.
        // Arming from the button or the hotkey and seeing nothing until you
        // twitch the mouse reads as the spell not having armed at all.
        const p = pointerWorld(this, this.input.activePointer);
        if (this._onBoard(p)) this.spellCursor.setPosition(p.x, p.y).setVisible(true);

        this.events.emit('spell-armed', this.spellMode);
    }

    // ─── Input handling ─────────────────────────────────
    /**
     * What the press does, if anything. `world` is the pointer already resolved
     * through the camera by the caller.
     *
     * Returns true when the press was spent on a cursor mode, so the release
     * that follows knows not to also read it as an inspection click.
     */
    _handleClick(pointer, world) {
        if (pointer.button !== 0) return false;
        const p = world ?? pointerWorld(this, pointer);
        const { col, row } = this.gridSystem.worldToGrid(p.x, p.y);

        // A spell outranks every other cursor: it was armed most recently, and
        // it is the one the player is holding a countdown for.
        if (this.spellMode) {
            const key = this.spellMode;
            // A bad point (CENTINELAS off the road) is said and the spell stays
            // armed: the click was a miss, not a decision to put it away.
            if (this.spellSystem.announceTargetRefusal(key, p.x, p.y)) return true;
            this._setSpellMode(null);
            this.spellSystem.cast(key, p.x, p.y);
            return true;
        }

        if (this.sellMode) {
            this._trySell(col, row);
            return true;
        }

        // Left click → place tower
        if (this.placementMode && this.selectedElement) {
            this._tryPlace(col, row);
            return true;
        }

        return false;
    }

    /**
     * Nothing on the cursor and nothing dragged: the click was a question about
     * a building. Resolved from the cell rather than from the sprite that was
     * hit, so clicking the grass beside a tower reliably puts the ring away.
     */
    _inspectAt(world) {
        const { col, row } = this.gridSystem.worldToGrid(world.x, world.y);
        const tower = this.towers.find(t => t.alive && t.col === col && t.row === row);
        if (tower) {
            this.selectStructure(tower);
            return;
        }

        const temple = this.temples.find(t => t.alive && t.col === col && t.row === row);
        if (temple) {
            this.selectStructure(temple);
            return;
        }

        if (this.barricades.has(`${col},${row}`)) {
            // Handles are made fresh, so a second click on the same wall has to
            // hand back the pinned one for selectStructure to let go of it.
            const pinned = this.selectedStructure;
            const same = pinned?.kind === 'barricade' && pinned.col === col && pinned.row === row;
            this.selectStructure(same ? pinned : this.barricadeSystem.handle(col, row));
            return;
        }

        this.selectStructure(null);
    }

    // ─── Inspection & Upgrades ─────────────────────────
    _buildStatCard() {
        this.statCard = this.add.container(0, 0).setDepth(31).setVisible(false);

        this.statCardBg = this.add.rectangle(0, 0, 194, 95, 0x0a0a1a, 0.94)
            .setStrokeStyle(1, 0x3a3a5a)
            .setInteractive();
        this.statCardBg.setData('uiBlocker', true);
        this.statCardBg.on('pointerdown', (pointer) => {
            if (pointer.button !== 0 && pointer.button !== undefined) return;
            pointer.event.stopPropagation();
        });

        this.statText = this.add.text(-88, -40, '', {
            fontFamily: '"Press Start 2P"',
            fontSize: '8px',
            color: '#FFD54F',
            align: 'left',
            lineSpacing: 4,
        }).setOrigin(0, 0);

        this.upgradeBtnBg = this.add.rectangle(0, 30, 178, 22, 0x1e1e3a)
            .setStrokeStyle(1, 0x3a3a5a)
            .setInteractive({ useHandCursor: true });
        this.upgradeBtnBg.setData('uiBlocker', true);

        this.upgradeBtnText = this.add.text(0, 30, '', {
            fontFamily: '"Press Start 2P"',
            fontSize: '8px',
            color: '#FFFFFF',
        }).setOrigin(0.5);

        this.upgradeBtnBg.on('pointerdown', (pointer) => {
            if (pointer.button !== 0 && pointer.button !== undefined) return;
            pointer.event.stopPropagation();
            if (this.selectedStructure?.kind === 'barricade') this._buyEnchant(ENCHANT_ORDER[0]);
            else this._buyTowerUpgrade();
        });

        // Second button, only used by a bare barricade: one per enchantment.
        this.altBtnBg = this.add.rectangle(0, 30, 178, 22, 0x1e1e3a)
            .setStrokeStyle(1, 0x3a3a5a)
            .setInteractive({ useHandCursor: true })
            .setVisible(false);
        this.altBtnBg.setData('uiBlocker', true);
        this.altBtnText = this.add.text(0, 30, '', {
            fontFamily: '"Press Start 2P"',
            fontSize: '8px',
            color: '#FFFFFF',
        }).setOrigin(0.5).setVisible(false);
        this.altBtnBg.on('pointerdown', (pointer) => {
            if (pointer.button !== 0 && pointer.button !== undefined) return;
            pointer.event.stopPropagation();
            this._buyEnchant(ENCHANT_ORDER[1]);
        });

        this.statCard.add([
            this.statCardBg, this.statText, this.upgradeBtnBg, this.upgradeBtnText,
            this.altBtnBg, this.altBtnText,
        ]);
    }

    /**
     * Pins one tower's range open and shows what it actually does and allows upgrading it.
     * Passing null clears it.
     */
    selectStructure(structure) {
        if (this.selectedStructure === structure) {
            // Clicking the pinned tower again lets go of it.
            structure = null;
        }

        if (this.selectedStructure && this.selectedStructure.setSelected) {
            this.selectedStructure.setSelected(false);
        }
        this.selectedStructure = structure ?? null;

        if (!this.selectedStructure) {
            if (this.statCard) this.statCard.setVisible(false);
            return;
        }

        if (this.selectedStructure.setSelected) this.selectedStructure.setSelected(true);
        audio.play('click');
        this._refreshStatLabel();
    }

    /**
     * The card over a pinned structure: stats, temple buffs, individual rank,
     * and direct upgrade button with gold.
     */
    _refreshStatLabel() {
        const t = this.selectedStructure;
        if (!t || !t.alive) {
            if (this.statCard) this.statCard.setVisible(false);
            return;
        }

        const isTower = t instanceof Tower;
        if (t.kind === 'barricade') {
            this._refreshBarricadeCard(t);
            return;
        }
        this.altBtnBg.setVisible(false);
        this.altBtnText.setVisible(false);
        const ts = this.templeSystem;
        const templeLvl = ts ? ts.totalLevels(t.element) : 0;

        const lines = [];

        if (isTower) {
            lines.push(`${t.data.emoji} ${t.data.name}  Nv.${t.level}${templeLvl > 0 ? ` (Templo Nv.${templeLvl})` : ''}`);
            lines.push(`DMG ${Math.round(t.damage)}   RNG ${Math.round(t.range)}`);
            lines.push(`${t.shotsPerSecond.toFixed(2)}/s   ${t.data.specialDesc}`);
            lines.push(`Daño: ${Math.round(t.totalDamageDealt || 0)}  ·  Bajas: ${t.enemiesKilled || 0}`);
            lines.push(
                templeLvl > 0
                    ? TRACK_ORDER.map(tr => `${TRACK_SHORT[tr]} ${ts.levelOf(t.element, tr)}`).join('  ')
                    : 'sin mejoras de templo'
            );
            if (t.empowered) lines.push('potenciada por el heroe');
            const seal = this.sealSystem.bonusLabel(t.col, t.row, t.element);
            if (seal) lines.push(seal);

            // Upgrade button logic (US 8.1 Gold sink)
            this.upgradeBtnBg.setVisible(true);
            this.upgradeBtnText.setVisible(true);

            if (t.level >= TOWER_UPGRADE.MAX_LEVEL) {
                this.upgradeBtnText.setText('✓ NIVEL MAXIMO');
                this.upgradeBtnText.setColor('#4CAF50');
                this.upgradeBtnBg.fillColor = 0x14210f;
                this.upgradeBtnBg.setStrokeStyle(1, 0x4CAF50);
            } else {
                const cost = t.getNextUpgradeCost();
                const canAfford = this.economySystem.gold >= cost;
                this.upgradeBtnText.setText(`▲ MEJORAR [U]  ${cost} ORO`);
                this.upgradeBtnText.setColor(canAfford ? '#FFD700' : '#888899');
                this.upgradeBtnBg.fillColor = canAfford ? 0x241d3d : 0x16162a;
                this.upgradeBtnBg.setStrokeStyle(1, canAfford ? 0xFFD700 : 0x3a3a5a);
            }
        } else {
            // Temple
            lines.push(`${t.data.emoji || '🏛️'} ${t.data.name}${templeLvl > 0 ? `  Nv.${templeLvl}` : ''}`);
            lines.push(`Alcance: ${t.absorbRadius}px`);
            lines.push(`Absorbido: ${t.absorbed || 0} mana`);
            lines.push(templeLvl > 0 ? 'Click para ver arbol de mejoras' : 'Click para abrir mejoras');
            this.upgradeBtnBg.setVisible(false);
            this.upgradeBtnText.setVisible(false);
        }

        this.statText.setText(lines.join('\n'));
        this._layoutStatCard(t, isTower ? 1 : 0);
    }

    /**
     * A barricade's card: what it does now, and — while it is still bare — the
     * two enchantments, each on its own button and in its own currency.
     */
    _refreshBarricadeCard(t) {
        const type = this.barricadeSystem.typeAt(t.col, t.row);
        const lines = [];

        if (type) {
            const e = BARRICADE_ENCHANTS[type];
            lines.push(`Barricada de ${e.name}`);
            lines.push(e.desc);
            lines.push('Bloquea el paso');
            this.upgradeBtnBg.setVisible(false);
            this.upgradeBtnText.setVisible(false);
            this.altBtnBg.setVisible(false);
            this.altBtnText.setVisible(false);
            this.statText.setText(lines.join('\n'));
            this._layoutStatCard(t, 0);
            return;
        }

        lines.push('Barricada');
        lines.push('Bloquea el paso');
        lines.push('Encantala: afecta a quien');
        lines.push('camine a su lado');
        this.statText.setText(lines.join('\n'));

        const paint = (bg, txt, enchantType) => {
            const e = BARRICADE_ENCHANTS[enchantType];
            const ok = this.barricadeSystem.canAfford(enchantType);
            const hex = `#${e.color.toString(16).padStart(6, '0')}`;
            bg.setVisible(true);
            txt.setVisible(true);
            txt.setText(`${e.name.toUpperCase()}  ${enchantCostLabel(enchantType)}`);
            txt.setColor(ok ? hex : '#888899');
            bg.fillColor = ok ? 0x241d3d : 0x16162a;
            bg.setStrokeStyle(1, ok ? e.color : 0x3a3a5a);
        };
        paint(this.upgradeBtnBg, this.upgradeBtnText, ENCHANT_ORDER[0]);
        paint(this.altBtnBg, this.altBtnText, ENCHANT_ORDER[1]);
        this._layoutStatCard(t, 2);
    }

    _buyEnchant(type) {
        const t = this.selectedStructure;
        if (!t || t.kind !== 'barricade' || !t.alive) return;
        if (this.barricadeSystem.enchant(t.col, t.row, type)) {
            this._refreshStatLabel();
        } else {
            audio.play('deny');
            this.cameras.main.shake(90, 0.003);
        }
    }

    /** Sizes the card around its text and `buttons` stacked buttons, then places it. */
    _layoutStatCard(t, buttons) {
        // Measure content dimensions and adapt card size
        const textBounds = this.statText.getBounds();
        const cardW = Math.max(198, textBounds.width + 20);
        const cardH = textBounds.height + 18 + buttons * 26;

        this.statCardBg.setSize(cardW, cardH);
        if (this.statCardBg.input && this.statCardBg.input.hitArea) {
            this.statCardBg.input.hitArea.setSize(cardW, cardH);
        }
        this.statText.setPosition(-cardW / 2 + 10, -cardH / 2 + 8);

        const btnW = cardW - 16;
        const btnH = 22;
        // Bottom-up, so with two buttons the first one sits above the second.
        const stack = [[this.upgradeBtnBg, this.upgradeBtnText], [this.altBtnBg, this.altBtnText]]
            .slice(0, buttons);
        stack.forEach(([bg, txt], i) => {
            const y = cardH / 2 - 16 - (buttons - 1 - i) * 26;
            bg.setSize(btnW, btnH);
            if (bg.input && bg.input.hitArea) bg.input.hitArea.setSize(btnW, btnH);
            bg.setPosition(0, y);
            txt.setPosition(0, y);
        });

        // Clamp and position above/below the structure
        const clampedX = Phaser.Math.Clamp(
            t.x, cardW / 2 + 4, this.gridSystem.worldWidth - cardW / 2 - 4
        );
        if (t.y - 20 - cardH < 2) {
            // Below structure
            this.statCard.setPosition(clampedX, t.y + 22 + cardH / 2);
        } else {
            // Above structure
            this.statCard.setPosition(clampedX, t.y - 18 - cardH / 2);
        }
        this.statCard.setVisible(true);
    }

    _buyTowerUpgrade() {
        const t = this.selectedStructure;
        if (!t || !t.alive || !(t instanceof Tower)) return;
        if (t.level >= TOWER_UPGRADE.MAX_LEVEL) {
            audio.play('deny');
            return;
        }
        const cost = t.getNextUpgradeCost();
        if (this.economySystem.spendGold(cost)) {
            t.upgrade(cost);
            audio.play('upgrade');
            this._refreshStatLabel();
        } else {
            audio.play('deny');
            this.cameras.main.shake(90, 0.003);
        }
    }

    _archiveTower(tower) {
        if (!tower) return;
        const total = this.templeSystem ? this.templeSystem.totalLevels(tower.element) : 0;
        this.towerHistory.push({
            element: tower.element,
            emoji: tower.data?.emoji || '◈',
            name: tower.data?.name || tower.element,
            totalDamageDealt: tower.totalDamageDealt || 0,
            enemiesKilled: tower.enemiesKilled || 0,
            level: tower.level || 1,
            templeLevel: total,
        });
    }

    _handleMove(pointer) {
        const p = pointerWorld(this, pointer);
        if ((!this.placementMode && !this.sellMode && !this.spellMode) || !this._onBoard(p)) {
            this.previewSprite.setVisible(false);
            this.previewRange.setVisible(false);
            this.previewTile.setVisible(false);
            this.spellCursor.setVisible(false);
            this.cursorLabel.setVisible(false);
            this._clearBarricadeProbe();
            return;
        }

        // Unsnapped, and priced under the cursor: the two facts a spell has to
        // show before the click are where it reaches and what it takes.
        if (this.spellMode) {
            const spell = SPELLS[this.spellMode];
            const bad = this.spellSystem.targetRefusal(this.spellMode, p.x, p.y);
            // A road-only spell snaps to the cell it will actually land on.
            let at = p;
            if (spell.roadOnly) {
                const c = this.gridSystem.worldToGrid(p.x, p.y);
                at = this.gridSystem.gridToWorld(c.col, c.row);
            }
            this.spellCursor.setPosition(at.x, at.y).setVisible(true);
            this.spellCursor.setStrokeStyle(1, bad ? 0xFF5252 : spell.color, bad ? 0.8 : 0.5);
            this._showCursorLabel(
                { x: at.x, y: at.y - spell.radius - 8 },
                bad ? 'solo sobre el camino' : `${spell.label}  ${spell.cost}✦`,
                bad ? '#FF8A80' : spell.colorHex,
            );
            return;
        }

        const { col, row } = this.gridSystem.worldToGrid(p.x, p.y);
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
            const el = this.selectedElement;
            const isTower = !this.isTempleMode && TOWER_DATA[el];
            const bonus = ok && isTower ? this.sealSystem.bonusLabel(col, row, el) : null;
            if (bonus) this._showCursorLabel(pos, bonus, '#FFD54F');
            else this.cursorLabel.setVisible(false);
            // The ring previews the range the tower will really have on this cell.
            if (isTower) {
                this.previewRange.setRadius(
                    TOWER_DATA[el].range * this.templeSystem.multiplier(el, 'range')
                    * this.sealSystem.multiplier(col, row, el, 'range')
                );
            }
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

        const exit = this.gridSystem.exitPoint;
        const spawn = this.gridSystem.spawnPoint;
        const previous = this.gridSystem.grid[row][col];
        this.gridSystem.grid[row][col] = TILE.BARRICADE;

        const route = this.gridSystem.findPath(
            spawn.col, spawn.row, exit.col, exit.row
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
            .setPosition(Phaser.Math.Clamp(pos.x, 90, this.gridSystem.worldWidth - 90), pos.y - 16)
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
            this.barricadeSystem.remove(col, row);
            this.barricades.delete(key);
            this.gridSystem.grid[row][col] = TILE.PATH;
            this._setDecor(col, row, null);
            this.events.emit('path-changed');
        } else {
            if (sale.kind === 'tower') this._archiveTower(sale.target);
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
        // ESC or arming another cursor while a tower is in hand: put it back.
        this.fusionSystem.abortDrag();
        this.placementMode = false;
        this.selectedElement = null;
        this.isBarricadeMode = false;
        this.isTempleMode = false;
        this.sealSystem.setHighlight(null);
        this._setSellMode(false);
        this._setSpellMode(null);
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
        for (const t of this.towers) t.update(delta, this.enemies);

        // Enemies
        for (const e of this.enemies) e.update(time, delta);

        // Summoned soldiers, after the enemies have engaged them this frame
        for (const s of this.sentinels) s.update(delta);

        // Enchanted barricades, after the enemies have moved this frame
        this.barricadeSystem.update(delta);
        this.sealSystem.update(delta);

        // Temples, then the motes: a temple whose shutdown expires this frame
        // should be drinking again on this frame, not on the next one.
        for (const t of this.temples) t.update(delta);

        // Mana motes — only temples harvest them now
        for (const m of this.manaMotes) m.update(time, delta);
        this.templeSystem.updateAbsorption(this.manaMotes);

        // Life force nobody can drink just evaporates, and that is invisible
        // unless we say so — this is the one moment the rule has to be taught.
        // Unless the tutorial is already saying it, at more length and better.
        if (this.tutorial && this.tutorial.active) this._manaHintShown = true;
        if (!this._manaHintShown && this.temples.length === 0 && this.manaMotes.length > 0) {
            this._manaHintShown = true;
            this.events.emit('hint', 'Templo o heroe: alguien debe absorber ✦');
        }

        // Wave manager
        this.waveManager.update(time, delta);

        // Hero
        this.hero.update(time, delta);
        // After the hero: the channel VFX are pinned to where he ended up this
        // frame, not to where he was at the start of it.
        this.spellSystem.update(delta);
        this.telegraphSystem.update(delta);
        // Unscaled delta: a fusion drag is a cursor, not a thing in the world,
        // so it must not slow down or speed up with the VEL toggle.
        this.fusionSystem.update(this.game.loop.delta);

        // Tutorial — after the hero and the motes, so it reads the state the
        // player is actually looking at this frame.
        if (this.tutorial) this.tutorial.update(time, delta);

        // Cleanup dead entities
        this.towers = this.towers.filter(t => t.alive);
        this.temples = this.temples.filter(t => t.alive);
        this.enemies = this.enemies.filter(e => e.alive);
        this.projectiles = this.projectiles.filter(p => p.alive);
        this.sentinels = this.sentinels.filter(s => s.alive);
        this.manaMotes = this.manaMotes.filter(m => m.alive);

        // Selling or fusing the pinned tower leaves the readout hanging over an
        // empty tile, so the pin is dropped with the building.
        if (this.selectedStructure && !this.selectedStructure.alive) {
            this.selectStructure(null);
        }
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

    // ─── Spend tracking for Checkpoint Saves ───────────
    _totalStructureSpend() {
        let sum = 0;
        for (const t of this.towers) {
            if (t.alive) sum += (t.paidCost ?? 20);
        }
        for (const t of this.temples) {
            if (t.alive) sum += (t.paidCost ?? 60);
        }
        for (const [_, cost] of this.barricades) {
            sum += (cost ?? 10);
        }
        return sum;
    }

    _totalTempleSpend() {
        let sum = 0;
        if (!this.templeSystem || !this.templeSystem.levels) return sum;
        for (const el in this.templeSystem.levels) {
            for (const track in this.templeSystem.levels[el]) {
                const lvl = this.templeSystem.levels[el][track];
                for (let i = 0; i < lvl; i++) {
                    sum += upgradeCost(track, i);
                }
            }
        }
        return sum;
    }
}
