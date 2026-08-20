import * as Phaser from 'phaser';
import { ELEMENTS, TOWER_DATA, FUSION_MAP } from '../data/TowerData.js';
import {
    TEMPLE_DATA, TEMPLE_ELEMENTS, UPGRADE_TRACKS, TRACK_ORDER,
} from '../data/TempleData.js';
import { safeTexture } from '../systems/TextureGuard.js';
import { audio } from '../systems/AudioSystem.js';
import { BARRICADE_COST, SELL_REFUND } from '../systems/EconomySystem.js';
import { ENEMY_DATA } from '../data/EnemyData.js';
import {
    EFFECT, EFFECT_MARK, EFFECT_LABEL, EFFECT_COLOR,
    SUPER_MULT, RESIST_MULT, elementSymbol, elementName,
} from '../data/Elements.js';
import { HERO_ABILITIES, ABILITY_ORDER, COMBO, abilityHeading } from '../data/HeroData.js';
import { SPELLS, SPELL_ORDER, spellHeading } from '../data/SpellData.js';
import { HERO_LORE, DEFAULT_LOOK, heroTextureKey } from '../data/HeroLook.js';
import { applyViewport } from '../systems/Viewport.js';
import { OptionsModal } from '../systems/OptionsModal.js';
import { SaveSystem } from '../systems/SaveSystem.js';

const FONT = '"Press Start 2P"';
const MANA = '✦';

// Sidebar geometry. The map owns x < 640; everything here lives to the right
// of it, so all chrome is positioned off these numbers.
const BAR_X = 640;
const BAR_W = 280;
const CX = BAR_X + BAR_W / 2;      // 780 — sidebar centre line
const PAD = 12;
const LEFT = BAR_X + PAD;          // 652
const RIGHT = BAR_X + BAR_W - PAD; // 908
const INNER_W = BAR_W - PAD * 2;   // 256

// Centre of the map area, where every overlay and notification is anchored.
const MAP_CX = 320;
const MAP_CY = 240;

// The bottom of the sidebar, from the divider at y=384 down to the 480 edge.
// Three rows have to fit: the toggles, the next-wave readout, and the start
// button — named here because inserting the readout moved all three.
const ROW_CONTROLS = 398;
const ROW_PREVIEW = 423;
const ROW_WAVE_BTN = 452;
const WAVE_BTN_H = 34;

// Hero ability bar, over the bottom-left of the map. The sidebar is full, and
// the two cells it covers are the only corner of the board no route touches.
const HUD_X = 22;
const HUD_Y = 455;
const HUD_SIZE = 30;
const HUD_GAP = 36;

// Spells sit in their own row above the abilities, left edges aligned with it.
// Wider cells than an ability: a spell carries a price as well as a key, and a
// price you cannot see is not a price. Stacked rather than continuing the
// ability row because the tutorial banner owns the strip at y≈456 to the right.
const SPELL_W = 60;
const SPELL_H = 28;
const SPELL_GAP = 66;
const SPELL_Y = HUD_Y - 52;
const SPELL_X = HUD_X - HUD_SIZE / 2 + SPELL_W / 2;

export class UIScene extends Phaser.Scene {
    constructor() {
        super('UIScene');
    }

    create(data) {
        // Same supersampled buffer as GameScene, so this camera needs the same
        // zoom — the sidebar's coordinates are all in the 920×480 world.
        applyViewport(this);

        /** @type {import('./GameScene.js').GameScene} */
        this.gs = data.gameScene;

        this.upgradePanel = null;
        this.helpPanel = null;
        this.helpTab = null;
        this.fusionPopup = null;
        this.fusionPopupTimer = null;
        this.notifSlots = [];
        // One-shot teaching moments, each said the first time it can be seen.
        this.saidOnce = {};

        this._buildSidebar();
        this._buildResourcePanel();
        this._buildTowerButtons();
        this._buildTempleButtons();
        this._buildGlobalControls();
        this._buildTopRightGear();
        this._buildWavePreview();
        this._buildWaveButton();
        this._buildSpellHud();
        this._buildHeroHud();
        this._buildTutorialBanner();
        this._buildPauseOverlay();
        this._registerEvents();

        this._updateAffordability();
        this._updateManaBar();
        this._refreshWavePreview();
        this._refreshTempleButtons();

        this.input.keyboard.on('keydown-SPACE', () => {
            if (this.gs.gameOver || this.gs.gameWon || this.gs.uiModalOpen) return;
            this.togglePause();
        });
    }

    togglePause() {
        if (this.gs.gameOver || this.gs.gameWon) return;
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            audio.play('click'); // or a distinct pause sound
            this.gs.scene.pause('GameScene');
            this.pauseOverlay.setVisible(true);
        } else {
            audio.play('click');
            this.gs.scene.resume('GameScene');
            this.pauseOverlay.setVisible(false);
        }
    }

    _buildPauseOverlay() {
        this.isPaused = false;
        this.pauseOverlay = this.add.container(MAP_CX, MAP_CY).setDepth(100).setVisible(false);
        
        // Dim the map slightly
        const bg = this.add.rectangle(0, 0, 640, 480, 0x000000, 0.6)
            .setInteractive(); // Intercepts clicks on the map while paused
        
        const title = this.add.text(0, -20, 'PAUSA', {
            fontFamily: FONT, fontSize: '24px', color: '#FFFFFF',
            stroke: '#000000', strokeThickness: 4, letterSpacing: 4
        }).setOrigin(0.5);
        
        const sub = this.add.text(0, 20, 'Presiona ESPACIO para reanudar', {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
        }).setOrigin(0.5);
        
        this.pauseOverlay.add([bg, title, sub]);
    }

    /** Cooldown wipes have to be redrawn every frame; nothing else here does. */
    update() {
        this._refreshHeroHud();
        this._refreshSpellHud();
    }

    // ─── Shared chrome helpers ──────────────────────────
    _divider(y) {
        this.add.rectangle(CX, y, INNER_W, 1, 0x2a2a4a);
    }

    _sectionHeader(y, text, color) {
        // A colour rule beside the label reads as a section break at a glance,
        // which identical grey words in a column never did.
        this.add.text(LEFT, y, text, {
            fontFamily: FONT, fontSize: '8px', color,
        }).setOrigin(0, 0.5);

        const textW = text.length * 10 + 8;
        this.add.rectangle(LEFT + textW + (INNER_W - textW) / 2, y, INNER_W - textW, 2, 0x2a2a4a);
    }

    _buildSidebar() {
        this.add.rectangle(CX, 240, BAR_W, 480, 0x12122a).setDepth(0);
        this.add.rectangle(BAR_X, 240, 2, 480, 0x2a2a4a).setDepth(0);

        this.add.text(CX, 18, 'ELEMENTAL TD', {
            fontFamily: FONT, fontSize: '8px', color: '#FFD54F',
        }).setOrigin(0.5);

        this._divider(32);
    }

    // ─── Resources ──────────────────────────────────────
    /**
     * Gold and life force are the two numbers you act on, so they get cards.
     * Lives and wave are status, so they get one line underneath.
     */
    _buildResourcePanel() {
        this.goldValue = this._resourceCard(52, 'icon_coin', '#FFD700', 0x2a2410, 0x5a4a20, 1.0);
        this.manaValue = this._resourceCard(88, 'mana_mote', '#B388FF', 0x1e1a33, 0x4a3a7a, 0.8);

        // Progress toward the cheapest upgrade currently within reach
        this.manaBarBg = this.add.rectangle(CX, 110, INNER_W, 6, 0x1a1a2e);
        this.manaBarBg.setStrokeStyle(1, 0x2a2a4a);
        this.manaBarFill = this.add.rectangle(LEFT, 110, 0, 4, 0xB388FF).setOrigin(0, 0.5);
        this.manaGoalText = this.add.text(CX, 124, '', {
            fontFamily: FONT, fontSize: '8px', color: '#6a6a8a',
        }).setOrigin(0.5);

        this.statusText = this.add.text(CX, 140, '', {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
        }).setOrigin(0.5);
        this._updateStatus();

        this._divider(152);
    }

    // iconScale: 1.0 for coin (17×17), 0.8 for mana_mote (21×22 → ~17px)
    _resourceCard(y, iconKey, color, fill, stroke, iconScale = 1.0) {
        const card = this.add.rectangle(CX, y, INNER_W, 32, fill);
        card.setStrokeStyle(1, stroke);

        // Sprite icon left-aligned inside card
        this.add.image(LEFT + 14, y, iconKey).setScale(iconScale);

        // Number sits at the right edge — icon is at most 24px wide so no overlap
        return this.add.text(RIGHT - 10, y, '0', {
            fontFamily: FONT, fontSize: '16px', color,
        }).setOrigin(1, 0.5);
    }

    _updateStatus() {
        const e = this.gs.economySystem;
        const w = this.gs.waveManager;
        const total = w.currentWave > w.totalWaves ? '∞' : w.totalWaves;
        this.statusText.setText(`♥ ${e.lives}    OLEADA ${w.currentWave}/${total}`);
        this.statusText.setColor(e.lives <= 5 ? '#FF1744' : '#B0BEC5');
    }

    _updateManaBar() {
        const mana = this.gs.economySystem.mana;
        const goal = this.gs.templeSystem.cheapestUpgrade();

        if (!goal) {
            this.manaBarFill.width = 0;
            // With no temple the hero still gathers maná — there is just
            // nowhere to spend it yet, which is the thing worth saying.
            this.manaGoalText.setText(
                this.gs.temples.length === 0 ? 'sin templo no hay mejoras' : 'todo al maximo'
            );
            return;
        }

        const pct = Phaser.Math.Clamp(mana / goal.cost, 0, 1);
        this.manaBarFill.width = INNER_W * pct;
        this.manaBarFill.fillColor = pct >= 1 ? 0x4CAF50 : 0xB388FF;

        const d = TEMPLE_DATA[goal.element];
        const t = UPGRADE_TRACKS[goal.track];
        this.manaGoalText.setText(
            pct >= 1
                ? `¡${d.shortName} ${t.label} listo!`
                : `${mana}/${goal.cost} → ${d.shortName} ${t.label}`
        );
        // Gold, not green — the bar right above it is already green when full,
        // and two greens touching read as one smear.
        this.manaGoalText.setColor(pct >= 1 ? '#FFD54F' : '#6a6a8a');
    }

    // ─── Build buttons ──────────────────────────────────
    /** Four 56px buttons spread across the 256px of usable width. */
    _slotX(i) { return LEFT + 31 + i * 66; }

    _buildTowerButtons() {
        this._sectionHeader(164, 'TORRES', '#B0BEC5');

        const elems = [ELEMENTS.WATER, ELEMENTS.AIR, ELEMENTS.FIRE, ELEMENTS.EARTH];
        this.towerBtns = [];
        this.selectedBtn = null;

        elems.forEach((el, i) => {
            this.towerBtns.push(this._createTowerBtn(el, this._slotX(i), 202));
        });

        // Barricade and sell share one row: neither builds a tower, both act on
        // a cell you click afterwards, and the sidebar has no spare row to give.
        this.barricadeBtn = this._createBarricadeBtn(LEFT + 80, 252, 160);
        this.sellBtn = this._createSellBtn(RIGHT - 46, 252, 92);
        this._divider(274);
    }

    _createTowerBtn(element, x, y) {
        const td = TOWER_DATA[element];

        const bg = this.add.image(x, y, 'btn_build').setInteractive({ useHandCursor: true });
        const icon = this.add.sprite(
            x, y - 8, safeTexture(this, `tower_${element}`, 'tower_earth')
        ).setScale(1.2);

        // Coin + number centred as a pair under the tower sprite
        const COIN_PX = 10;  // 17 * 0.6 ≈ 10px
        const costStr = `${td.cost}`;
        const costW = costStr.length * 6;  // Press Start 2P 8px ≈ 6px/char
        const pairW = COIN_PX + 2 + costW;
        const pairLeft = x - pairW / 2;
        const coin = this.add.image(pairLeft + COIN_PX / 2, y + 20, 'icon_coin').setScale(0.6);
        const cost = this.add.text(pairLeft + COIN_PX + 2, y + 20, costStr, {
            fontFamily: FONT, fontSize: '8px', color: '#FFD700',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0, 0.5);

        const btn = { bg, icon, coin, cost, element, kind: 'tower' };

        bg.on('pointerdown', () => {
            if (this.gs.economySystem.gold < td.cost) { audio.play('deny'); return; }
            this._select(btn, () => this.gs.events.emit('select-element', element));
        });
        bg.on('pointerover', () => this._showTowerTooltip(element, x - 34, y));
        bg.on('pointerout', () => this._hideTooltip());

        return btn;
    }

    _createBarricadeBtn(x, y, w) {
        const l = x - w / 2;

        const bg = this.add.rectangle(x, y, w, 32, 0x1e1e3a)
            .setStrokeStyle(2, 0x3a3a5a)
            .setInteractive({ useHandCursor: true });
        const icon = this.add.sprite(l + 16, y, 'tile_barricade').setScale(0.85);
        this.add.text(l + 34, y, 'BARRICADA', {
            fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
        }).setOrigin(0, 0.5);
        // Coin + number right-aligned: number first (to measure width), then coin to its left
        const cost = this.add.text(l + w - 6, y, `${BARRICADE_COST}`, {
            fontFamily: FONT, fontSize: '8px', color: '#FFD700',
        }).setOrigin(1, 0.5);
        const coin = this.add.image(l + w - 6 - cost.width - 8, y, 'icon_coin').setScale(0.65);

        const btn = { bg, icon, coin, cost, kind: 'barricade' };

        bg.on('pointerdown', () => {
            if (this.gs.economySystem.gold < BARRICADE_COST) { audio.play('deny'); return; }
            this._select(btn, () => this.gs.events.emit('select-barricade'));
        });
        bg.on('pointerover', () => this._showTooltip([
            'Barricada', 'Desvia enemigos', 'sin cerrar del', 'todo el camino.',
        ], LEFT + 20, y - 42));
        bg.on('pointerout', () => this._hideTooltip());

        return btn;
    }

    /**
     * A mode, not an action: arming it turns the map cursor into a demolition
     * cursor, so it lives in the same one-at-a-time slot as the build buttons.
     */
    _createSellBtn(x, y, w) {
        const bg = this.add.rectangle(x, y, w, 32, 0x1e1e3a)
            .setStrokeStyle(2, 0x3a3a5a)
            .setInteractive({ useHandCursor: true });
        const label = this.add.text(x, y, 'VENDER', {
            fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
        }).setOrigin(0.5);

        const btn = { bg, label, kind: 'sell' };

        bg.on('pointerdown', () => this._select(btn, () => this.gs.events.emit('select-sell')));
        bg.on('pointerover', () => this._showTooltip([
            'Vender',
            `Devuelve el ${Math.round(SELL_REFUND * 100)}% del oro`,
            'que pagaste. Sirve para',
            'torres, templos y barricadas.',
            'Las mejoras compradas',
            'no se pierden.',
        ], RIGHT, y - 58));
        bg.on('pointerout', () => this._hideTooltip());

        return btn;
    }

    // ─── Temple buttons ─────────────────────────────────
    _buildTempleButtons() {
        this._sectionHeader(290, 'TEMPLOS', '#B388FF');

        this.templeBtns = [];
        TEMPLE_ELEMENTS.forEach((el, i) => {
            this.templeBtns.push(this._createTempleBtn(el, this._slotX(i), 328));
        });

        this.templeCostLabel = this.add.text(0, 372, 'SIG. TEMPLO:', {
            fontFamily: FONT, fontSize: '8px', color: '#FFD700',
        }).setOrigin(0, 0.5);
        this.templeCostCoin = this.add.image(0, 372, 'icon_coin').setScale(0.7);
        this.templeCostValue = this.add.text(0, 372, '', {
            fontFamily: FONT, fontSize: '8px', color: '#FFD700',
        }).setOrigin(0, 0.5);

        this._divider(384);
    }

    _createTempleBtn(element, x, y) {
        const bg = this.add.image(x, y, 'btn_build').setInteractive({ useHandCursor: true });
        const icon = this.add.sprite(
            x, y - 8, safeTexture(this, `temple_${element}`, 'temple_earth')
        ).setScale(1.2);

        // Lit only once you own that temple: shows at a glance which upgrade
        // trees are actually open to you.
        const owned = this.add.rectangle(x, y + 20, 40, 5, TEMPLE_DATA[element].color);
        owned.setVisible(false);

        const btn = { bg, icon, owned, element, kind: 'temple' };

        bg.on('pointerdown', () => {
            if (this.gs.economySystem.gold < this.gs.templeSystem.nextCost) {
                audio.play('deny');
                return;
            }
            this._select(btn, () => this.gs.events.emit('select-temple', element));
        });

        bg.on('pointerover', () => {
            const d = TEMPLE_DATA[element];
            const ts = this.gs.templeSystem;
            this._showTooltip([
                d.name,
                `Costo: ${ts.nextCost} oro`,
                `Alcance: ${d.absorbRadius}`,
                `Refina: +${Math.round(d.absorbBonus * 100)}% de mana`,
                ts.hasTemple(element)
                    ? `Mejoras: ${ts.totalLevels(element)} niveles`
                    : 'Abre las mejoras',
                `de ${d.shortName}.`,
            ], x - 34, y + 54);
        });
        bg.on('pointerout', () => this._hideTooltip());

        return btn;
    }

    _refreshTempleButtons() {
        const ts = this.gs.templeSystem;
        const valStr = `${ts.nextCost}`;
        this.templeCostValue.setText(valStr);

        // Lay out: [label][gap][coin 13px @0.7][gap][value] — centred in sidebar
        const gap = 4;
        const coinW = 13;  // 17 * 0.7 ≈ 12px + 1 breathing room
        const labelW = this.templeCostLabel.width;
        const valW   = this.templeCostValue.width;
        const totalW = labelW + gap + coinW + gap + valW;
        const startX = CX - totalW / 2;

        this.templeCostLabel.setPosition(startX, 372);
        this.templeCostCoin.setPosition(Math.round(startX + labelW + gap + coinW / 2), 372);
        this.templeCostValue.setPosition(startX + labelW + gap + coinW + gap, 372);

        for (const btn of this.templeBtns) {
            btn.owned.setVisible(ts.hasTemple(btn.element));
        }
    }

    /** Shared select/deselect behaviour for every build button. */
    _select(btn, onSelect) {
        audio.play('click');
        if (this.selectedBtn) this._setBtnSelected(this.selectedBtn, false);

        if (this.selectedBtn === btn) {
            this.selectedBtn = null;
            this.gs._cancelPlacement();
            return;
        }

        this.selectedBtn = btn;
        this._setBtnSelected(btn, true);
        onSelect();
    }

    _setBtnSelected(btn, selected) {
        if (btn.kind === 'tower' || btn.kind === 'temple') {
            btn.bg.setTexture(selected ? 'btn_build_sel' : 'btn_build');
            return;
        }

        // Rectangle buttons. Selling arms a destructive cursor, so it lights up
        // red rather than borrowing the gold every build button uses.
        const selling = btn.kind === 'sell';
        btn.bg.setStrokeStyle(2, selected ? (selling ? 0xFF5252 : 0xFFD54F) : 0x3a3a5a);
        btn.bg.fillColor = selected ? (selling ? 0x3a1622 : 0x2a2a5a) : 0x1e1e3a;
        if (selling) btn.label.setColor(selected ? '#FF8A80' : '#ECEFF1');
    }

    // ─── Global controls ────────────────────────────────
    _buildGlobalControls() {
        const mk = (x, w, label, onClick) => {
            const bg = this.add.rectangle(x + w / 2, ROW_CONTROLS, w, 26, 0x333344)
                .setInteractive({ useHandCursor: true });
            const txt = this.add.text(x + w / 2, ROW_CONTROLS, label, {
                fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
            }).setOrigin(0.5);
            bg.on('pointerdown', () => { audio.play('click'); onClick(bg, txt); });
            return { bg, txt };
        };

        const isFast = this.gs.time.timeScale > 1.5;
        const velBtn = mk(LEFT, 54, isFast ? 'VEL 2x' : 'VEL 1x', (bg, txt) => {
            if (this.gs.time.timeScale === 1) {
                this.gs.time.timeScale = 2;
                txt.setText('VEL 2x');
                bg.fillColor = 0xFF9800;
            } else {
                this.gs.time.timeScale = 1;
                txt.setText('VEL 1x');
                bg.fillColor = 0x333344;
            }
        });
        if (isFast) velBtn.bg.fillColor = 0xFF9800;

        const wm = this.gs.waveManager;
        const autoBtn = mk(LEFT + 60, 74, wm.autoWave ? 'AUTO: SI' : 'AUTO: NO', (bg, txt) => {
            wm.autoWave = !wm.autoWave;
            if (wm.autoWave) {
                txt.setText('AUTO: SI');
                bg.fillColor = 0x2196F3;
                if (!wm.waveActive) this.gs.events.emit('start-wave');
            } else {
                txt.setText('AUTO: NO');
                bg.fillColor = 0x333344;
            }
        });
        if (wm.autoWave) autoBtn.bg.fillColor = 0x2196F3;

        const sound = mk(LEFT + 138, 70, audio.enabled ? 'SON: SI' : 'SON: NO', (bg, txt) => {
            const on = audio.toggle();
            txt.setText(on ? 'SON: SI' : 'SON: NO');
            bg.fillColor = on ? 0x333344 : 0x552222;
        });
        sound.txt.setText(audio.enabled ? 'SON: SI' : 'SON: NO');
        sound.bg.fillColor = audio.enabled ? 0x333344 : 0x552222;

        mk(LEFT + 212, 22, '||', () => {
            if (!this.gs.uiModalOpen) this.togglePause();
        });
        mk(LEFT + 238, 18, '?', () => this._openHelpPanel());
    }

    _buildTopRightGear() {
        const x = 898;
        const y = 18;
        const bg = this.add.rectangle(x, y, 26, 24, 0x181830, 0.65)
            .setStrokeStyle(1, 0x3a3a5a, 0.75)
            .setDepth(60)
            .setInteractive({ useHandCursor: true });

        const txt = this.add.text(x, y, '⚙', {
            fontFamily: FONT, fontSize: '10px', color: '#90CAF9',
        }).setOrigin(0.5).setDepth(61).setAlpha(0.75);

        bg.on('pointerdown', (p) => {
            p.event?.stopPropagation();
            audio.play('click');
            this._openOptionsModal();
        });
        bg.on('pointerover', () => {
            bg.setFillStyle(0x2a2a50, 0.95);
            bg.setStrokeStyle(1, 0xFFD54F, 1);
            txt.setColor('#FFD54F').setAlpha(1);
        });
        bg.on('pointerout', () => {
            bg.setFillStyle(0x181830, 0.65);
            bg.setStrokeStyle(1, 0x3a3a5a, 0.75);
            txt.setColor('#90CAF9').setAlpha(0.75);
        });
    }

    _openOptionsModal() {
        if (this.optionsModal) {
            this.optionsModal.close();
            this.optionsModal = null;
            return;
        }
        this._closeHelpPanel();
        this._closeUpgradePanel();
        this.gs.uiModalOpen = true;

        // Fully pause GameScene while Options are open, restoring previous state on close
        this._wasPausedBeforeOptions = this.isPaused;
        this.gs.scene.pause('GameScene');

        this.optionsModal = new OptionsModal(this, {
            mode: 'ingame',
            gameScene: this.gs,
            onClose: () => {
                this.optionsModal = null;
                this.gs.uiModalOpen = false;
                if (!this._wasPausedBeforeOptions) {
                    this.gs.scene.resume('GameScene');
                }
            },
            onSaveQuit: () => {
                this.optionsModal = null;
                this.scene.stop('UIScene');
                this.scene.stop('GameScene');
                this.scene.start('TitleScene');
            },
            onRestart: () => {
                this.optionsModal = null;
                SaveSystem.clearSave();
                this.scene.stop('UIScene');
                this.scene.stop('GameScene');
                this.scene.start('GameScene', { continueGame: false });
            },
        });
    }

    // ─── Next-wave preview ──────────────────────────────
    /**
     * What is coming, and of which element — beside the button that summons it,
     * because that is the moment the answer changes what you do.
     *
     * Rebuilt rather than mutated on every wave boundary: the number of enemy
     * groups changes from wave to wave, so there is no stable set of slots to
     * keep around.
     */
    _buildWavePreview() {
        this.previewLabel = this.add.text(LEFT, ROW_PREVIEW, '', {
            fontFamily: FONT, fontSize: '8px', color: '#78909C',
        }).setOrigin(0, 0.5);

        this.previewEntries = [];
    }

    _refreshWavePreview() {
        for (const e of this.previewEntries) e.destroy();
        this.previewEntries = [];

        const wm = this.gs.waveManager;
        const comp = wm.nextComposition;

        if (!comp) {
            this.previewLabel.setText('ULTIMA OLEADA').setColor('#FFD54F');
            return;
        }

        this.previewLabel.setText(`PROX ${wm.nextWaveNumber}`).setColor('#78909C');

        // Whatever room is left after the label, split evenly.
        const startX = LEFT + 54;
        const span = RIGHT - startX;
        const step = Math.min(52, span / Math.max(1, comp.length));

        comp.forEach((group, i) => {
            const data = ENEMY_DATA[group.type];
            if (!data) return;
            const x = startX + step * i + 12;

            const icon = this.add.sprite(x, ROW_PREVIEW, safeTexture(this, `enemy_${group.type}`, 'enemy_slime'))
                .setScale(0.65)
                .setInteractive({ useHandCursor: false });

            // The element rides on the icon's shoulder as a glyph, not as a
            // tint: an enemy already has a colour, and it is not its element's.
            const glyph = this.add.text(x + 9, ROW_PREVIEW - 8, elementSymbol(data.element), {
                fontFamily: FONT, fontSize: '8px',
            }).setOrigin(0.5);

            const count = this.add.text(x + 12, ROW_PREVIEW + 6, `x${group.count}`, {
                fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
                stroke: '#12122a', strokeThickness: 3,
            }).setOrigin(0, 0.5);

            icon.on('pointerover', () => this._showEnemyTooltip(group.type, x + 40, ROW_PREVIEW - 58));
            icon.on('pointerout', () => this._hideTooltip());

            this.previewEntries.push(icon, glyph, count);
        });
    }

    // ─── Fusion preview ─────────────────────────────────
    /**
     * What the pair under the badge would become, next to what it is now.
     *
     * A fusion is irreversible and consumes two buildings you paid for, so the
     * before/after has to be available *before* the click — quoting only the
     * result would still leave the actual question ("is that better than what I
     * already have?") unanswered.
     */
    _showFusionTooltip(info) {
        const { b1, b2, result, kind } = info;
        const ts = this.gs.templeSystem;
        const r1 = (n) => Math.round(n);
        let lines;

        if (kind === 'temple') {
            const d = TEMPLE_DATA[result];
            const a = TEMPLE_DATA[b1.element];
            const b = TEMPLE_DATA[b2.element];
            const pct = (v) => Math.round(v * 100);
            lines = [
                `${d.emoji} ${d.name}`,
                `Alcance ${d.absorbRadius}   antes ${a.absorbRadius}/${b.absorbRadius}`,
                `Refina +${pct(d.absorbBonus)}%   antes +${pct(a.absorbBonus)}%`,
                `Abre mejoras de ${d.shortName}`,
                'Libera 1 casilla',
            ];
        } else {
            const d = TOWER_DATA[result];
            // The hybrid's own element carries its own upgrade tree, so its
            // numbers are quoted through that tree rather than the parents'.
            const dmg = d.damage * ts.multiplier(result, 'damage');
            const rng = d.range * ts.multiplier(result, 'range');
            const rate = d.fireRate * ts.multiplier(result, 'fireRate');
            lines = [
                `${d.emoji} ${d.name}`,
                `DMG ${r1(dmg)}   antes ${r1(b1.damage)}+${r1(b2.damage)}`,
                `RNG ${r1(rng)}   antes ${r1(b1.range)}/${r1(b2.range)}`,
                `${(1000 / rate).toFixed(2)}/s   antes ${b1.shotsPerSecond.toFixed(2)}+${b2.shotsPerSecond.toFixed(2)}`,
                d.specialDesc,
                'Libera 1 casilla',
            ];
        }

        // Opens away from the nearer edge, so a card on a badge at the far left
        // of the board is not half off it.
        const leftSide = info.x < 300;
        this._showTooltip(
            lines,
            leftSide ? info.x + 16 : info.x - 16,
            Phaser.Math.Clamp(info.y - 56, 66, 400),
            leftSide ? 0 : 1
        );
    }

    _showEnemyTooltip(type, x, y) {
        const d = ENEMY_DATA[type];
        const list = (els) => els.map(e => `${elementSymbol(e)}${elementName(e)}`).join(' ');
        const lines = [
            d.name,
            `Clase: ${elementSymbol(d.element)}${elementName(d.element)}`,
            `${d.hp} HP  ·  vel ${d.speed}`,
        ];
        if (d.weakness?.length) lines.push(`${EFFECT_MARK[EFFECT.SUPER]} debil: ${list(d.weakness)}`);
        if (d.resistance?.length) lines.push(`${EFFECT_MARK[EFFECT.RESIST]} resiste: ${list(d.resistance)}`);
        // The one thing about an enemy you cannot read off its stat line: that it
        // is going to leave the road. Worth saying before the wave, not during.
        if (d.agro?.target === 'hero') {
            lines.push('! deja el camino por el heroe');
            lines.push('  lo suelta si entra a un templo');
        }
        if (d.agro?.target === 'temple') lines.push('! deja el camino por los templos');
        this._showTooltip(lines, x, y);
    }

    // ─── Wave button ────────────────────────────────────
    _buildWaveButton() {
        this.waveBtnBg = this.add.rectangle(CX, ROW_WAVE_BTN, INNER_W, WAVE_BTN_H, 0x2E7D32);
        this.waveBtnBg.setStrokeStyle(2, 0x4CAF50);
        this.waveBtnBg.setInteractive({ useHandCursor: true });

        this.waveBtnText = this.add.text(CX, ROW_WAVE_BTN, 'OLEADA ▶', {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
        }).setOrigin(0.5);

        this.waveBtnBg.on('pointerdown', () => {
            if (!this.gs.waveManager.waveActive) this.gs.events.emit('start-wave');
        });
        this.waveBtnBg.on('pointerover', () => {
            if (!this.gs.waveManager.waveActive) this.waveBtnBg.fillColor = 0x388E3C;
        });
        this.waveBtnBg.on('pointerout', () => {
            this.waveBtnBg.fillColor = this.gs.waveManager.waveActive ? 0x333344 : 0x2E7D32;
        });
    }

    // ─── Hero ability bar ───────────────────────────────
    /**
     * Lives over the board rather than in the sidebar. The sidebar is full to
     * the pixel, and an ability bar belongs next to the thing it drives anyway —
     * you fire these while watching the lane, not while reading a menu.
     */
    _buildHeroHud() {
        // Named, not labelled: the abilities belong to somebody.
        this.add.text(HUD_X - HUD_SIZE / 2, HUD_Y - HUD_SIZE / 2 - 9, HERO_LORE.name, {
            fontFamily: FONT, fontSize: '8px', color: '#B388FF',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0, 0.5).setDepth(50);

        this.abilityBtns = ABILITY_ORDER.map((key, i) => {
            const a = HERO_ABILITIES[key];
            const x = HUD_X + i * HUD_GAP;

            const bg = this.add.rectangle(x, HUD_Y, HUD_SIZE, HUD_SIZE, 0x12122a, 0.86)
                .setStrokeStyle(2, a.color)
                .setDepth(50)
                .setInteractive({ useHandCursor: true });

            const glyph = this.add.text(x, HUD_Y - 3, a.glyph, {
                fontFamily: FONT, fontSize: '8px', color: a.colorHex,
                stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(52);

            const hot = this.add.text(x, HUD_Y + 10, a.hotkey, {
                fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
                stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(52);

            // Cooldown wipe: anchored at the bottom and grown upward, so the
            // shrinking clear area reads as the ability filling back up.
            const wipe = this.add.rectangle(x, HUD_Y + HUD_SIZE / 2, HUD_SIZE - 4, 0, 0x000000, 0.66)
                .setOrigin(0.5, 1)
                .setDepth(51);

            const timer = this.add.text(x, HUD_Y, '', {
                fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
                stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(53);

            bg.on('pointerdown', (pointer) => {
                pointer.event.stopPropagation();
                this.gs.events.emit('use-ability', key);
            });
            bg.on('pointerover', () => this._showTooltip(
                [abilityHeading(key), ...a.desc], HUD_X - HUD_SIZE / 2, HUD_Y - 48, 0
            ));
            bg.on('pointerout', () => this._hideTooltip());

            return { key, ability: a, bg, glyph, hot, wipe, timer };
        });
    }

    // ─── Spell bar ──────────────────────────────────────
    /**
     * The maná sink, next to the maná spender it belongs to.
     *
     * Beside the ability bar rather than in the sidebar for the same reason the
     * abilities are: you cast these while watching the lane. The difference is
     * that a spell has a price, so each cell carries the number — and the number
     * is what turns "I have 400✦" into a decision instead of a total.
     */
    _buildSpellHud() {
        this.add.text(HUD_X - HUD_SIZE / 2, SPELL_Y - SPELL_H / 2 - 9, 'HECHIZOS', {
            fontFamily: FONT, fontSize: '8px', color: '#CFDDE9',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0, 0.5).setDepth(50);

        this.spellBtns = SPELL_ORDER.map((key, i) => {
            const s = SPELLS[key];
            const x = SPELL_X + i * SPELL_GAP;

            const bg = this.add.rectangle(x, SPELL_Y, SPELL_W, SPELL_H, 0x12122a, 0.86)
                .setStrokeStyle(2, s.color)
                .setDepth(50)
                .setInteractive({ useHandCursor: true });

            const icon = this.add.image(x - 20, SPELL_Y, safeTexture(this, s.icon, 'mana_mote'))
                .setScale(0.8)
                .setDepth(52);

            const hot = this.add.text(x - 3, SPELL_Y - 6, s.hotkey, {
                fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
                stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0, 0.5).setDepth(52);

            const cost = this.add.text(x - 3, SPELL_Y + 6, `${s.cost}`, {
                fontFamily: FONT, fontSize: '8px', color: '#B388FF',
                stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0, 0.5).setDepth(52);

            const wipe = this.add.rectangle(x, SPELL_Y + SPELL_H / 2, SPELL_W - 4, 0, 0x000000, 0.66)
                .setOrigin(0.5, 1)
                .setDepth(51);

            // Over the icon, not over the middle of the cell: the right half
            // already holds the key and the price, and a countdown parked on
            // top of them makes all three unreadable at once.
            const timer = this.add.text(x - 20, SPELL_Y, '', {
                fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
                stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(53);

            bg.on('pointerdown', (pointer) => {
                pointer.event.stopPropagation();
                pointer.event._uiConsumed = true;
                this.gs.events.emit('select-spell', key);
            });
            bg.on('pointerover', () => this._showTooltip(
                [spellHeading(key), ...s.desc], HUD_X - HUD_SIZE / 2, SPELL_Y - 56, 0
            ));
            bg.on('pointerout', () => this._hideTooltip());

            return { key, spell: s, bg, icon, hot, cost, wipe, timer, armed: false };
        });
    }

    /**
     * Three states, and they have to be told apart: charged and affordable,
     * charged but too expensive, and still recharging. The first two differ by
     * whether the price is violet or red, the third by the wipe over the cell.
     */
    _refreshSpellHud() {
        if (!this.spellBtns) return;
        const ss = this.gs.spellSystem;
        const mana = this.gs.economySystem.mana;

        for (const btn of this.spellBtns) {
            const pct = ss.cooldownPct(btn.key);
            btn.wipe.height = (SPELL_H - 4) * pct;

            const cooling = pct > 0;
            btn.timer.setText(cooling ? `${ss.cooldownSeconds(btn.key)}` : '');

            const affordable = mana >= btn.spell.cost;
            btn.cost.setColor(affordable ? '#B388FF' : '#FF8A80');
            btn.icon.setAlpha(cooling || !affordable ? 0.35 : 1);

            // Armed outranks everything: while the cursor is holding this spell
            // the border is gold, so it matches the build buttons that behave
            // the same way — one thing on the cursor, and you can see which.
            const usable = ss.canCast(btn.key);
            btn.bg.setStrokeStyle(2,
                btn.armed ? 0xFFD54F : usable ? btn.spell.color : 0x3a3a5a);
            btn.hot.setColor(usable ? '#ECEFF1' : '#555566');
        }
    }

    /** Which spell, if any, is currently sitting on the map cursor. */
    _setSpellArmed(key) {
        if (!this.spellBtns) return;
        for (const btn of this.spellBtns) btn.armed = btn.key === key;
    }

    _refreshHeroHud() {
        if (!this.abilityBtns) return;
        const hero = this.gs.hero;
        if (!hero) return;

        for (const btn of this.abilityBtns) {
            const pct = hero.cooldownPct(btn.key);
            btn.wipe.height = (HUD_SIZE - 4) * pct;

            const cooling = pct > 0;
            btn.timer.setText(cooling ? `${hero.cooldownSeconds(btn.key)}` : '');
            btn.glyph.setAlpha(cooling ? 0.35 : 1);

            // Dead or mid-cast is a different refusal from cooling down, and the
            // border is where that difference is legible.
            const usable = hero.isReady(btn.key);
            btn.bg.setStrokeStyle(2, usable ? btn.ability.color : 0x3a3a5a);
            btn.hot.setColor(usable ? '#ECEFF1' : '#555566');
        }
    }

    // ─── Tutorial ───────────────────────────────────────
    /**
     * One line at the foot of the board, plus a way out of it. Everything the
     * tutorial has to say is a single instruction about the thing you are
     * looking at, so it never needs more room than this.
     */
    _buildTutorialBanner() {
        this.tutorialBox = this.add.rectangle(320, 452, 510, 42, 0x0a0a1a, 0.95)
            .setStrokeStyle(1.5, 0xB388FF)
            .setDepth(70)
            .setVisible(false);

        // Wrapped with comfortable margins leaving the skip button its own column
        this.tutorialText = this.add.text(285, 452, '', {
            fontFamily: FONT, fontSize: '7.5px', color: '#ECEFF1',
            align: 'center', lineSpacing: 4,
            wordWrap: { width: 410 },
        }).setOrigin(0.5).setDepth(71).setVisible(false);

        this.tutorialSkipBg = this.add.rectangle(530, 452, 54, 22, 0x2a2a4a)
            .setStrokeStyle(1, 0x555577)
            .setDepth(71)
            .setVisible(false)
            .setInteractive({ useHandCursor: true });

        this.tutorialSkip = this.add.text(530, 452, 'SALTAR', {
            fontFamily: FONT, fontSize: '7.5px', color: '#B0BEC5',
        }).setOrigin(0.5).setDepth(72).setVisible(false);

        this.tutorialSkipBg.on('pointerdown', (pointer) => {
            pointer.event.stopPropagation();
            audio.play('click');
            this.gs.events.emit('tutorial-skip');
        });
        this.tutorialSkipBg.on('pointerover', () => { this.tutorialSkipBg.fillColor = 0x3a3a5a; });
        this.tutorialSkipBg.on('pointerout', () => { this.tutorialSkipBg.fillColor = 0x2a2a4a; });

        // Ring drawn around whichever part of the sidebar the current step is
        // asking you to press.
        this.tutorialRing = this.add.rectangle(0, 0, 10, 10, 0x000000, 0)
            .setStrokeStyle(2, 0xFFD54F)
            .setDepth(69)
            .setVisible(false);
    }

    _showTutorialStep(text, highlight) {
        const on = !!text;
        this.tutorialBox.setVisible(on);
        this.tutorialText.setVisible(on).setText(text ?? '');
        this.tutorialSkipBg.setVisible(on);
        this.tutorialSkip.setVisible(on);
        this._setTutorialHighlight(highlight);
    }

    _setTutorialHighlight(target) {
        if (this.tutorialRingTween) {
            this.tutorialRingTween.stop();
            this.tutorialRingTween = null;
        }

        // Only one region is ever pointed at, so a lookup beats a registry.
        const REGIONS = {
            temples: { x: CX, y: 328, w: INNER_W + 6, h: 68 },
            towers: { x: CX, y: 202, w: INNER_W + 6, h: 68 },
        };
        const region = target ? REGIONS[target] : null;

        if (!region) {
            this.tutorialRing.setVisible(false).setAlpha(1);
            return;
        }

        this.tutorialRing
            .setPosition(region.x, region.y)
            .setSize(region.w, region.h)
            .setAlpha(1)
            .setVisible(true);

        this.tutorialRingTween = this.tweens.add({
            targets: this.tutorialRing,
            alpha: 0.25,
            duration: 620,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    // ─── Events ─────────────────────────────────────────
    _registerEvents() {
        this._gsHandlers = [];
        const on = (ev, fn) => {
            this.gs.events.on(ev, fn);
            this._gsHandlers.push({ ev, fn });
        };

        this.events.once('shutdown', () => {
            if (this._gsHandlers) {
                for (const h of this._gsHandlers) {
                    this.gs.events.off(h.ev, h.fn);
                }
            }
        });
        on('gold-changed', (g) => {
            this.goldValue.setText(`${g}`);
            this._updateAffordability();
        });

        on('mana-changed', (m) => {
            this.manaValue.setText(`${m}`);
            this._updateManaBar();
            this._refreshUpgradePanel();
        });

        on('lives-changed', () => this._updateStatus());

        // A temple going dark is an economic hit with no number attached to it,
        // so it is the kind of thing a player misses entirely while watching the
        // lane. Said once when it happens, and once when it comes back.
        on('temple-sabotaged', (t) => {
            this._flashNotification(
                `¡${TEMPLE_DATA[t.element].shortName} apagado! no absorbe ${MANA}`, '#FF8A80'
            );
            this._updateManaBar();
        });
        on('temple-restored', (t) => {
            this._flashNotification(`${TEMPLE_DATA[t.element].shortName} de vuelta`, '#4CAF50');
            this._updateManaBar();
        });

        // A velador turning around on its own is invisible as a rule. Said the
        // first time it happens, when the player is watching the thing that just
        // stopped chasing them.
        on('hero-sheltered', () => {
            if (this.saidOnce.shelter) return;
            this.saidOnce.shelter = true;
            this._flashNotification('El circulo del templo ahuyenta veladores', '#B388FF');
        });

        // The spell cursor is armed and disarmed by GameScene — from a click
        // here, from a hotkey, from ESC, or by picking up a build cursor
        // instead. The button follows that state rather than owning it.
        on('spell-armed', (key) => this._setSpellArmed(key));
        on('spell-disarmed', () => this._setSpellArmed(null));
        on('spell-cast', (key) => {
            const s = SPELLS[key];
            if (s) this._flashNotification(`${s.label}  −${s.cost}✦`, s.colorHex);
        });

        on('wave-started', () => {
            this._updateStatus();
            this.waveBtnBg.fillColor = 0x333344;
            this.waveBtnText.setColor('#555555');
            // currentWave has already advanced, so the readout now describes the
            // wave after this one — which is the one still worth preparing for.
            this._refreshWavePreview();
        });

        on('wave-complete', () => {
            this._refreshWavePreview();
            if (this.gs.waveManager.isLastWave) return;

            this.waveBtnBg.fillColor = 0x2E7D32;
            this.waveBtnText.setColor('#FFFFFF');

            this.gs.economySystem.addGold(15);
            this._flashNotification('¡Oleada completada! +15 oro', '#4CAF50');

            if (this.gs.waveManager.autoWave) {
                this.time.delayedCall(2000, () => {
                    if (this.gs.waveManager.autoWave && !this.gs.waveManager.waveActive) {
                        this.gs.events.emit('start-wave');
                    }
                });
            }
        });

        on('placement-cancelled', () => {
            if (this.selectedBtn) {
                this._setBtnSelected(this.selectedBtn, false);
                this.selectedBtn = null;
            }
        });

        on('temple-built', (el) => {
            this._flashNotification(`¡${TEMPLE_DATA[el].name} erigido!`, '#B388FF');
            this._updateAffordability();
            this._updateManaBar();
        });

        // Selling a temple moves the price of the next one and can empty the
        // maná goal, so the whole sidebar is re-read rather than just the gold.
        on('structure-sold', (kind, refund) => {
            this._flashNotification(`+${refund} oro`, '#FFD700');
            this._updateAffordability();
            this._updateManaBar();
        });

        on('fusion-hover', (info) => {
            if (info) this._showFusionTooltip(info);
            else this._hideTooltip();
        });

        on('open-temple', (el) => this._openUpgradePanel(el));
        on('hint', (text, color) => this._flashNotification(text, color ?? '#B388FF'));

        // Said until the player completes their first fusion
        on('fusion-available', (link) => {
            if (this.saidOnce.firstFusionDone) return;
            this._showFusionPopup(link);
        });
        on('fusion-drag-begin', () => this._hideFusionPopup());
        on('fusion-complete', () => {
            this.saidOnce.firstFusionDone = true;
            this._hideFusionPopup();
        });

        // Said once, the first time it happens: the floating +N shows that the
        // hero collects, but not that he collects at face value. While the
        // tutorial is up it is teaching exactly this, so the hint stays quiet.
        on('hero-collected', () => {
            if (this.heroHintShown) return;
            if (this.gs.tutorial && this.gs.tutorial.active) return;
            this.heroHintShown = true;
            this._flashNotification('El heroe recoge ✦ sin refinar', '#B388FF');
        });

        // ── Elemental match-ups ─────────────────
        // Colour and an arrow only mean something once. Named the first time
        // each kind of hit happens, then never again.
        on('damage-effect', (effect) => {
            const key = `effect-${effect}`;
            if (this.saidOnce[key]) return;
            this.saidOnce[key] = true;
            const pct = effect === EFFECT.SUPER
                ? `+${Math.round((SUPER_MULT - 1) * 100)}%`
                : `-${Math.round((1 - RESIST_MULT) * 100)}%`;
            this._flashNotification(
                `${EFFECT_MARK[effect]} ${EFFECT_LABEL[effect]}: ${pct} daño`,
                EFFECT_COLOR[effect]
            );
        });

        // ── Hero combo ──────────────────────────
        on('hero-combo', (count, mult) => {
            if (this.saidOnce.combo) return;
            this.saidOnce.combo = true;
            this._flashNotification(
                `Combo x${mult.toFixed(2)}: seguí recogiendo (${COMBO.window / 1000}s)`,
                '#FFD54F'
            );
        });

        // ── Tutorial ────────────────────────────
        on('tutorial-step', (text, highlight) => {
            this._showTutorialStep(text, highlight);
        });
        on('tutorial-done', () => {
            this._flashNotification('Tutorial completo. Suerte.', '#4CAF50');
        });

        on('temple-upgraded', (el, track, lvl) => {
            this._flashNotification(
                `${TEMPLE_DATA[el].shortName}: ${UPGRADE_TRACKS[track].label} Nv.${lvl}`,
                '#FFD54F'
            );
            this._updateManaBar();
        });

        on('fusion-complete', (el, kind) => {
            const d = kind === 'temple' ? TEMPLE_DATA[el] : TOWER_DATA[el];
            const what = kind === 'temple' ? `Templo de ${d.shortName}` : d.name;
            this._flashNotification(`¡${d.emoji} ${what} creado!`, '#FFD700');
            if (kind === 'temple') {
                this._closeUpgradePanel();
                this._updateAffordability();
                this._updateManaBar();
            }
        });

        on('game-over', () => {
            this._closeUpgradePanel();
            this._closeHelpPanel();
            this._showTutorialStep(null, null);
            this._showEndScreen('¡DERROTA!', '#EF5350');
        });
        on('all-waves-complete', () => {
            this._closeUpgradePanel();
            this._closeHelpPanel();
            this._showTutorialStep(null, null);
            this._showEndScreen('¡VICTORIA!', '#4CAF50');
        });
    }

    // ─── Modal plumbing ─────────────────────────────────
    /**
     * Overlays live over the map, not the sidebar, and swallow clicks so a
     * press meant for the panel never falls through onto the board behind it.
     */
    _openModal(w, h, borderColor) {
        this._hideTooltip();
        this.gs._cancelPlacement();
        this.gs.uiModalOpen = true;

        const shade = this.add.rectangle(MAP_CX, MAP_CY, 640, 480, 0x000000, 0.62)
            .setDepth(79)
            .setInteractive();

        const c = this.add.container(MAP_CX, MAP_CY).setDepth(80);
        const bg = this.add.rectangle(0, 0, w, h, 0x12122a, 0.98);
        bg.setStrokeStyle(2, borderColor);
        c.add(bg);

        c.setScale(0.9).setAlpha(0);
        this.tweens.add({
            targets: c, scaleX: 1, scaleY: 1, alpha: 1,
            duration: 180, ease: 'Back.easeOut',
        });

        return { shade, container: c };
    }

    _closeButton(container, y, onClick) {
        const bg = this.add.rectangle(0, y, 130, 30, 0x333344)
            .setStrokeStyle(1, 0x555577)
            .setInteractive({ useHandCursor: true });
        const txt = this.add.text(0, y, 'CERRAR', {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
        }).setOrigin(0.5);
        bg.on('pointerdown', () => { audio.play('click'); onClick(); });
        bg.on('pointerover', () => { bg.fillColor = 0x44445a; });
        bg.on('pointerout', () => { bg.fillColor = 0x333344; });
        container.add([bg, txt]);
    }

    // ─── Reference overlay ──────────────────────────────
    /**
     * The fusion table used to sit permanently in the sidebar at 6px, where it
     * was barely legible and ate the room every other section needed. As an
     * overlay it can be read at a usable size and costs nothing when closed.
     *
     * Four tabs now, because there are four sets of rules a player has to be
     * able to look up mid-game and none of them fit in a tooltip: what fuses
     * with what, which element beats which, what the hero can do, and what the
     * maná buys besides temple ranks.
     */
    _openHelpPanel(tab = 'fusion') {
        // Pressing ? again closes; picking the tab you are on does too.
        if (this.helpPanel && this.helpTab === tab) { this._closeHelpPanel(); return; }

        const reopening = !!this.helpPanel;
        this._closeHelpPanel();
        if (!reopening) this._closeUpgradePanel();

        const { shade, container } = this._openModal(470, 336, 0xFFD54F);
        this.helpShade = shade;
        this.helpTab = tab;

        this._buildHelpTabs(container, tab);

        if (tab === 'elements') this._buildElementsTab(container);
        else if (tab === 'hero') this._buildHeroTab(container);
        else if (tab === 'spells') this._buildSpellsTab(container);
        else this._buildFusionTab(container);

        this._closeButton(container, 148, () => this._closeHelpPanel());
        this.helpPanel = container;
    }

    _buildHelpTabs(container, active) {
        const TABS = [
            { key: 'fusion', label: 'FUSIONES' },
            { key: 'elements', label: 'ELEMENTOS' },
            { key: 'hero', label: 'HEROE' },
            { key: 'spells', label: 'HECHIZOS' },
        ];

        TABS.forEach((t, i) => {
            const x = -177 + i * 118;
            const on = t.key === active;

            const bg = this.add.rectangle(x, -150, 112, 24, on ? 0x2a2a5a : 0x16162a)
                .setStrokeStyle(1, on ? 0xFFD54F : 0x3a3a5a)
                .setInteractive({ useHandCursor: true });
            const txt = this.add.text(x, -150, t.label, {
                fontFamily: FONT, fontSize: '8px', color: on ? '#FFD54F' : '#78909C',
            }).setOrigin(0.5);

            bg.on('pointerdown', (pointer) => {
                pointer.event.stopPropagation();
                audio.play('click');
                this._openHelpPanel(t.key);
            });

            container.add([bg, txt]);
        });
    }

    _buildFusionTab(container) {
        container.add(this.add.text(0, -126, 'Arrastra una torre sobre su vecina.', {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
        }).setOrigin(0.5));
        container.add(this.add.text(0, -113, 'Las que brillan tienen con quien fusionar.', {
            fontFamily: FONT, fontSize: '8px', color: '#78909C',
        }).setOrigin(0.5));
        container.add(this.add.text(0, -100, 'Igual para templos. Nace donde la soltaste.', {
            fontFamily: FONT, fontSize: '8px', color: '#78909C',
        }).setOrigin(0.5));

        // Derived from FUSION_MAP so the table can never drift from the rules.
        Object.entries(FUSION_MAP).forEach(([pair, result], i) => {
            const [a, b] = pair.split('+');
            const y = -70 + i * 40;
            const d = TOWER_DATA[result];

            const icon = (x, el) => container.add(
                this.add.sprite(x, y, safeTexture(this, `tower_${el}`, 'tower_earth')).setScale(0.9)
            );
            const glyph = (x, t) => container.add(
                this.add.text(x, y, t, {
                    fontFamily: FONT, fontSize: '8px', color: '#78909C',
                }).setOrigin(0.5)
            );

            icon(-190, a);
            glyph(-160, '+');
            icon(-130, b);
            glyph(-100, '=');
            icon(-70, result);

            container.add(this.add.text(-44, y - 6, d.name, {
                fontFamily: FONT, fontSize: '8px', color: `#${d.color.toString(16).padStart(6, '0')}`,
            }).setOrigin(0, 0.5));
            container.add(this.add.text(-44, y + 9, d.specialDesc, {
                fontFamily: FONT, fontSize: '8px', color: '#78909C',
            }).setOrigin(0, 0.5));
        });
    }

    /**
     * The match-up table, read straight off ENEMY_DATA. Every element is named
     * by its glyph as well as its word, and the two verdicts carry ▲ and ▼, so
     * none of this depends on telling gold from grey.
     */
    _buildElementsTab(container) {
        const superPct = `x${SUPER_MULT}`;
        const resistPct = `x${RESIST_MULT}`;

        container.add(this.add.text(0, -124,
            `${EFFECT_MARK[EFFECT.SUPER]} Super efectivo ${superPct}   ·   ${EFFECT_MARK[EFFECT.RESIST]} Resistido ${resistPct}`,
            { fontFamily: FONT, fontSize: '8px', color: '#B0BEC5' }
        ).setOrigin(0.5));

        container.add(this.add.text(0, -110, 'Los hibridos cuentan como su propio elemento.', {
            fontFamily: FONT, fontSize: '8px', color: '#78909C',
        }).setOrigin(0.5));

        const list = (els) => (els?.length ? els.map(elementSymbol).join(' ') : '—');

        Object.entries(ENEMY_DATA).forEach(([type, d], i) => {
            const y = -76 + i * 44;

            container.add(this.add.rectangle(0, y, 420, 40, 0x0d0d1c, 0.55)
                .setStrokeStyle(1, 0x22223a));

            container.add(this.add.sprite(
                -188, y, safeTexture(this, `enemy_${type}`, 'enemy_slime')
            ).setScale(0.85));

            // Name, epithet, and the one line that says what the thing is.
            // These four are what the Marcas made out of what died in them, and
            // a bestiary that only lists hit points never says so.
            container.add(this.add.text(-166, y - 12,
                `${(d.title ?? d.name).toUpperCase()}  ·  ${elementSymbol(d.element)} ${d.hp} HP`, {
                    fontFamily: FONT, fontSize: '8px',
                    color: `#${d.color.toString(16).padStart(6, '0')}`,
                }).setOrigin(0, 0.5));

            container.add(this.add.text(-166, y + 2, d.codex ?? '', {
                fontFamily: FONT, fontSize: '7px', color: '#8a93a8',
            }).setOrigin(0, 0.5));

            container.add(this.add.text(-166, y + 13,
                `${elementName(d.element)}`,
                { fontFamily: FONT, fontSize: '7px', color: '#5f6a80' }
            ).setOrigin(0, 0.5));

            container.add(this.add.text(122, y - 9,
                `${EFFECT_MARK[EFFECT.SUPER]} ${list(d.weakness)}`,
                { fontFamily: FONT, fontSize: '8px', color: EFFECT_COLOR[EFFECT.SUPER] }
            ).setOrigin(0, 0.5));

            container.add(this.add.text(122, y + 8,
                `${EFFECT_MARK[EFFECT.RESIST]} ${list(d.resistance)}`,
                { fontFamily: FONT, fontSize: '8px', color: EFFECT_COLOR[EFFECT.RESIST] }
            ).setOrigin(0, 0.5));
        });
    }

    /**
     * What the maná buys that is not a temple rank.
     *
     * The first line is the one that matters: until this tab existed, every
     * mote a player collected had exactly one destination, and the upgrade bar
     * in the sidebar said so. A spell only becomes a decision once you know it
     * is competing for the same number.
     */
    _buildSpellsTab(container) {
        container.add(this.add.text(0, -124, `Gastan ${MANA}, el mismo que las mejoras de templo.`, {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
        }).setOrigin(0.5));
        container.add(this.add.text(0, -110, 'Se apuntan con un click en el mapa.', {
            fontFamily: FONT, fontSize: '8px', color: '#78909C',
        }).setOrigin(0.5));

        SPELL_ORDER.forEach((key, i) => {
            const s = SPELLS[key];
            const y = -70 + i * 74;

            container.add(this.add.rectangle(0, y, 420, 66, 0x0d0d1c, 0.55)
                .setStrokeStyle(1, 0x22223a));

            container.add(this.add.rectangle(-180, y, 34, 34, 0x12122a)
                .setStrokeStyle(2, s.color));
            container.add(this.add.image(-180, y, safeTexture(this, s.icon, 'mana_mote')));

            container.add(this.add.text(-152, y - 22, spellHeading(key), {
                fontFamily: FONT, fontSize: '8px', color: s.colorHex,
            }).setOrigin(0, 0.5));

            container.add(this.add.text(-152, y - 12, s.desc.join('\n'), {
                fontFamily: FONT, fontSize: '8px', color: '#B0BEC5', lineSpacing: 5,
            }).setOrigin(0, 0));
        });
    }

    _buildHeroTab(container) {
        container.add(this.add.text(0, -124, 'Click derecho mueve al heroe.', {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
        }).setOrigin(0.5));

        ABILITY_ORDER.forEach((key, i) => {
            const a = HERO_ABILITIES[key];
            const y = -88 + i * 66;

            container.add(this.add.rectangle(0, y, 420, 58, 0x0d0d1c, 0.55)
                .setStrokeStyle(1, 0x22223a));

            container.add(this.add.rectangle(-180, y, 30, 30, 0x12122a)
                .setStrokeStyle(2, a.color));
            container.add(this.add.text(-180, y, a.glyph, {
                fontFamily: FONT, fontSize: '8px', color: a.colorHex,
            }).setOrigin(0.5));

            container.add(this.add.text(-152, y - 18, abilityHeading(key), {
                fontFamily: FONT, fontSize: '8px', color: a.colorHex,
            }).setOrigin(0, 0.5));

            // Anchored at its top edge, not its middle: a centred block grows
            // upward as lines are added and walks straight over the heading.
            container.add(this.add.text(-152, y - 6, a.desc.join('\n'), {
                fontFamily: FONT, fontSize: '8px', color: '#B0BEC5', lineSpacing: 5,
            }).setOrigin(0, 0));
        });

        // The codex. Every line of it is a rule the game already enforces —
        // motes evaporate, the lantern holds the streak, the monoliths burn
        // hotter near Vesper — so the flavour doubles as the manual.
        container.add(this.add.rectangle(0, 100, 420, 52, 0x0d0d1c, 0.55)
            .setStrokeStyle(1, 0x22223a));
        // The portrait shows whatever Vesper is currently wearing, but always
        // standing still: a codex illustration caught mid-stride reads as a
        // mistake rather than as an animation frame.
        container.add(this.add.sprite(-186, 100, safeTexture(this,
            heroTextureKey(this.gs.hero ? this.gs.hero.look : DEFAULT_LOOK, 'stand'),
            'mana_mote')).setScale(1.1));
        container.add(this.add.text(-164, 82, `${HERO_LORE.name}  ·  ${HERO_LORE.order}`, {
            fontFamily: FONT, fontSize: '8px', color: '#B388FF',
        }).setOrigin(0, 0.5));
        container.add(this.add.text(-164, 90, HERO_LORE.codex.join('\n'), {
            fontFamily: FONT, fontSize: '7px', color: '#78909C', lineSpacing: 2,
        }).setOrigin(0, 0));

        container.add(this.add.rectangle(0, 44, 420, 58, 0x0d0d1c, 0.55)
            .setStrokeStyle(1, 0x22223a));
        container.add(this.add.text(-196, 26, `COMBO DE ${MANA}`, {
            fontFamily: FONT, fontSize: '8px', color: '#FFD54F',
        }).setOrigin(0, 0.5));
        container.add(this.add.text(-196, 50, [
            `Cada orbe recogido dentro de ${COMBO.window / 1000}s del anterior suma`,
            `+${Math.round(COMBO.step * 100)}% al valor del siguiente, hasta x${COMBO.maxMult}.`,
            'Se reinicia si dejas de recoger. El templo no combea.',
        ].join('\n'), {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5', lineSpacing: 4,
        }).setOrigin(0, 0.5));
    }

    _closeHelpPanel() {
        if (this.helpShade) { this.helpShade.destroy(); this.helpShade = null; }
        this.helpTab = null;
        if (!this.helpPanel) return;
        this.helpPanel.destroy(true);
        this.helpPanel = null;
        if (!this.upgradePanel) this.gs.uiModalOpen = false;
    }

    // ─── Temple upgrade panel ───────────────────────────
    _openUpgradePanel(element) {
        this._closeUpgradePanel();
        this._closeHelpPanel();

        const d = TEMPLE_DATA[element];
        const { shade, container } = this._openModal(390, 340, d.color);
        this.panelShade = shade;
        this.panelElement = element;

        container.add(this.add.rectangle(0, -132, 390, 50, d.color, 0.14));
        container.add(this.add.sprite(
            -162, -132, safeTexture(this, `temple_${element}`, 'temple_earth')
        ).setScale(1.2));
        this.panelTitle = this.add.text(-132, -140, d.name.toUpperCase(), {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
        }).setOrigin(0, 0.5);
        container.add(this.panelTitle);

        this.panelSubtitle = this.add.text(-132, -120, '', {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
        }).setOrigin(0, 0.5);
        container.add(this.panelSubtitle);

        this.panelRows = {};
        TRACK_ORDER.forEach((track, i) => {
            this.panelRows[track] = this._buildUpgradeRow(container, element, track, -66 + i * 68);
        });

        this.panelFooter = this.add.text(0, 118, '', {
            fontFamily: FONT, fontSize: '8px', color: '#78909C',
            align: 'center', lineSpacing: 5,
        }).setOrigin(0.5);
        container.add(this.panelFooter);

        this._closeButton(container, 150, () => this._closeUpgradePanel());

        this.upgradePanel = container;
        this._refreshUpgradePanel();
    }

    _buildUpgradeRow(container, element, track, y) {
        const t = UPGRADE_TRACKS[track];

        const bandBg = this.add.rectangle(0, y, 356, 60, 0x0d0d1c, 0.6);
        bandBg.setStrokeStyle(1, 0x22223a);

        const name = this.add.text(-168, y - 16, t.label, {
            fontFamily: FONT, fontSize: '8px', color: t.color,
        }).setOrigin(0, 0.5);

        // One pip per possible level, so the whole progression is legible
        // before you have bought any of it.
        const pips = [];
        for (let i = 0; i < t.maxLevel; i++) {
            const pip = this.add.rectangle(-163 + i * 15, y + 10, 12, 9, 0x22223a);
            pip.setStrokeStyle(1, 0x3a3a5a);
            pips.push(pip);
        }

        // The concrete before → after, which a bare "+20%" never conveyed
        const preview = this.add.text(-6, y - 14, '', {
            fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
        }).setOrigin(0.5);
        const pct = this.add.text(-6, y + 10, '', {
            fontFamily: FONT, fontSize: '8px', color: t.color,
        }).setOrigin(0.5);

        const btnBg = this.add.rectangle(120, y, 112, 46, 0x1e1e3a)
            .setStrokeStyle(1, 0x3a3a5a)
            .setInteractive({ useHandCursor: true });
        const btnTop = this.add.text(120, y - 11, 'MEJORAR', {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
        }).setOrigin(0.5);
        const btnCost = this.add.text(120, y + 10, '', {
            fontFamily: FONT, fontSize: '8px', color: '#B388FF',
        }).setOrigin(0.5);

        btnBg.on('pointerdown', () => {
            if (this.gs.templeSystem.buyUpgrade(element, track)) {
                this._pulse(btnBg);
                this._refreshUpgradePanel();
            } else {
                audio.play('deny');
                this.cameras.main.shake(90, 0.003);
            }
        });

        container.add([bandBg, name, ...pips, preview, pct, btnBg, btnTop, btnCost]);
        return { bandBg, name, pips, preview, pct, btnBg, btnTop, btnCost };
    }

    /** Effective stat value for `element` at a given level of one track. */
    _statAt(element, track, level) {
        const base = TOWER_DATA[element][track];
        const bonus = UPGRADE_TRACKS[track].step * level;
        return track === 'fireRate' ? base / (1 + bonus) : base * (1 + bonus);
    }

    _refreshUpgradePanel() {
        if (!this.upgradePanel || !this.panelElement) return;

        const ts = this.gs.templeSystem;
        const el = this.panelElement;
        const mana = this.gs.economySystem.mana;
        const n = ts.towerCount(el);
        const d = TEMPLE_DATA[el];
        const total = ts.totalLevels(el);

        // Rank in the title, the building's own numbers underneath: what this
        // temple *is* belongs beside its name, not buried in a tooltip.
        this.panelTitle.setText(
            total > 0 ? `${d.name.toUpperCase()}  Nv.${total}` : d.name.toUpperCase()
        );
        this.panelSubtitle.setText(
            `${MANA} ${mana} · ${n} ${n === 1 ? 'torre' : 'torres'} · alc ${d.absorbRadius} · +${Math.round(d.absorbBonus * 100)}% ${MANA}`
        );

        for (const track of TRACK_ORDER) {
            const row = this.panelRows[track];
            const t = UPGRADE_TRACKS[track];
            const lvl = ts.levelOf(el, track);
            const maxed = ts.isMaxed(el, track);
            const cost = ts.costOf(el, track);
            const affordable = mana >= cost;

            row.pips.forEach((pip, i) => {
                pip.fillColor = i < lvl ? t.colorNum : 0x22223a;
                pip.setStrokeStyle(1, i < lvl ? t.colorNum : 0x3a3a5a);
            });

            const now = Math.round(this._statAt(el, track, lvl));
            if (maxed) {
                row.preview.setText(`${now}`);
                row.pct.setText(`+${ts.bonusPct(el, track)}%`);
                row.btnTop.setText('MAXIMO');
                row.btnTop.setColor('#4CAF50');
                row.btnCost.setText('');
                row.btnBg.fillColor = 0x14210f;
                row.btnBg.setStrokeStyle(1, 0x4CAF50);
            } else {
                row.preview.setText(`${now} → ${Math.round(this._statAt(el, track, lvl + 1))}`);
                row.pct.setText(`+${Math.round(t.step * 100)}% por nivel`);
                row.btnTop.setText('MEJORAR');
                row.btnTop.setColor(affordable ? '#FFFFFF' : '#555566');
                row.btnCost.setText(`${cost} ${MANA}`);
                row.btnCost.setColor(affordable ? '#B388FF' : '#555566');
                row.btnBg.fillColor = affordable ? 0x241d3d : 0x16162a;
                row.btnBg.setStrokeStyle(1, affordable ? 0xB388FF : 0x2a2a3a);
            }
        }

        this.panelFooter.setText(
            n === 0
                ? 'Aun no tenes torres de este elemento.\nLas mejoras las esperan igual.'
                : 'Afecta a TODAS las torres de este elemento,\nincluso a las que construyas despues.'
        );
    }

    _closeUpgradePanel() {
        if (this.panelShade) { this.panelShade.destroy(); this.panelShade = null; }
        if (!this.upgradePanel) return;
        this.upgradePanel.destroy(true);
        this.upgradePanel = null;
        this.panelElement = null;
        this.panelRows = null;
        this.panelTitle = null;
        if (!this.helpPanel) this.gs.uiModalOpen = false;
    }

    _pulse(obj) {
        this.tweens.add({
            targets: obj, scaleX: 1.06, scaleY: 1.1,
            duration: 90, yoyo: true, ease: 'Quad.easeOut',
        });
    }

    // ─── Tooltip ────────────────────────────────────────
    _showTowerTooltip(element, x, y) {
        const td = TOWER_DATA[element];
        const ts = this.gs.templeSystem;
        const rate = td.fireRate * ts.multiplier(element, 'fireRate');
        const lines = [
            td.name,
            `DMG: ${Math.round(td.damage * ts.multiplier(element, 'damage'))}`,
            `RNG: ${Math.round(td.range * ts.multiplier(element, 'range'))}`,
            `SPD: ${(1000 / rate).toFixed(2)}/s`,
            td.specialDesc,
        ];
        if (ts.totalLevels(element) > 0) lines.push('mejorada por templo');
        this._showTooltip(lines, x, y);
    }

    /**
     * `originX` is 1 by default because everything in the sidebar hangs to the
     * left of the thing it describes. The hero bar sits at the far left of the
     * board instead, where a right-anchored box would run off the edge.
     */
    _showTooltip(lines, x, y, originX = 1) {
        this._hideTooltip();
        this.tooltip = this.add.text(x, y, lines.join('\n'), {
            fontFamily: FONT,
            fontSize: '8px',
            color: '#ECEFF1',
            backgroundColor: '#0a0a1af0',
            padding: { x: 10, y: 10 },
            lineSpacing: 7,
        }).setOrigin(originX, 0.5).setDepth(100);
    }

    _hideTooltip() {
        if (this.tooltip) { this.tooltip.destroy(); this.tooltip = null; }
    }

    // ─── Floating Fusion Prompt Card ───────────────────
    /**
     * Floating popup card placed directly above the two newly connected towers,
     * teaching new players how to drag and drop to fuse without cluttering the screen.
     */
    _showFusionPopup(link) {
        this._hideFusionPopup();
        if (!link || !link.b1 || !link.b2) return;

        const isTemple = link.kind === 'temple';
        const midX = (link.b1.x + link.b2.x) / 2;
        const minY = Math.min(link.b1.y, link.b2.y);

        // Clamp inside map boundaries
        const targetX = Phaser.Math.Clamp(midX, 100, 540);
        const targetY = Phaser.Math.Clamp(minY - 42, 42, 420);

        const container = this.add.container(targetX, targetY).setDepth(120);

        const boxW = 168;
        const boxH = 58;

        // Glowing background card
        const bg = this.add.rectangle(0, 0, boxW, boxH, 0x0c0c1e, 0.95);
        bg.setStrokeStyle(1.5, 0xFFD54F);

        // Little arrow indicator at bottom pointing towards the towers below
        const arrow = this.add.triangle(0, boxH / 2 + 2, -4, 0, 4, 0, 0, 4, 0xFFD54F);

        const titleText = isTemple ? 'FUSION DISPONIBLE' : 'FUSION DISPONIBLE';
        const title = this.add.text(0, -16, `✦ ${titleText} ✦`, {
            fontFamily: FONT,
            fontSize: '7px',
            color: '#FFD54F',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5);

        const bodyText = isTemple
            ? 'Arrastra un templo\nsobre el otro para\ncrear un hibrido.'
            : 'Arrastra una torre\nsobre la otra para\ncrear un hibrido.';

        const body = this.add.text(0, 8, bodyText, {
            fontFamily: FONT,
            fontSize: '7px',
            color: '#ECEFF1',
            align: 'center',
            lineSpacing: 3,
        }).setOrigin(0.5);

        container.add([bg, arrow, title, body]);

        // Pop in animation
        container.setScale(0.8).setAlpha(0);
        this.tweens.add({
            targets: container,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            duration: 250,
            ease: 'Back.easeOut',
        });

        this.fusionPopup = container;

        // Show for 7.5s before gently fading away
        this.fusionPopupTimer = this.time.delayedCall(7000, () => {
            this._hideFusionPopup();
        });
    }

    _hideFusionPopup() {
        if (this.fusionPopupTimer) {
            this.fusionPopupTimer.remove();
            this.fusionPopupTimer = null;
        }
        if (this.fusionPopup) {
            const popup = this.fusionPopup;
            this.fusionPopup = null;
            this.tweens.add({
                targets: popup,
                alpha: 0,
                y: popup.y - 12,
                duration: 350,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    popup.destroy();
                },
            });
        }
    }

    // ─── Notifications ──────────────────────────────────
    /**
     * Buying three upgrades in a row used to stack three messages on the same
     * pixel row, so each new one lands a line lower and frees its slot on fade.
     */
    _flashNotification(text, color) {
        // Suppress exact duplicate that was shown within the last 500ms
        const now = Date.now();
        if (this._lastNotifs) {
            for (const entry of this._lastNotifs) {
                if (entry.text === text && now - entry.time < 500) return;
            }
        }
        if (!this._lastNotifs) this._lastNotifs = [];
        this._lastNotifs.push({ text, time: now });
        // Keep the dedup window small
        if (this._lastNotifs.length > 10) this._lastNotifs.shift();

        // Queue if too many are already showing
        const MAX_VISIBLE = 3;
        if (!this._notifQueue) this._notifQueue = [];
        const activeCount = this.notifSlots.filter(Boolean).length;
        if (activeCount >= MAX_VISIBLE) {
            this._notifQueue.push({ text, color });
            return;
        }

        this._showNotif(text, color);
    }

    _showNotif(text, color) {
        let slot = 0;
        while (this.notifSlots[slot]) slot++;
        this.notifSlots[slot] = true;

        const n = this.add.text(MAP_CX, 34 + slot * 18, text, {
            fontFamily: FONT, fontSize: '8px', color,
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(100);

        this.tweens.add({
            targets: n, y: 12 + slot * 18, alpha: 0,
            duration: 2800, ease: 'Quad.easeOut',
            onComplete: () => {
                this.notifSlots[slot] = false;
                n.destroy();
                // Show next queued notification if any
                if (this._notifQueue && this._notifQueue.length > 0) {
                    const next = this._notifQueue.shift();
                    this._showNotif(next.text, next.color);
                }
            },
        });
    }

    // ─── Affordability ──────────────────────────────────
    _updateAffordability() {
        const gold = this.gs.economySystem.gold;

        this.goldValue.setText(`${gold}`);
        this.manaValue.setText(`${this.gs.economySystem.mana}`);

        for (const btn of this.towerBtns) {
            this._setAffordable(btn, gold >= TOWER_DATA[btn.element].cost);
        }
        this._setAffordable(this.barricadeBtn, gold >= BARRICADE_COST);

        this._refreshTempleButtons();
        const templeCost = this.gs.templeSystem.nextCost;
        for (const btn of this.templeBtns) {
            this._setAffordable(btn, gold >= templeCost);
        }
        const canAfford = gold >= templeCost;
        this.templeCostLabel.setColor(canAfford ? '#FFD700' : '#555555');
        this.templeCostCoin.setAlpha(canAfford ? 1 : 0.3);
        this.templeCostValue.setColor(canAfford ? '#FFD700' : '#555555');
    }

    _setAffordable(btn, can) {
        btn.icon.setAlpha(can ? 1 : 0.3);
        if (btn.coin) btn.coin.setAlpha(can ? 1 : 0.3);
        if (btn.cost) btn.cost.setColor(can ? '#FFD700' : '#555555');
        if (!can && this.selectedBtn === btn) {
            this._setBtnSelected(btn, false);
            this.selectedBtn = null;
            this.gs._cancelPlacement();
        }
    }

    // ─── End screen ─────────────────────────────────────
    _showEndScreen(message, color) {
        const c = this.add.container(0, 0).setDepth(90);
        
        const shade = this.add.rectangle(460, 240, 920, 480, 0x000000, 0.78);
        c.add(shade);

        const title = this.add.text(MAP_CX, 130, message, {
            fontFamily: FONT, fontSize: '24px', color,
            stroke: '#000000', strokeThickness: 5,
        }).setOrigin(0.5);
        c.add(title);

        const stats = [
            `Oleadas: ${this.gs.waveManager.currentWave}/${this.gs.waveManager.totalWaves}`,
            `Oro: ${this.gs.economySystem.gold}`,
            `Fuerza vital: ${this.gs.economySystem.mana}`,
            `Recogida por el heroe: ${this.gs.hero.manaCollected}`,
            `Templos: ${this.gs.temples.length}`,
            `Torres: ${this.gs.towers.length}`,
        ];
        const statsText = this.add.text(MAP_CX, 224, stats.join('\n'), {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
            lineSpacing: 10, align: 'center',
        }).setOrigin(0.5);
        c.add(statsText);

        const isVictory = message === '¡VICTORIA!';
        const rx = isVictory ? MAP_CX - 150 : MAP_CX - 90;
        const mx = isVictory ? MAP_CX + 150 : MAP_CX + 90;

        // Restart Button
        const rbg = this.add.rectangle(rx, 340, 140, 38, 0x2E7D32);
        rbg.setStrokeStyle(2, 0x4CAF50);
        rbg.setInteractive({ useHandCursor: true });
        const rtext = this.add.text(rx, 340, 'REINTENTAR', {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
        }).setOrigin(0.5);
        c.add([rbg, rtext]);

        rbg.on('pointerdown', () => {
            SaveSystem.clearSave();
            this.scene.stop('UIScene');
            this.scene.stop('GameScene');
            this.scene.start('GameScene', { continueGame: false });
        });
        rbg.on('pointerover', () => { rbg.fillColor = 0x388E3C; });
        rbg.on('pointerout', () => { rbg.fillColor = 0x2E7D32; });

        // Main Menu Button
        const mbg = this.add.rectangle(mx, 340, 140, 38, 0x282848);
        mbg.setStrokeStyle(2, 0x90CAF9);
        mbg.setInteractive({ useHandCursor: true });
        const mtext = this.add.text(mx, 340, 'MENÚ PRINCIPAL', {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
        }).setOrigin(0.5);
        c.add([mbg, mtext]);

        mbg.on('pointerdown', () => {
            SaveSystem.clearSave();
            this.scene.stop('UIScene');
            this.scene.stop('GameScene');
            this.scene.start('TitleScene');
        });
        mbg.on('pointerover', () => { mbg.fillColor = 0x3a3a68; });
        mbg.on('pointerout', () => { mbg.fillColor = 0x282848; });

        // Infinite Mode Button (Only on Victory)
        if (isVictory) {
            const ibg = this.add.rectangle(MAP_CX, 340, 140, 38, 0x8E24AA);
            ibg.setStrokeStyle(2, 0xAB47BC);
            ibg.setInteractive({ useHandCursor: true });
            const itext = this.add.text(MAP_CX, 340, 'MODO INFINITO', {
                fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
            }).setOrigin(0.5);
            c.add([ibg, itext]);

            ibg.on('pointerdown', () => {
                audio.play('click');
                c.destroy();
                this.gs.gameWon = false; // Unfreeze game
                // Optionally start the next wave immediately
                this.gs.events.emit('start-wave');
            });
            ibg.on('pointerover', () => { ibg.fillColor = 0x9C27B0; });
            ibg.on('pointerout', () => { ibg.fillColor = 0x8E24AA; });
        }
    }
}
