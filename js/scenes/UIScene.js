import * as Phaser from 'phaser';
import { ELEMENTS, TOWER_DATA, FUSION_MAP, LEGENDARY_MAP, TOWER_UPGRADE } from '../data/TowerData.js';
import {
    TEMPLE_DATA, TEMPLE_ELEMENTS, UPGRADE_TRACKS, TRACK_ORDER, OVERCHARGE,
} from '../data/TempleData.js';
import { safeTexture } from '../systems/TextureGuard.js';
import { audio } from '../systems/AudioSystem.js';
import { BARRICADE_COST, SELL_REFUND } from '../systems/EconomySystem.js';
import { BARRICADE_ENCHANTS, ENCHANT, enchantCostLabel } from '../data/BarricadeData.js';
import { MANA_SPRITE } from '../data/ManaSprite.js';
import { ENEMY_DATA } from '../data/EnemyData.js';
import {
    EFFECT, EFFECT_MARK, EFFECT_LABEL, EFFECT_COLOR,
    SUPER_MULT, RESIST_MULT, elementSymbol, elementName,
} from '../data/Elements.js';
import { HERO_ABILITIES, ABILITY_ORDER, COMBO, abilityHeading } from '../data/HeroData.js';
import { SPELLS, SPELL_ORDER, spellHeading } from '../data/SpellData.js';
import { IconText, hasManaGlyph } from '../systems/IconText.js';
import { HERO_LORE, DEFAULT_LOOK, heroTextureKey } from '../data/HeroLook.js';
import { applyViewport, worldToView, pointerWorld, SUPER } from '../systems/Viewport.js';
import { OptionsModal } from '../systems/OptionsModal.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { fusionCost } from '../systems/FusionSystem.js';

const FONT = '"Press Start 2P"';
// Stands for the maná sprite in any string drawn through IconText.
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
// The next-wave row: one cell per kind of enemy, as many as fit after the label.
const PREVIEW_CELL = 46;
const PREVIEW_MAX = 4;

// Vesper's Q/E and the spells, one row over the bottom-left of the map:
// [Q] [E] | [R] [T] [Y]. The sidebar is full, and a strip along the board's
// bottom edge hides less of it than the two stacked rows it replaced.
const HUD_X = 22;          // centre of Q
const HUD_Y = 450;         // centre of the row
const HUD_SIZE = 30;
const HUD_GAP = 36;
const SPELL_SIZE = HUD_SIZE;
// The rule between Vesper's buttons and the spells, and the first spell.
const HUD_SEP_X = HUD_X + HUD_GAP + HUD_SIZE / 2 + 10;
const SPELL_X = HUD_SEP_X + 10 + HUD_SIZE / 2;
// The backing panel: room for the health bar over the row and the spell
// prices under it.
const HUD_LEFT = 3;
const HUD_RIGHT = SPELL_X + HUD_GAP * 2 + HUD_SIZE / 2 + 6;
const HUD_TOP = HUD_Y - HUD_SIZE / 2 - 13;
const HUD_BOTTOM = 477;

// Cards (UIScene._showCard): the width every card and tooltip shares unless
// it asks for another, and the number formats their stats use.
const CARD_W = 256;
const fmtInt = (n) => `${Math.round(n)}`;
const fmtRate = (n) => `${n.toFixed(2)}/s`;
const fmtDps = (n) => (n >= 100 ? `${Math.round(n)}` : n.toFixed(1));
const fmtPct = (n) => `${Math.round(n * 100)}%`;
const fmtBonus = (n) => `+${Math.round(n * 100)}%`;
const fmtSec = (ms) => `${+(ms / 1000).toFixed(1)}s`;
const fmtBig = (n) => (n >= 10000 ? `${+(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);
// Temple ranks on a tower's card, short enough to share one line.
const TRACK_TAG = { damage: 'DAÑO', fireRate: 'CAD', range: 'ALC' };
const hexColor = (n) => `#${n.toString(16).padStart(6, '0')}`;
// Capitals without accents: the font has none.
const plainUpper = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

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
        // The pinned card: a scene restart keeps the instance, not its objects.
        this.pinCard = null;
        this._pinned = null;
        this._pinHover = null;
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
        this._buildHudStrip();
        this._buildTutorialBanner();
        this._buildPauseOverlay();
        this._buildBossHpBar();
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
        this._refreshControls();
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
        this._refreshHeroHealth();
        this._refreshSpellHud();
        this._tickRest();
        this._tickHudStrip();
        this._tickPinCard();
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

        // Progress toward the cheapest temple upgrade within reach. It used to
        // be a bare bar with a line under it, and nothing on screen said what
        // it was filling up to — so now it is a titled row: what, how far, and
        // a click that takes you there.
        this.manaGoalTitle = this.add.text(LEFT, 113, 'MEJORA', {
            fontFamily: FONT, fontSize: '7px', color: '#6a6a8a',
        }).setOrigin(0, 0.5);
        this.manaGoalText = this.add.text(LEFT + 56, 113, '', {
            fontFamily: FONT, fontSize: '7px', color: '#B0BEC5',
        }).setOrigin(0, 0.5);
        this.manaGoalCount = this.add.text(RIGHT, 113, '', {
            fontFamily: FONT, fontSize: '7px', color: '#B388FF',
        }).setOrigin(1, 0.5);
        this.manaBarBg = this.add.rectangle(CX, 124, INNER_W, 6, 0x1a1a2e);
        this.manaBarBg.setStrokeStyle(1, 0x2a2a4a);
        this.manaBarFill = this.add.rectangle(LEFT, 124, 0, 4, 0xB388FF).setOrigin(0, 0.5);

        const goalHit = this.add.rectangle(CX, 118, INNER_W, 22, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        goalHit.on('pointerdown', () => {
            const goal = this.gs.templeSystem.cheapestUpgrade();
            if (!goal) return;
            audio.play('click');
            this._openUpgradePanel(goal.element);
        });
        goalHit.on('pointerover', () => this._showTooltip([
            'Proxima mejora de templo:',
            `junta ${MANA} hasta la mas barata`,
            'que tengas disponible.',
            'Click: abrir ese templo.',
        ], LEFT - 8, 104));
        goalHit.on('pointerout', () => this._hideTooltip());

        // Lives on the left behind a drawn heart, the wave on the right. One
        // line, two readouts: lives are the number that ends the game, so they
        // get an icon and their own colour instead of sharing a grey string.
        this.heartIcon = this.add.image(LEFT + 6, 140, 'icon_heart').setScale(1.2);
        this.livesText = this.add.text(LEFT + 16, 140, '', {
            fontFamily: FONT, fontSize: '8px', color: '#FF8A80',
        }).setOrigin(0, 0.5);
        this.statusText = this.add.text(RIGHT, 140, '', {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
        }).setOrigin(1, 0.5);
        this._lastLives = this.gs.economySystem.lives;
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
        this.livesText.setText(`${e.lives}`);
        this.livesText.setColor(e.lives <= 5 ? '#FF1744' : '#FF8A80');
        this.statusText.setText(`OLEADA ${w.currentWave}/${total}`);

        // A life lost is a beat, not just a smaller number: the heart jumps.
        if (e.lives < this._lastLives) {
            this.tweens.killTweensOf(this.heartIcon);
            this.heartIcon.setScale(2);
            this.tweens.add({ targets: this.heartIcon, scale: 1.2, duration: 260, ease: 'Back.easeOut' });
            this.livesText.setColor('#FFFFFF');
            this.time.delayedCall(140, () => this._updateStatus());
        }
        this._lastLives = e.lives;
    }

    _updateManaBar() {
        const mana = this.gs.economySystem.mana;
        const goal = this.gs.templeSystem.cheapestUpgrade();

        if (!goal) {
            this.manaBarFill.width = 0;
            this.manaGoalTitle.setText('MEJORA').setColor('#6a6a8a');
            this.manaGoalCount.setText('');
            // With no temple the hero still gathers maná — there is just
            // nowhere to spend it yet, which is the thing worth saying.
            this.manaGoalText
                .setText(this.gs.temples.length === 0 ? 'construi un templo' : 'todo al maximo')
                .setColor('#6a6a8a');
            return;
        }

        const pct = Phaser.Math.Clamp(mana / goal.cost, 0, 1);
        const ready = pct >= 1;
        this.manaBarFill.width = INNER_W * pct;
        this.manaBarFill.fillColor = ready ? 0x4CAF50 : 0xB388FF;

        const d = TEMPLE_DATA[goal.element];
        const t = UPGRADE_TRACKS[goal.track] ?? OVERCHARGE;
        // Named in the temple's own colour, so it points at a button below
        this.manaGoalTitle.setText(ready ? '¡LISTA!' : 'MEJORA').setColor(ready ? '#4CAF50' : '#6a6a8a');
        this.manaGoalText
            .setText(`${d.shortName} ${t.label}`)
            .setColor(`#${d.color.toString(16).padStart(6, '0')}`);
        this.manaGoalCount
            .setText(ready ? 'ABRIR ▶' : `${mana}/${goal.cost}`)
            .setColor(ready ? '#4CAF50' : '#B388FF');
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

        const { coin, cost } = this._costPair(x, y + 20, td.cost);

        const btn = { bg, icon, coin, cost, element, kind: 'tower' };

        bg.on('pointerdown', (pointer) => {
            if (this.gs.economySystem.gold < td.cost) { audio.play('deny'); return; }
            this._select(btn, () => this.gs.events.emit('select-element', element));
        });
        bg.on('pointerover', () => this._showCard(this._towerShopCard(element), x - 34, y, { ox: 1 }));
        bg.on('pointerout', () => this._hideTooltip());

        return btn;
    }

    /** Coin + number, centred as a pair on (x, y). Shared by every build button. */
    _costPair(x, y, value) {
        const coin = this.add.image(0, y, 'icon_coin').setScale(0.6);
        const cost = this.add.text(0, y, '', {
            fontFamily: FONT, fontSize: '8px', color: '#FFD700',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0, 0.5);
        const pair = { coin, cost, x };
        this._setCostPair(pair, value);
        return pair;
    }

    _setCostPair(pair, value) {
        const COIN_PX = 10;  // 17 * 0.6 ≈ 10px
        pair.cost.setText(`${value}`);
        const pairW = COIN_PX + 2 + pair.cost.width;
        const left = pair.x - pairW / 2;
        pair.coin.setX(left + COIN_PX / 2);
        pair.cost.setX(left + COIN_PX + 2);
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
        bg.on('pointerover', () => this._showCard(this._barricadeShopCard(), LEFT - 8, y, { ox: 1 }));
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

        // Priced on the button, like the towers. Every temple costs the same
        // (the next one), so the four prices move together.
        this.templeBtns = [];
        TEMPLE_ELEMENTS.forEach((el, i) => {
            this.templeBtns.push(this._createTempleBtn(el, this._slotX(i), 336));
        });

        this._divider(384);
    }

    _createTempleBtn(element, x, y) {
        const bg = this.add.image(x, y, 'btn_build').setInteractive({ useHandCursor: true });
        const icon = this.add.sprite(
            x, y - 8, safeTexture(this, `temple_${element}`, 'temple_earth')
        ).setScale(1.2);

        const { coin, cost } = this._costPair(x, y + 20, this.gs.templeSystem.nextCost);

        // A gem in the corner, lit only once you own that temple: shows at a
        // glance which upgrade trees are actually open to you.
        const owned = this.add.rectangle(x + 20, y - 23, 6, 6, TEMPLE_DATA[element].color)
            .setStrokeStyle(1, 0x0a0a18)
            .setAngle(45)
            .setVisible(false);

        const btn = { bg, icon, coin, cost, owned, element, kind: 'temple', x };

        bg.on('pointerdown', () => {
            if (this.gs.economySystem.gold < this.gs.templeSystem.nextCost) {
                audio.play('deny');
                return;
            }
            this._select(btn, () => this.gs.events.emit('select-temple', element));
        });

        bg.on('pointerover', () => this._showCard(this._templeShopCard(element), x - 34, y, { ox: 1 }));
        bg.on('pointerout', () => this._hideTooltip());

        return btn;
    }

    _refreshTempleButtons() {
        const ts = this.gs.templeSystem;
        for (const btn of this.templeBtns) {
            this._setCostPair(btn, ts.nextCost);
            btn.owned.setVisible(ts.hasTemple(btn.element));
        }
    }

    _refreshCancelButton() {
        // No-op for PC
    }

    /** Shared select/deselect behaviour for every build button. */
    _select(btn, onSelect) {
        audio.play('click');
        if (this.selectedBtn) this._setBtnSelected(this.selectedBtn, false);

        if (this.selectedBtn === btn) {
            this.selectedBtn = null;
            this.gs._cancelPlacement();
            this._refreshCancelButton();
            return;
        }

        this.selectedBtn = btn;
        this._setBtnSelected(btn, true);
        onSelect();
        this._refreshCancelButton();
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
    /**
     * Speed, pause and help, styled like BARRICADA / VENDER rather
     * than as flat grey blocks. A toggle that is on shows it in its border and
     * its text, the same way an armed build button does.
     *
     * Sound used to live here too; it moved to the gear menu with the rest of
     * the settings — it is not something you change mid-wave.
     */
    _buildGlobalControls() {
        const mk = (x, w, label, accent, onClick, tip) => {
            const bg = this.add.rectangle(x + w / 2, ROW_CONTROLS, w, 24, 0x1e1e3a)
                .setStrokeStyle(2, 0x3a3a5a)
                .setInteractive({ useHandCursor: true });
            const txt = this.add.text(x + w / 2, ROW_CONTROLS, label, {
                fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
            }).setOrigin(0.5);
            const btn = { bg, txt, accent, on: false };
            bg.on('pointerdown', () => { audio.play('click'); onClick(btn); });
            bg.on('pointerover', () => {
                bg.fillColor = 0x2a2a5a;
                if (tip) this._showTooltip(tip, x + w, ROW_CONTROLS - 50);
            });
            bg.on('pointerout', () => { bg.fillColor = 0x1e1e3a; this._hideTooltip(); });
            return btn;
        };

        // No auto-wave toggle: after every wave a rest runs down and the next
        // one starts on its own (WaveManager), so there is nothing to switch.
        this.velBtn = mk(LEFT, 82, 'VEL 1x', 0xFF9800, () => {
            this.gs.time.timeScale = this.gs.time.timeScale === 1 ? 2 : 1;
            this._refreshControls();
        }, ['Velocidad', 'x1 o x2.']);

        this.pauseBtn = mk(LEFT + 87, 82, 'PAUSA', 0xFFD54F, () => {
            if (!this.gs.uiModalOpen) this.togglePause();
        }, ['Pausa  [ESPACIO]']);

        this.helpBtn = mk(LEFT + 174, 82, 'AYUDA', 0xFFD54F, () => this._openHelpPanel(),
            ['Ayuda', 'Fusiones, elementos,', 'heroe y hechizos.']);

        this._refreshControls();
    }

    /** Toggle state → label, border and text colour. */
    _refreshControls() {
        if (!this.velBtn) return;
        const paint = (btn, on, label) => {
            btn.txt.setText(label);
            btn.bg.setStrokeStyle(2, on ? btn.accent : 0x3a3a5a);
            btn.txt.setColor(on ? `#${btn.accent.toString(16).padStart(6, '0')}` : '#ECEFF1');
        };
        const fast = this.gs.time.timeScale > 1.5;
        paint(this.velBtn, fast, fast ? 'VEL 2x' : 'VEL 1x');
        paint(this.pauseBtn, this.isPaused, this.isPaused ? 'SEGUIR' : 'PAUSA');
    }

    _buildTopRightGear() {
        const x = 898;
        const y = 18;
        const bg = this.add.rectangle(x, y, 26, 24, 0x181830, 0.65)
            .setStrokeStyle(1, 0x3a3a5a, 0.75)
            .setDepth(60)
            .setInteractive({ useHandCursor: true });

        const icon = this.add.image(x, y, 'icon_gear')
            .setDisplaySize(16, 16)
            .setDepth(61)
            .setAlpha(0.85);

        bg.on('pointerdown', (p) => {
            p.event?.stopPropagation();
            audio.play('click');
            this._openOptionsModal();
        });
        bg.on('pointerover', () => {
            bg.setFillStyle(0x2a2a50, 0.95);
            bg.setStrokeStyle(1, 0xFFD54F, 1);
            icon.setTint(0xFFD54F).setAlpha(1);
        });
        bg.on('pointerout', () => {
            bg.setFillStyle(0x181830, 0.65);
            bg.setStrokeStyle(1, 0x3a3a5a, 0.75);
            icon.clearTint().setAlpha(0.85);
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
                // Restart the map being played, not the default one
                const levelData = this.gs.levelData;
                SaveSystem.clearSave();
                this.scene.stop('UIScene');
                this.scene.stop('GameScene');
                this.scene.start('GameScene', { continueGame: false, levelData });
            },
        });
    }

    // ─── Next-wave preview ──────────────────────────────
    /**
     * What is coming, told in two places.
     *
     * On the map, Kingdom Rush style: a skull at the gate they will come
     * through, gold when a boss leads them. Hover it for the full card — every
     * enemy by name, count, element and weakness — and click it to call the
     * wave. It used to be a row of icons in the sidebar, which was fine at
     * wave 1 and unreadable by wave 30: five groups in 256px overlapped into
     * "x3x1x1x7x1".
     *
     * In the sidebar, one row (US 2.2): each kind of enemy as a small sprite
     * with its count, a kind split over several groups counted once. Up to
     * four fit; past that the last cell is a "+N". Hover an icon for that
     * enemy's card, the label or the "+N" for the whole wave.
     */
    _buildWavePreview() {
        this.previewLabel = this.add.text(LEFT, ROW_PREVIEW, '', {
            fontFamily: FONT, fontSize: '8px', color: '#78909C',
        }).setOrigin(0, 0.5);
        const labelHit = this.add.zone(LEFT + 28, ROW_PREVIEW, 58, 20).setInteractive();
        labelHit.on('pointerover', () => this._showWaveCard(LEFT - 8, ROW_PREVIEW + 10, 1, 1, false));
        labelHit.on('pointerout', () => this._hideWaveCard());
        this.previewCells = [];

        this._buildWaveMarker();
    }

    /** One preview cell: the enemy's sprite (framed in gold for a boss) and its count. */
    _buildPreviewCell(type, count, x) {
        const d = ENEMY_DATA[type];
        const objs = [];
        if (d?.isBoss) {
            objs.push(this.add.rectangle(x + 8, ROW_PREVIEW, 19, 19, 0x000000, 0).setStrokeStyle(1, 0xFFD54F));
        }
        const icon = this.add.sprite(x + 8, ROW_PREVIEW, safeTexture(this, `enemy_${type}`, 'enemy_slime'));
        icon.setScale(16 / Math.max(icon.width, icon.height));
        const anim = `enemy_${type}_pulse`;
        if (this.anims.exists(anim)) icon.play(anim);
        objs.push(icon, this.add.text(x + 19, ROW_PREVIEW, `x${count}`, {
            fontFamily: FONT, fontSize: '8px', color: d?.isBoss ? '#FFD54F' : '#ECEFF1',
        }).setOrigin(0, 0.5));

        const hit = this.add.zone(x + PREVIEW_CELL / 2 - 2, ROW_PREVIEW, PREVIEW_CELL - 2, 22).setInteractive();
        hit.on('pointerover', () => {
            this._hideWaveCard();
            this._previewTip = this._showCard(this._enemyCard(type, count), LEFT - 8, ROW_PREVIEW + 10, { ox: 1, oy: 1 });
        });
        hit.on('pointerout', () => this._hideTooltip());
        objs.push(hit);
        return objs;
    }

    /** The skull at the gate. Lives in this scene: it is UI, drawn over the map. */
    _buildWaveMarker() {
        const sp = this.gs.gridSystem.spawnPoint;
        const { cols, rows } = this.gs.gridSystem;
        const gateWorld = this.gs.gridSystem.gridToWorld(
            Phaser.Math.Clamp(sp.col, 0, cols - 1), Phaser.Math.Clamp(sp.row, 0, rows - 1),
        );
        // Where the board camera draws the gate: the same point on a standard
        // board, smaller and shifted on a zoomed-out one (US 14.6).
        const gate = worldToView(this.gs, gateWorld.x, gateWorld.y);
        const k = this.gs.boardZoom ?? 1;
        // Straight over the gate's centre, so the arrow points at the arch,
        // 36px above the gate's centre: room for the arrow to stand off the
        // medallion and still stop short of the arch. Always above, because
        // the arrow is part of the sprite and points down; a gate on the top
        // row just gets the marker pressed against the board's edge.
        // The medallion stays UI-sized; only the gate shrinks, so the gap to
        // its arch shrinks with it (36px at full size).
        const y = Math.max(Math.round(gate.y - 21 - 15 * k), 14);
        const x = Math.round(Phaser.Math.Clamp(gate.x, 16, 624));

        const c = this.add.container(x, y).setDepth(40);
        // The medallion is a sprite (BootScene._generateWaveMarker), its origin
        // on the disc's centre; the pulse is drawn around that same point. Drawn,
        // not scaled: a scaled shape inside a container rendered off-centre.
        const ring = this.add.graphics();
        const glow = this.add.graphics();
        const badge = this.add.image(0, 0, 'marker_wave').setOrigin(0.5, 13 / 34);
        const hit = this.add.zone(0, 0, 26, 26).setInteractive({ useHandCursor: true });
        c.add([ring, glow, badge, hit]);

        this.waveMarker = { c, ring, glow, badge, hit, color: 0xE53950, boss: false };

        const pulse = { t: 0 };
        this.tweens.add({
            targets: pulse, t: 1, duration: 1300, repeat: -1, ease: 'Quad.easeOut',
            onUpdate: () => {
                ring.clear();
                ring.lineStyle(1, this.waveMarker.color, 0.7 * (1 - pulse.t));
                ring.strokeCircle(0, 0, 14 + 8 * pulse.t);
            },
        });

        // Hover: a thin halo in the eyes' colour rather than a size change
        hit.on('pointerover', () => {
            glow.clear();
            glow.lineStyle(1, this.waveMarker.color, 0.9);
            glow.strokeCircle(0, 0, 13.5);
            this._showWaveCard(x + 18, y - 8, 0, 0, true);
        });
        hit.on('pointerout', () => {
            glow.clear();
            this._hideWaveCard();
        });
        hit.on('pointerdown', (pointer) => {
            pointer.event.stopPropagation();
            pointer.event._uiConsumed = true;
            if (!this.gs.waveManager.canCall) return;
            this._hideWaveCard();
            this.gs.events.emit('start-wave');
        });

    }

    _refreshWavePreview() {
        const wm = this.gs.waveManager;
        const comp = wm.nextComposition;
        this._hideWaveCard();
        this._refreshWaveButton();
        // The cells are rebuilt, so a card hanging off one goes with them.
        if (this.tooltip && this.tooltip === this._previewTip) this._hideTooltip();
        for (const o of this.previewCells) o.destroy();
        this.previewCells = [];

        if (!comp) {
            this.previewLabel.setText('ULTIMA OLEADA').setColor('#FFD54F');
            if (this.waveMarker) this.waveMarker.c.setVisible(false);
            return;
        }

        const isBoss = wm.isNextWaveBoss || comp.some(g => ENEMY_DATA[g.type]?.isBoss);
        this.previewLabel.setText(wm.waveActive ? 'LUEGO' : 'PROXIMA').setColor('#78909C');

        const kinds = [];
        for (const g of comp) {
            const k = kinds.find(e => e.type === g.type);
            if (k) k.count += g.count;
            else kinds.push({ type: g.type, count: g.count });
        }
        const x0 = LEFT + 62;
        const shown = kinds.length > PREVIEW_MAX ? kinds.slice(0, PREVIEW_MAX - 1) : kinds;
        shown.forEach((k, i) => {
            this.previewCells.push(...this._buildPreviewCell(k.type, k.count, x0 + i * PREVIEW_CELL));
        });
        if (kinds.length > PREVIEW_MAX) {
            const x = x0 + (PREVIEW_MAX - 1) * PREVIEW_CELL;
            const more = this.add.text(x + 4, ROW_PREVIEW, `+${kinds.length - shown.length}`, {
                fontFamily: FONT, fontSize: '8px', color: '#78909C',
            }).setOrigin(0, 0.5);
            const hit = this.add.zone(x + PREVIEW_CELL / 2, ROW_PREVIEW, PREVIEW_CELL, 22).setInteractive();
            hit.on('pointerover', () => this._showWaveCard(LEFT - 8, ROW_PREVIEW + 10, 1, 1, false));
            hit.on('pointerout', () => this._hideWaveCard());
            this.previewCells.push(more, hit);
        }

        // Only between waves: during one, the gate is already busy saying it
        if (this.waveMarker) {
            const m = this.waveMarker;
            m.c.setVisible(!wm.waveActive);
            // The pulse takes the colour of the eyes: ember, or gold for a boss
            m.color = isBoss ? 0xFFD54F : 0xE53950;
            m.badge.setTexture(isBoss ? 'marker_wave_boss' : 'marker_wave');
        }
    }

    /**
     * The card listing the next wave: one row per enemy group. `ox`/`oy` are
     * the card's origin (0 = grows right/down from x,y; 1 = left/up).
     */
    _showWaveCard(x, y, ox, oy, fromMarker) {
        this._hideWaveCard();
        this._hideTooltip();
        const wm = this.gs.waveManager;
        const comp = wm.nextComposition;
        if (!comp) return;

        // Wide enough for the longest weakness line ("Aire  debil: Tierra, Tormenta")
        const W = 252;
        const ROW = 26;
        const isBoss = wm.isNextWaveBoss || comp.some(g => ENEMY_DATA[g.type]?.isBoss);
        const H = 44 + comp.length * ROW + (fromMarker ? 16 : 4);
        const left = Phaser.Math.Clamp(x - W * ox, 4, 636 - W);
        const top = Phaser.Math.Clamp(y - H * oy, 4, 476 - H);

        const c = this.add.container(left, top).setDepth(95);
        c.add(this.add.rectangle(0, 0, W, H, 0x0a0a1a, 0.96).setOrigin(0)
            .setStrokeStyle(1, isBoss ? 0xFFD54F : 0x3a3a5a));

        c.add(this.add.text(10, 12, `OLEADA ${wm.nextWaveNumber}`, {
            fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
        }).setOrigin(0, 0.5));
        if (isBoss) {
            c.add(this.add.text(W - 10, 12, '¡JEFE!', {
                fontFamily: FONT, fontSize: '8px', color: '#FFD54F',
            }).setOrigin(1, 0.5));
        }
        c.add(this.add.rectangle(10, 22, W - 20, 1, 0x2a2a4a).setOrigin(0, 0.5));
        // Gold only comes at the end of a wave now, so the card says how much.
        c.add(this.add.text(10, 32, `Paga al terminar: +${wm.nextReward} ORO`, {
            fontFamily: FONT, fontSize: '7px', color: '#FFD54F',
        }).setOrigin(0, 0.5));

        const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
        comp.forEach((g, i) => {
            const d = ENEMY_DATA[g.type];
            if (!d) return;
            const ry = 44 + i * ROW + ROW / 2;

            const icon = this.add.sprite(18, ry, safeTexture(this, `enemy_${g.type}`, 'enemy_slime'));
            icon.setScale(18 / Math.max(icon.width, icon.height));
            const anim = `enemy_${g.type}_pulse`;
            if (this.anims.exists(anim)) icon.play(anim);
            c.add(icon);

            c.add(this.add.text(34, ry - 5, d.name, {
                fontFamily: FONT, fontSize: '8px', color: hex(d.color),
            }).setOrigin(0, 0.5));
            c.add(this.add.text(W - 10, ry - 5, `x${g.count}`, {
                fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
            }).setOrigin(1, 0.5));

            const weak = d.weakness?.length ? `  debil: ${d.weakness.map(elementName).join(', ')}` : '';
            c.add(this.add.text(34, ry + 6, `${elementName(d.element)}${weak}`, {
                fontFamily: FONT, fontSize: '7px', color: '#78909C',
            }).setOrigin(0, 0.5));
        });

        if (fromMarker) {
            c.add(this.add.text(W / 2, H - 9, wm.canCall ? 'Click: iniciar oleada' : '', {
                fontFamily: FONT, fontSize: '7px', color: '#4CAF50',
            }).setOrigin(0.5));
        }

        this.waveCard = c;
    }

    _hideWaveCard() {
        if (this.waveCard) { this.waveCard.destroy(true); this.waveCard = null; }
    }

    // ─── Cards ──────────────────────────────────────────
    /**
     * Every card and tooltip in the game, drawn one way: a stripe in the
     * thing's colour and its name, then — each part optional — the price in
     * large type beside its coin or maná, a before → after table, a list of
     * plain stats, and body copy. Price first because it is the question asked
     * first; the table's last column is the change, green when it rises and
     * red when it falls, so a comparison reads without doing arithmetic.
     *
     * (x, y) is where the card's (ox, oy) point goes; it is then kept on
     * screen whatever that asks. Takes the tooltip slot, so anything that
     * hides tooltips hides it.
     */
    _showCard(card, x, y, { ox = 0, oy = 0.5 } = {}) {
        this._hideTooltip();
        const c = this._buildCard(card);
        c.setPosition(
            Phaser.Math.Clamp(Math.round(x - c.cardW * ox), 4, 916 - c.cardW),
            Phaser.Math.Clamp(Math.round(y - c.cardH * oy), 4, 476 - c.cardH),
        );
        this.tooltip = c;
        return c;
    }

    /**
     * Draws a card at (0, 0) and leaves placing it to the caller; the
     * container carries its size as cardW / cardH. Beyond what a tooltip
     * uses, the pinned card adds `buttons` along the bottom (their rects in
     * btnRects) and `solid`, a box that swallows clicks.
     */
    _buildCard(card) {
        const W = card.width ?? CARD_W;
        const P = 10;
        const c = this.add.container(0, 0).setDepth(100);
        // Plain text, or IconText when the line carries the maná glyph;
        // either wraps at `wrapW` pixels when given one.
        const txt = (tx, ty, s, size, color, originX = 0, wrapW = 0) => {
            const style = { fontFamily: FONT, fontSize: size, color, lineSpacing: wrapW ? 4 : 0 };
            let t;
            if (hasManaGlyph(s)) {
                t = new IconText(this, tx, ty, s, style, { wrap: wrapW ? Math.floor(wrapW / parseFloat(size)) : 0 });
            } else {
                t = this.add.text(tx, ty, s, style);
                if (wrapW) t.setWordWrapWidth(wrapW);
            }
            t.setOrigin(originX, 0);
            c.add(t);
            return t;
        };
        let cy = P;
        let pendingRule = false;
        const rule = () => {
            if (!pendingRule) return;
            c.add(this.add.rectangle(P, cy, W - P * 2, 1, 0x3a3a55).setOrigin(0, 0));
            cy += 7;
            pendingRule = false;
        };

        c.add(this.add.rectangle(0, 0, W, 3, card.color ?? 0x5a5a80).setOrigin(0, 0));
        if (card.title) {
            txt(P, cy, card.title, '8px', card.titleColor ?? '#FFFFFF');
            if (card.tag) txt(W - P, cy + 1, card.tag, '7px', card.tagColor ?? '#8a8aa0', 1);
            cy += 16;
            pendingRule = true;
        }

        const pr = card.price;
        if (pr) {
            let px = P;
            if (pr.label) px += txt(px, cy + 3, pr.label, '8px', '#8a8aa0').width + 6;
            if (pr.currency) {
                const icon = this.add.image(px, cy + 5, pr.currency === 'gold' ? 'icon_coin' : MANA_SPRITE.key)
                    .setOrigin(0, 0.5);
                icon.setScale(12 / icon.height);
                c.add(icon);
                px += icon.displayWidth + 4;
            }
            txt(px, cy, pr.text, '11px', pr.color);
            cy += 16;
            if (pr.sub) {
                txt(P, cy, pr.sub, '7px', pr.subColor ?? '#8a8aa0');
                cy += 12;
            }
            pendingRule = true;
        }

        if (card.rows?.length) {
            rule();
            // A row without `after` is a plain reading; a table of nothing
            // but those keeps its one column on the right edge. A `dim` row
            // shows its change in grey: there, but not the point yet.
            const compare = card.rows.some(r => r.after !== undefined);
            const COL_BEFORE = compare ? 132 : W - P, COL_ARROW = 142, COL_AFTER = 202, COL_DELTA = W - P;
            const DIM = '#4a4a62';
            const [headBefore, headAfter] = card.cols ?? ['ANTES', 'DESPUES'];
            if (headBefore) txt(COL_BEFORE, cy, headBefore, '7px', '#6a6a80', 1);
            if (compare && headAfter) txt(COL_AFTER, cy, headAfter, '7px', '#6a6a80', 1);
            cy += 13;
            for (const r of card.rows) {
                if (r.gap) {
                    c.add(this.add.rectangle(P, cy - 2, W - P * 2, 1, 0x22223a).setOrigin(0, 0));
                    cy += 4;
                }
                const plain = r.after === undefined;
                txt(P, cy, r.label, '8px', '#B0BEC5');
                txt(COL_BEFORE, cy, r.fmt(r.before), '8px', plain || r.dim ? '#ECEFF1' : '#8a8aa0', 1);
                if (!plain) {
                    const [delta, color] = this._delta(r.before, r.after);
                    txt(COL_ARROW, cy, '→', '8px', r.dim ? DIM : '#6a6a80');
                    txt(COL_AFTER, cy, r.fmt(r.after), '8px', r.dim ? DIM : delta === '=' ? '#FFFFFF' : color, 1);
                    txt(COL_DELTA, cy, delta, '8px', r.dim ? DIM : color, 1);
                }
                cy += 15;
            }
            pendingRule = true;
        }

        if (card.stats?.length) {
            rule();
            for (const s of card.stats) {
                const label = txt(P, cy, s.label, '8px', '#B0BEC5');
                // A long value drops a size rather than running into its label.
                const room = W - P * 2 - label.width - 8;
                const size = `${s.value}`.length * 8 > room ? '7px' : '8px';
                txt(W - P, cy + (size === '7px' ? 1 : 0), `${s.value}`, size, s.color ?? '#FFFFFF', 1);
                cy += 14;
            }
            pendingRule = true;
        }

        if (card.note) {
            cy += txt(P, cy, card.note, '7px', card.noteColor ?? '#6a6a80', 0, W - P * 2).height + 4;
        }

        const desc = [].concat(card.desc ?? []).filter(Boolean);
        if (desc.length) {
            rule();
            for (const line of desc) cy += txt(P, cy, line, '7px', '#B0BEC5', 0, W - P * 2).height + 5;
            cy -= 5;
        }

        if (card.hint) {
            cy += 6;
            txt(W / 2, cy, card.hint.text, '7px', card.hint.color, 0.5);
            cy += 9;
        }

        // Full-width buttons, the price at the right edge beside its coin.
        c.btnRects = [];
        if (card.buttons?.length) {
            cy += 8;
            const bw = W - P * 2, bh = 22;
            for (const b of card.buttons) {
                const box = this.add.rectangle(P, cy, bw, bh, b.fill, 1).setOrigin(0, 0)
                    .setStrokeStyle(1, b.stroke)
                    .setInteractive({ useHandCursor: !!b.onClick });
                box.on('pointerdown', (pointer) => {
                    if (pointer.button !== 0 && pointer.button !== undefined) return;
                    pointer.event.stopPropagation();
                    pointer.event._uiConsumed = true;
                    if (b.onClick) b.onClick();
                });
                c.add(box);
                txt(P + 8, cy + 7, b.text, '8px', b.color);
                if (b.price) {
                    const pt = txt(W - P - 8, cy + 7, b.price.text, '8px', b.price.color, 1);
                    const icon = this.add.image(pt.x - pt.width - 4, cy + bh / 2,
                        b.price.currency === 'gold' ? 'icon_coin' : MANA_SPRITE.key).setOrigin(1, 0.5);
                    icon.setScale(10 / icon.height);
                    c.add(icon);
                }
                if (b.id) c.btnRects.push({ id: b.id, x: P, y: cy, w: bw, h: bh });
                cy += bh + 4;
            }
            cy -= 4;
        }

        // The box goes in last, under everything, once the height is known.
        const H = cy + P;
        const bg = this.add.rectangle(0, 0, W, H, 0x0a0a1a, 0.95).setOrigin(0, 0);
        bg.setStrokeStyle(card.alarm ? 2 : 1, card.alarm ? 0xEF5350 : 0x3a3a55);
        if (card.solid) {
            // A press on the card is not a press on the board under it.
            bg.setInteractive();
            bg.on('pointerdown', (pointer) => {
                if (pointer.button !== 0 && pointer.button !== undefined) return;
                pointer.event.stopPropagation();
                pointer.event._uiConsumed = true;
            });
        }
        c.addAt(bg, 0);
        c.cardW = W;
        c.cardH = H;
        return c;
    }

    /** The change column: `+35%` green, `-12%` red, `=`, or `NUEVO` from nothing. */
    _delta(before, after) {
        if (before <= 0) return after > 0 ? ['NUEVO', '#81C784'] : ['=', '#8a8aa0'];
        const change = Math.round((after / before - 1) * 100);
        if (change > 0) return [`+${change}%`, '#81C784'];
        if (change < 0) return [`${change}%`, '#EF5350'];
        return ['=', '#8a8aa0'];
    }

    /** A price line: gold or red against what the player has, and how much is missing. */
    _price(cost, have, currency) {
        const ok = have >= cost;
        const unit = currency === 'gold' ? 'ORO' : 'MANA';
        return {
            label: 'COSTO', currency, text: `${cost}`,
            color: ok ? (currency === 'gold' ? '#FFD54F' : '#B388FF') : '#EF5350',
            sub: ok ? null : `Faltan ${cost - have} ${unit}`,
            subColor: '#EF5350',
        };
    }

    // ─── Fusion preview ─────────────────────────────────
    /**
     * What the pair under the badge would become, and what it costs.
     *
     * A fusion is irreversible and consumes two buildings you paid for, so the
     * card answers, in reading order and before the drop: how much gold leaves
     * the purse, then whether the one building beats the two, stat by stat.
     */
    _showFusionTooltip(info) {
        const { b1, b2, result, kind } = info;
        const card = kind === 'temple'
            ? this._templeFusionCard(b1, b2, result)
            : this._towerFusionCard(info);
        const p = worldToView(this.gs, info.x, info.y);
        // Opens away from the nearer edge, so a card over a tower at the far
        // left of the board is not half off it.
        const leftSide = p.x < 300;
        this._showCard(card, leftSide ? p.x + 16 : p.x - 16, p.y, { ox: leftSide ? 0 : 1 });
    }

    _towerFusionCard({ b1, b2, result, refund = 0, cost = 0, affordable = true }) {
        const d = TOWER_DATA[result];
        const ts = this.gs.templeSystem;
        // The new tower starts at level 1 on the target's tile, under its own
        // element's temple ranks and whatever seal that tile has.
        const seal = (stat) => this.gs.sealSystem?.multiplier(b2.col, b2.row, result, stat) ?? 1;
        const dmg = d.damage * ts.multiplier(result, 'damage') * seal('damage');
        const rng = d.range * ts.multiplier(result, 'range') * seal('range');
        const sps = 1000 / (d.fireRate * ts.multiplier(result, 'fireRate'));
        const dps = (t) => t.damage * t.shotsPerSecond;

        // What actually leaves the purse: the fee minus the refund of the
        // parents' gold levels, which do not survive the merge.
        const net = cost - refund;
        let price;
        if (!affordable) {
            price = {
                label: 'COSTO', currency: 'gold', text: `${net}`, color: '#EF5350',
                sub: `Faltan ${net - this.gs.economySystem.gold} ORO`, subColor: '#EF5350',
            };
        } else if (net > 0) {
            price = { label: 'COSTO', currency: 'gold', text: `${net}`, color: '#FFD54F' };
        } else if (net < 0) {
            price = { label: 'RECIBIS', currency: 'gold', text: `+${-net}`, color: '#81C784' };
        } else {
            price = { text: 'SIN COSTO', color: '#81C784' };
        }
        if (refund > 0 && affordable) price.sub = `fusion ${cost} - reembolso ${refund}`;

        return {
            title: d.name,
            tag: d.tier === 3 ? 'LEGENDARIA' : 'HIBRIDA',
            tagColor: d.tier === 3 ? '#FFD54F' : undefined,
            color: d.color,
            price,
            alarm: !affordable,
            // Per-shot stats against the better parent; DPS against the two
            // together, since that is what the fusion trades away.
            rows: [
                { label: 'DAÑO', before: Math.max(b1.damage, b2.damage), after: dmg, fmt: fmtInt },
                { label: 'CADENCIA', before: Math.max(b1.shotsPerSecond, b2.shotsPerSecond), after: sps, fmt: fmtRate },
                { label: 'DPS', before: dps(b1) + dps(b2), after: dmg * sps, fmt: fmtDps },
                { label: 'ALCANCE', before: Math.max(b1.range, b2.range), after: rng, fmt: fmtInt },
            ],
            note: 'Antes: la mejor de las 2 (DPS: las 2 juntas)',
            desc: d.specialDesc,
        };
    }

    _templeFusionCard(b1, b2, result) {
        const d = TEMPLE_DATA[result];
        const a = TEMPLE_DATA[b1.element];
        const b = TEMPLE_DATA[b2.element];
        return {
            title: d.name,
            tag: 'TEMPLO HIBRIDO',
            color: d.color,
            price: { text: 'SIN COSTO', color: '#81C784' },
            rows: [
                { label: 'ALCANCE', before: Math.max(a.absorbRadius, b.absorbRadius), after: d.absorbRadius, fmt: fmtInt },
                { label: 'REFINA', before: Math.max(a.absorbBonus, b.absorbBonus), after: d.absorbBonus, fmt: fmtBonus },
            ],
            desc: `Abre mejoras de ${d.shortName}`,
        };
    }

    // ─── Pinned card (a clicked tower, temple or barricade) ─────
    /**
     * The card that stays open over the building you clicked, drawn like
     * every other card. Its purchases are buttons inside it, and what one
     * changes shows in the same table: the next level's column is always
     * there, dim, and lights up in colour while the pointer is on MEJORAR —
     * one box, no second card beside it.
     *
     * GameScene owns the selection and the purchases; it announces the pinned
     * building on 'pin-card' (also on every hit and kill it scores, hence the
     * throttle) and is told about a click on 'buy-upgrade' / 'buy-enchant'.
     */
    _onPinCard(s) {
        const changed = s !== this._pinned;
        this._pinned = s;
        if (changed) this._pinHover = null;
        this._pinDirty = true;
        if (changed || this.time.now - (this._pinAt ?? 0) >= 120) this._renderPinCard();
    }

    /**
     * Hover on the card's buttons is read off the pointer every frame rather
     * than from pointerover/out: a redraw replaces the buttons under a still
     * pointer, and the replacements would never hear that it left.
     */
    _tickPinCard() {
        const c = this.pinCard;
        let hover = null;
        if (c?.btnRects?.length) {
            const p = pointerWorld(this, this.input.activePointer);
            const r = c.btnRects.find(b => p.x >= c.x + b.x && p.x <= c.x + b.x + b.w
                && p.y >= c.y + b.y && p.y <= c.y + b.y + b.h);
            hover = r?.id ?? null;
        }
        if (hover !== (this._pinHover ?? null)) {
            this._pinHover = hover;
            this._renderPinCard();
        } else if (this._pinDirty && this.time.now - (this._pinAt ?? 0) >= 120) {
            this._renderPinCard();
        }
    }

    _renderPinCard() {
        this._pinDirty = false;
        this._pinAt = this.time.now;
        if (this.pinCard) { this.pinCard.destroy(true); this.pinCard = null; }
        const t = this._pinned;
        if (!t || !t.alive) return;
        const card = t.kind === 'barricade' ? this._pinBarricadeCard(t)
            : typeof t.getNextUpgradeCost === 'function' ? this._pinTowerCard(t)
            : this._pinTempleCard(t);
        // Over the hidden strip, under the boss bar, the tutorial and modals.
        const c = this._buildCard({ ...card, solid: true }).setDepth(55);
        const W = c.cardW, H = c.cardH;
        // Above the building, else below it, else beside it: never on it.
        const p = worldToView(this.gs, t.x, t.y);
        const half = 16 * this.gs.cameras.main.zoom / SUPER + 4;
        let x = p.x - W / 2, y;
        if (p.y - half - H >= 4) y = p.y - half - H;
        else if (p.y + half + H <= 476) y = p.y + half;
        else {
            x = p.x + half + W <= BAR_X - 4 ? p.x + half : p.x - half - W;
            y = Phaser.Math.Clamp(p.y - H / 2, 4, 476 - H);
        }
        c.setPosition(Math.round(Phaser.Math.Clamp(x, 4, BAR_X - 4 - W)), Math.round(y));
        this.pinCard = c;
    }

    _pinTowerCard(t) {
        const ts = this.gs.templeSystem;
        const gold = this.gs.economySystem.gold;
        const max = t.level >= TOWER_UPGRADE.MAX_LEVEL;
        const hot = !max && this._pinHover === 'upgrade';
        const sps = t.shotsPerSecond;
        // The next level: levels scale the base stat linearly; temples and
        // the seal multiply on top and stay put.
        let n = null;
        if (!max) {
            const step = (k) => (1 + t.level * k) / (1 + (t.level - 1) * k);
            n = { dmg: t.damage * step(TOWER_UPGRADE.DAMAGE_STEP), rng: t.range * step(TOWER_UPGRADE.RANGE_STEP) };
        }
        const row = (label, before, after, fmt) => ({ label, before, after: n ? after : undefined, fmt, dim: !hot });
        const cost = max ? 0 : t.getNextUpgradeCost();
        const ok = gold >= cost;

        const templeLvl = ts.totalLevels(t.element);
        const desc = [t.data.specialDesc];
        if (templeLvl > 0) {
            const over = ts.overchargeOf(t.element);
            desc.push(`Templo NV.${templeLvl}: ${TRACK_ORDER.map(tr => `${TRACK_TAG[tr]} ${ts.levelOf(t.element, tr)}`).join('  ')}`
                + (over > 0 ? `  SOB ${over}` : ''));
        }
        if (t.empowered) desc.push('Potenciada por el heroe');
        if (t.frozen) desc.push('Congelada: no dispara');
        const seal = this.gs.sealSystem?.bonusLabel(t.col, t.row, t.element);
        if (seal) desc.push(seal);

        return {
            title: t.data.name,
            // Just the level: "Tormenta de Ceniza" leaves no room for more.
            tag: `NV.${t.level}`,
            tagColor: '#FFD54F',
            color: t.data.color,
            alarm: hot && !ok,
            cols: ['ACTUAL', n ? `NV.${t.level + 1}` : null],
            rows: [
                row('DAÑO', t.damage, n?.dmg, fmtInt),
                row('CADENCIA', sps, sps, fmtRate),
                row('DPS', t.damage * sps, n && n.dmg * sps, fmtDps),
                row('ALCANCE', t.range, n?.rng, fmtInt),
                { label: 'BAJAS', before: t.enemiesKilled || 0, fmt: fmtInt, gap: true },
                { label: 'DAÑO TOTAL', before: t.totalDamageDealt || 0, fmt: fmtBig },
            ],
            desc,
            note: !max && !ok ? `Faltan ${cost - gold} ORO` : null,
            noteColor: '#EF5350',
            buttons: [max
                ? { text: 'NIVEL MAXIMO', color: '#4CAF50', fill: 0x14210f, stroke: 0x4CAF50 }
                : {
                    id: 'upgrade', text: 'MEJORAR [U]',
                    color: ok ? '#FFD700' : '#888899',
                    fill: ok ? (hot ? 0x2e2650 : 0x241d3d) : 0x16162a,
                    stroke: ok ? 0xFFD700 : 0x3a3a5a,
                    price: { currency: 'gold', text: `${cost}`, color: ok ? '#FFD54F' : '#EF5350' },
                    onClick: () => this.gs.events.emit('buy-upgrade'),
                }],
        };
    }

    _pinTempleCard(t) {
        const d = t.data;
        const lvl = this.gs.templeSystem.totalLevels(t.element);
        return {
            title: d.name,
            tag: lvl > 0 ? `NV.${lvl}` : 'TEMPLO',
            tagColor: '#FFD54F',
            color: d.color,
            stats: [
                { label: 'ALCANCE', value: fmtInt(t.absorbRadius) },
                { label: 'REFINA', value: fmtBonus(d.absorbBonus), color: '#B388FF' },
                { label: 'ABSORBIDO', value: `${Math.round(t.absorbed || 0)} MANA`, color: '#B388FF' },
            ],
            desc: lvl > 0 ? 'Click para ver el arbol de mejoras' : 'Click para abrir las mejoras',
        };
    }

    _pinBarricadeCard(t) {
        const spikes = BARRICADE_ENCHANTS[ENCHANT.SPIKES];
        const frost = BARRICADE_ENCHANTS[ENCHANT.FROST];
        const spikeDps = spikes.damage * 1000 / spikes.tickMs;
        const type = this.gs.barricadeSystem.typeAt(t.col, t.row);
        if (type) {
            const e = BARRICADE_ENCHANTS[type];
            return {
                title: `Barricada de ${e.name}`,
                tag: 'ENCANTADA',
                color: e.color,
                stats: [type === ENCHANT.SPIKES
                    ? { label: 'DAÑO/S', value: fmtInt(spikeDps) }
                    : { label: 'LENTITUD', value: fmtPct(frost.slow) }],
                desc: [`${e.desc}: todo enemigo en las 8 casillas de alrededor.`, 'Bloquea el paso.'],
            };
        }

        const eco = this.gs.economySystem;
        const hover = this._pinHover;
        const btn = (key) => {
            const e = BARRICADE_ENCHANTS[key];
            const have = e.currency === 'gold' ? eco.gold : eco.mana;
            const ok = have >= e.cost;
            return {
                id: key, text: `ENCANTAR: ${plainUpper(e.name)}`,
                color: ok ? hexColor(e.color) : '#888899',
                fill: ok ? (hover === key ? 0x2e2650 : 0x241d3d) : 0x16162a,
                stroke: ok ? e.color : 0x3a3a5a,
                price: {
                    currency: e.currency, text: `${e.cost}`,
                    color: ok ? (e.currency === 'gold' ? '#FFD54F' : '#B388FF') : '#EF5350',
                },
                onClick: () => this.gs.events.emit('buy-enchant', key),
            };
        };
        const hoverShort = hover && (() => {
            const e = BARRICADE_ENCHANTS[hover];
            const have = e.currency === 'gold' ? eco.gold : eco.mana;
            return have < e.cost;
        })();
        return {
            title: 'Barricada',
            tag: 'SIN ENCANTAR',
            color: 0x8D6E63,
            alarm: !!hoverShort,
            cols: ['AHORA', 'ENCANTADA'],
            rows: [
                { label: 'DAÑO/S', before: 0, after: spikeDps, fmt: fmtInt, dim: hover !== ENCHANT.SPIKES },
                { label: 'LENTITUD', before: 0, after: frost.slow, fmt: fmtPct, dim: hover !== ENCHANT.FROST },
            ],
            desc: 'Bloquea el paso. El encanto alcanza las 8 casillas de alrededor; uno por barricada, para siempre.',
            buttons: [btn(ENCHANT.SPIKES), btn(ENCHANT.FROST)],
        };
    }

    // ─── Shop and HUD cards ─────────────────────────────
    _towerShopCard(element) {
        const td = TOWER_DATA[element];
        const ts = this.gs.templeSystem;
        const dmg = td.damage * ts.multiplier(element, 'damage');
        const sps = 1000 / (td.fireRate * ts.multiplier(element, 'fireRate'));
        const levels = ts.totalLevels(element);
        return {
            title: td.name,
            tag: 'TORRE',
            color: td.color,
            price: this._price(td.cost, this.gs.economySystem.gold, 'gold'),
            stats: [
                { label: 'DAÑO', value: fmtInt(dmg) },
                { label: 'CADENCIA', value: fmtRate(sps) },
                { label: 'DPS', value: fmtDps(dmg * sps) },
                { label: 'ALCANCE', value: fmtInt(td.range * ts.multiplier(element, 'range')) },
            ],
            desc: [td.specialDesc, levels > 0 ? `Mejorada por templo (${levels} niveles)` : null],
        };
    }

    _templeShopCard(element) {
        const d = TEMPLE_DATA[element];
        const ts = this.gs.templeSystem;
        return {
            title: d.name,
            tag: 'TEMPLO',
            color: d.color,
            price: this._price(ts.nextCost, this.gs.economySystem.gold, 'gold'),
            stats: [
                { label: 'ALCANCE', value: fmtInt(d.absorbRadius) },
                { label: 'REFINA', value: `${fmtBonus(d.absorbBonus)} de mana` },
            ],
            desc: [
                ts.hasTemple(element)
                    ? `Mejoras de ${d.shortName}: ${ts.totalLevels(element)} niveles`
                    : `Abre las mejoras de ${d.shortName}.`,
                'Cada templo nuevo cuesta mas.',
            ],
        };
    }

    _barricadeShopCard() {
        const spikes = BARRICADE_ENCHANTS[ENCHANT.SPIKES];
        const frost = BARRICADE_ENCHANTS[ENCHANT.FROST];
        return {
            title: 'Barricada',
            color: 0x8D6E63,
            price: this._price(BARRICADE_COST, this.gs.economySystem.gold, 'gold'),
            desc: [
                'Desvia a los enemigos sin cerrar del todo el camino.',
                `Despues se encanta: ${spikes.name} (${enchantCostLabel(ENCHANT.SPIKES)}) o ${frost.name} (${enchantCostLabel(ENCHANT.FROST)}).`,
            ],
        };
    }

    _abilityCard(key) {
        const a = HERO_ABILITIES[key];
        const stats = [{ label: 'RECARGA', value: fmtSec(a.cooldown) }];
        if (a.range) stats.push({ label: 'ALCANCE', value: fmtInt(a.range) });
        if (a.damage) stats.push({ label: 'DAÑO', value: fmtInt(a.damage) });
        if (a.radius) stats.push({ label: 'RADIO', value: fmtInt(a.radius) });
        if (a.slow) stats.push({ label: 'LENTITUD', value: `${fmtPct(a.slow)} · ${fmtSec(a.slowDuration)}` });
        return {
            title: `${HERO_LORE.name}: ${a.label}`,
            tag: `[${a.hotkey}]`,
            tagColor: '#ECEFF1',
            color: a.color,
            stats,
            desc: a.desc.join(' '),
        };
    }

    _spellCard(key) {
        const s = SPELLS[key];
        const stats = [{ label: 'RECARGA', value: fmtSec(s.cooldown) }];
        if (key === 'luna') {
            stats.push(
                { label: 'DAÑO', value: fmtInt(s.damage) },
                { label: 'RADIO', value: fmtInt(s.radius) },
                { label: 'LENTITUD', value: `${fmtPct(s.slow)} · ${fmtSec(s.slowDuration)}` },
                { label: 'TARDA', value: fmtSec(s.channelMs + s.fallMs) },
            );
        } else if (key === 'centinelas') {
            stats.push(
                { label: 'SOLDADOS', value: `${s.count} · ${fmtSec(s.lifeMs)}` },
                { label: 'VIDA', value: `${s.hp} c/u` },
                { label: 'DAÑO', value: `${s.damage} c/${(s.attackMs / 1000).toFixed(1)}s` },
                { label: 'ESTALLIDO', value: `${s.burstDamage} · radio ${s.burstRadius}` },
            );
        } else if (key === 'egida') {
            stats.push(
                { label: 'CURA', value: fmtPct(s.heal) },
                { label: 'CADENCIA', value: `+${fmtPct(s.haste)} · ${fmtSec(s.hasteMs)}` },
                { label: 'RADIO', value: fmtInt(s.radius) },
            );
        }
        return {
            title: s.label,
            tag: `[${s.hotkey}]`,
            tagColor: '#ECEFF1',
            color: s.color,
            price: this._price(s.cost, this.gs.economySystem.mana, 'mana'),
            stats,
            desc: s.desc.join(' '),
        };
    }

    /** One enemy of the next wave, with the health it will actually have. */
    _enemyCard(type, count) {
        const d = ENEMY_DATA[type];
        const wm = this.gs.waveManager;
        const mult = wm.enemyHpMultiplier(type, wm.nextWaveNumber);
        const list = (els) => (els?.length ? els.map(elementName).join(', ') : '-');
        const pace = d.speed < 40 ? 'lento' : d.speed < 75 ? 'normal' : 'rapido';
        const stats = [
            { label: 'VIDA', value: mult > 1.001 ? `${Math.round(d.hp * mult)} (x${mult.toFixed(2)})` : `${d.hp}` },
            { label: 'VELOCIDAD', value: `${d.speed} ${pace}` },
            { label: 'DEBIL A', value: list(d.weakness), color: d.weakness?.length ? '#81C784' : '#8a8aa0' },
            { label: 'RESISTE', value: list(d.resistance), color: d.resistance?.length ? '#EF5350' : '#8a8aa0' },
            { label: 'CANTIDAD', value: `x${count}` },
        ];
        const desc = [];
        if (d.spawns?.length) {
            desc.push(`Al morir suelta ${d.spawns.map(s => `${s.count} ${ENEMY_DATA[s.type]?.name ?? s.type}`).join(', ')}.`);
        }
        // The one thing about an enemy you cannot read off its stats: that it
        // is going to leave the road. Worth saying before the wave.
        if (d.agro?.target === 'hero') desc.push('Deja el camino por el heroe; lo suelta si entra a un templo.');
        if (d.agro?.target === 'temple') desc.push('Deja el camino por los templos.');
        return {
            title: d.name,
            titleColor: hexColor(d.color),
            tag: d.isBoss ? 'JEFE' : plainUpper(elementName(d.element)),
            tagColor: d.isBoss ? '#FFD54F' : undefined,
            color: d.isBoss ? 0xFFD54F : d.color,
            alarm: false,
            stats,
            desc,
        };
    }

    // ─── Wave button ────────────────────────────────────
    _buildWaveButton() {
        this.waveBtnBg = this.add.rectangle(CX, ROW_WAVE_BTN, INNER_W, WAVE_BTN_H, 0x2E7D32);
        this.waveBtnBg.setStrokeStyle(2, 0x4CAF50);
        this.waveBtnBg.setInteractive({ useHandCursor: true });

        this.waveBtnText = this.add.text(CX, ROW_WAVE_BTN, '', {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
        }).setOrigin(0.5);
        // Either clock (the early-call window or the rest) drains as a bar
        // along the foot of the button; the bonus, when there is one, sits
        // under the label.
        this.waveRestBar = this.add.rectangle(LEFT + 2, ROW_WAVE_BTN + WAVE_BTN_H / 2 - 4, INNER_W - 4, 3, 0xA5D6A7)
            .setOrigin(0, 0.5).setVisible(false);
        this.waveBonusText = this.add.text(CX, ROW_WAVE_BTN + 6, '', {
            fontFamily: FONT, fontSize: '7px', color: '#FFD54F',
        }).setOrigin(0.5).setVisible(false);
        this._waveBtnKey = '';
        this._waveBtnHover = false;
        this._refreshWaveButton();

        this.waveBtnBg.on('pointerdown', () => {
            if (this.gs.waveManager.canCall) this.gs.events.emit('start-wave');
        });
        this.waveBtnBg.on('pointerover', () => { this._waveBtnHover = true; this._paintWaveButton(); });
        this.waveBtnBg.on('pointerout', () => { this._waveBtnHover = false; this._paintWaveButton(); });
    }

    /**
     *   idle   before the first wave, or after a load: start it.
     *   busy   a wave on the board that cannot be called over (still
     *          spawning, or its window has closed).
     *   early  its last enemy is out: call the next one over it, for a bonus.
     *   rest   the board is clear: the next one comes on its own.
     */
    _waveButtonState() {
        const wm = this.gs.waveManager;
        if (wm.canCallEarly) return 'early';
        if (wm.waveActive) return 'busy';
        return wm.resting ? 'rest' : 'idle';
    }

    _paintWaveButton() {
        const st = this._waveButtonState();
        const hover = this._waveBtnHover;
        const [fill, hot, stroke, text] = {
            busy: [0x333344, 0x333344, 0x4CAF50, '#8a8aa0'],
            early: [0x5D4A10, 0x7A6216, 0xFFD54F, '#FFFFFF'],
            rest: [0x2E7D32, 0x388E3C, 0x4CAF50, '#FFFFFF'],
            idle: [0x2E7D32, 0x388E3C, 0x4CAF50, '#FFFFFF'],
        }[st];
        this.waveBtnBg.fillColor = hover ? hot : fill;
        this.waveBtnBg.setStrokeStyle(2, stroke);
        this.waveBtnText.setColor(text);
    }

    /** What the button does right now, and the clock it is on. */
    _refreshWaveButton() {
        if (!this.waveBtnText) return;
        const wm = this.gs.waveManager;
        const st = this._waveButtonState();
        const label = {
            busy: `OLEADA ${wm.currentWave} EN CURSO`,
            early: `ADELANTAR OLEADA ${wm.nextWaveNumber} ▶`,
            rest: `OLEADA ${wm.nextWaveNumber} EN ${wm.restSecondsLeft}s ▶`,
            idle: `INICIAR OLEADA ${wm.nextWaveNumber} ▶`,
        }[st];
        this.waveBtnText.setY(st === 'early' ? ROW_WAVE_BTN - 6 : ROW_WAVE_BTN).setText(label);
        this.waveBonusText.setVisible(st === 'early')
            .setText(st === 'early' ? `+${wm.earlyBonus} ORO  ·  ${wm.earlySecondsLeft}s` : '');
        this.waveRestBar.setVisible(st === 'early' || st === 'rest');
        this._waveBtnKey = this._waveBtnKeyNow();
        this._paintWaveButton();
    }

    _waveBtnKeyNow() {
        const wm = this.gs.waveManager;
        return `${this._waveButtonState()}:${wm.currentWave}:${wm.restSecondsLeft}:${wm.earlySecondsLeft}`;
    }

    /** The clocks: the bar every frame, the label when its numbers change. */
    _tickRest() {
        if (!this.waveRestBar) return;
        const wm = this.gs.waveManager;
        if (this._waveBtnKeyNow() !== this._waveBtnKey) this._refreshWaveButton();
        const st = this._waveButtonState();
        if (st === 'early') {
            this.waveRestBar.width = (INNER_W - 4) * Math.max(0, wm.earlyTimer / (wm.earlyTotal || 1));
            this.waveRestBar.fillColor = 0xFFD54F;
        } else if (st === 'rest') {
            this.waveRestBar.width = (INNER_W - 4) * Math.max(0, wm.restTimer / (wm.restTotal || 1));
            // The last three seconds in amber: the wave is about to come anyway.
            this.waveRestBar.fillColor = wm.restSecondsLeft <= 3 ? 0xFFB74D : 0xA5D6A7;
        }
    }

    // ─── Hero and spell strip ───────────────────────────
    /**
     * Vesper's Q/E and the three spells, one low row in the bottom-left corner
     * of the board: [Q] [E] | [R] [T] [Y]. Over the board rather than in the
     * sidebar because you fire these while watching the lane; one row instead
     * of two stacked ones so it covers a strip along the map's edge rather
     * than a block of it.
     *
     * Everything sits in one container so the strip can fade as a whole
     * (_tickHudStrip) without fighting the per-button alphas the refreshes set.
     */
    _buildHudStrip() {
        const c = this.add.container(0, 0).setDepth(50);
        this.hudStrip = c;
        this.hudHits = [];

        // One backing panel, in the sidebar's colours. Not interactive: only
        // the five buttons take clicks, so a tower built in the cells behind
        // the gaps can still be selected or dragged into a fusion.
        const panel = this.add.rectangle(
            (HUD_LEFT + HUD_RIGHT) / 2, (HUD_TOP + HUD_BOTTOM) / 2,
            HUD_RIGHT - HUD_LEFT, HUD_BOTTOM - HUD_TOP, 0x12122a, 0.84,
        ).setStrokeStyle(1, 0x2a2a4a);
        c.add(panel);

        // Vesper's health, thin, right over his two buttons, plus the wait
        // while he is gone. The bar over his head is easy to lose in a fight.
        const barX = HUD_X - HUD_SIZE / 2;
        const barW = HUD_GAP + HUD_SIZE;
        const barY = HUD_Y - HUD_SIZE / 2 - 6;
        this.heroHpBg = this.add.rectangle(barX, barY, barW, 4, 0x1a1a1a)
            .setOrigin(0, 0.5).setStrokeStyle(1, 0x333344);
        this.heroHpFill = this.add.rectangle(barX + 1, barY, barW - 2, 2, 0x4CAF50).setOrigin(0, 0.5);
        this.heroHpBarW = barW - 2;
        this.heroRespawnText = this.add.text(barX + barW / 2, barY, '', {
            fontFamily: FONT, fontSize: '7px', color: '#B0BEC5',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);
        c.add([this.heroHpBg, this.heroHpFill, this.heroRespawnText]);

        // The spells' name on the same line as the bar, and a rule between
        // what is Vesper's and what costs maná.
        c.add(this.add.text(SPELL_X - HUD_SIZE / 2, barY, 'HECHIZOS', {
            fontFamily: FONT, fontSize: '7px', color: '#CFDDE9',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0, 0.5));
        c.add(this.add.rectangle(HUD_SEP_X, HUD_Y + 5, 1, HUD_SIZE + 12, 0x3a3a5a));

        this.abilityBtns = ABILITY_ORDER.map((key, i) => this._buildAbilityBtn(key, HUD_X + i * HUD_GAP));
        this.spellBtns = SPELL_ORDER.map((key, i) => this._buildSpellBtn(key, SPELL_X + i * HUD_GAP));
    }

    /** A strip button's card, opening above the strip. */
    _showHudCard(card) {
        this._hudTip = this._showCard(card, HUD_LEFT, HUD_TOP - 4, { ox: 0, oy: 1 });
    }

    _buildAbilityBtn(key, x) {
        const a = HERO_ABILITIES[key];
        const bg = this.add.rectangle(x, HUD_Y, HUD_SIZE, HUD_SIZE, 0x12122a, 0.86)
            .setStrokeStyle(2, a.color)
            .setInteractive({ useHandCursor: true });
        // Cooldown wipe: anchored at the bottom so the dark curtain drains from top to bottom
        const wipe = this.add.rectangle(x, HUD_Y + (HUD_SIZE - 4) / 2, HUD_SIZE - 4, 0, 0x000000, 0.66)
            .setOrigin(0.5, 1);
        const glyph = this.add.text(x, HUD_Y - 3, a.glyph, {
            fontFamily: FONT, fontSize: '8px', color: a.colorHex,
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);
        const hot = this.add.text(x, HUD_Y + 10, a.hotkey, {
            fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);
        const timer = this.add.text(x, HUD_Y, '', {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);
        this.hudStrip.add([bg, wipe, glyph, hot, timer]);
        this.hudHits.push(bg);

        bg.on('pointerdown', (pointer) => {
            pointer.event.stopPropagation();
            pointer.event._uiConsumed = true;
            this.gs.events.emit('use-ability', key);
        });
        bg.on('pointerover', () => this._showHudCard(this._abilityCard(key)));
        bg.on('pointerout', () => this._hideTooltip());

        return { key, ability: a, bg, glyph, hot, wipe, timer };
    }

    /**
     * Laid out like Q/E: the picture in the upper half, the key along the
     * bottom edge. The price is the one thing a Q/E button does not have, so
     * it hangs underneath — a price you cannot see is not a price.
     */
    _buildSpellBtn(key, x) {
        const s = SPELLS[key];
        const bg = this.add.rectangle(x, HUD_Y, HUD_SIZE, HUD_SIZE, 0x12122a, 0.86)
            .setStrokeStyle(2, s.color)
            .setInteractive({ useHandCursor: true });
        const wipe = this.add.rectangle(x, HUD_Y + (HUD_SIZE - 4) / 2, HUD_SIZE - 4, 0, 0x000000, 0.66)
            .setOrigin(0.5, 1);
        const icon = this.add.image(x, HUD_Y - 3, safeTexture(this, s.icon, 'mana_mote')).setScale(0.6);
        const hot = this.add.text(x, HUD_Y + 10, s.hotkey, {
            fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);
        const cost = this.add.text(x, HUD_Y + HUD_SIZE / 2 + 7, `${s.cost}`, {
            fontFamily: FONT, fontSize: '7px', color: '#B388FF',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);
        const timer = this.add.text(x, HUD_Y - 3, '', {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);
        this.hudStrip.add([bg, wipe, icon, hot, cost, timer]);
        this.hudHits.push(bg);

        bg.on('pointerdown', (pointer) => {
            pointer.event.stopPropagation();
            pointer.event._uiConsumed = true;
            this.gs.events.emit('select-spell', key);
        });
        bg.on('pointerover', () => this._showHudCard(this._spellCard(key)));
        bg.on('pointerout', () => this._hideTooltip());

        return { key, spell: s, bg, icon, hot, cost, wipe, timer, armed: false };
    }

    /**
     * While the cursor is building, selling or dragging a fusion, the strip
     * fades to a ghost and lets clicks through, so the cells under it can be
     * built on and inspected. Polled because those modes have many ways in
     * and out; the hotkeys keep working the whole time.
     */
    _tickHudStrip() {
        if (!this.hudStrip) return;
        const gs = this.gs;
        const ghost = !!(gs.placementMode || gs.sellMode || gs.fusionSystem?.dragging);
        if (ghost === !!this._hudGhost) return;
        this._hudGhost = ghost;
        this.tweens.killTweensOf(this.hudStrip);
        this.tweens.add({ targets: this.hudStrip, alpha: ghost ? 0.25 : 1, duration: 150 });
        for (const o of this.hudHits) {
            if (ghost) o.disableInteractive(true);
            else o.setInteractive();
        }
        if (ghost && this.tooltip && this.tooltip === this._hudTip) this._hideTooltip();
    }

    _refreshHeroHealth() {
        const hero = this.gs.hero;
        if (!hero || !this.heroHpFill) return;
        if (hero.isDead) {
            this.heroHpFill.setVisible(false);
            // The empty bar already says he is down; the number says for how long.
            this.heroRespawnText.setText(`${Math.ceil((hero.respawnIn || 0) / 1000)}s`);
            return;
        }
        const pct = Phaser.Math.Clamp(hero.hp / hero.maxHp, 0, 1);
        this.heroHpFill.setVisible(true).setSize(Math.max(1, this.heroHpBarW * pct), 2);
        this.heroHpFill.fillColor = pct > 0.6 ? 0x4CAF50 : pct > 0.3 ? 0xFFC107 : 0xEF5350;
        this.heroRespawnText.setText('');
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
            btn.wipe.setSize(SPELL_SIZE - 4, Math.max(0, (SPELL_SIZE - 4) * pct));
            btn.wipe.setVisible(pct > 0);

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
            btn.wipe.setSize(HUD_SIZE - 4, Math.max(0, (HUD_SIZE - 4) * pct));
            btn.wipe.setVisible(pct > 0);

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
        // Starts right of the hero and spell strip, which it used to cover.
        this.tutorialBox = this.add.rectangle(421, 452, 426, 42, 0x0a0a1a, 0.95)
            .setStrokeStyle(1.5, 0xB388FF)
            .setDepth(70)
            .setVisible(false);

        // Wrapped with comfortable margins leaving the skip button its own column
        this.tutorialText = new IconText(this, 390, 452, '', {
            fontFamily: FONT, fontSize: '7.5px', color: '#ECEFF1', lineSpacing: 4,
        }, { wrap: 46, align: 'center' }).setOrigin(0.5).setDepth(71).setVisible(false);

        this.tutorialSkipBg = this.add.rectangle(600, 452, 54, 22, 0x2a2a4a)
            .setStrokeStyle(1, 0x555577)
            .setDepth(71)
            .setVisible(false)
            .setInteractive({ useHandCursor: true });

        this.tutorialSkip = this.add.text(600, 452, 'SALTAR', {
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
        on('spell-armed', (key) => {
            this._setSpellArmed(key);
            this._refreshCancelButton();
        });
        on('spell-disarmed', () => {
            this._setSpellArmed(null);
            this._refreshCancelButton();
        });
        on('placement-cancelled', () => {
            if (this.selectedBtn) {
                this._setBtnSelected(this.selectedBtn, false);
                this.selectedBtn = null;
            }
            this._refreshCancelButton();
        });
        on('spell-cast', (key) => {
            const s = SPELLS[key];
            if (s) this._flashNotification(`${s.label}  −${s.cost}${MANA}`, s.colorHex);
            this._refreshCancelButton();
        });

        on('wave-started', () => {
            this._updateStatus();
            this._refreshWaveButton();
            // currentWave has already advanced, so the readout now describes the
            // wave after this one — which is the one still worth preparing for.
            this._refreshWavePreview();
        });

        on('wave-complete', () => {
            this._refreshWavePreview();
            if (this.gs.waveManager.isLastWave) return;
            this._refreshWaveButton();
        });

        // The purse is paid by WaveManager, when the board clears or when the
        // next wave is called over it; this only says so.
        on('wave-paid', (wave, reward) => {
            this._lastPurse = reward;
            if (reward <= 0) return;
            audio.play('coin');
            this._flashNotification(`¡Oleada ${wave} completada! +${reward} ORO`, '#4CAF50');
        });

        on('wave-called-early', (bonus) => {
            this._flashNotification(`Oleada +${this._lastPurse ?? 0}  ·  adelanto +${bonus} ORO`, '#FFD54F');
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

        on('fusion-denied', (short) => this._flashNotification(`Fusion: faltan ${short} ORO`, '#EF5350'));
        on('fusion-hover', (info) => {
            if (info) this._showFusionTooltip(info);
            else this._hideTooltip();
        });
        on('pin-card', (s) => this._onPinCard(s));

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
            this._flashNotification(`El heroe recoge ${MANA} sin refinar`, '#B388FF');
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
            const t = UPGRADE_TRACKS[track] ?? OVERCHARGE;
            this._flashNotification(
                `${TEMPLE_DATA[el].shortName}: ${t.label} Nv.${lvl}`,
                track === OVERCHARGE.key ? OVERCHARGE.color : '#FFD54F'
            );
            this._updateManaBar();
        });

        on('barricade-enchanted', (type) => {
            const e = BARRICADE_ENCHANTS[type];
            this._flashNotification(`Barricada de ${e.name}: ${e.desc.toLowerCase()}`,
                `#${e.color.toString(16).padStart(6, '0')}`);
            this._updateAffordability();
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

        // ── Boss Events ─────────────────────────
        on('boss-spawned', (boss) => this._onBossSpawned(boss));
        on('boss-hp-changed', (boss) => this._onBossHpChanged(boss));
        on('boss-ability-cast', (data) => this._onBossAbilityCast(data));
        on('boss-defeated', (boss) => this._onBossDefeated(boss));
        // A map's own events (MapEventSystem): a plug blown, a blizzard, a ward.
        on('map-event', (text, color) => this._flashNotification(text, color));
        on('enemy-reached-end', (enemy) => {
            if (enemy?.isBoss) this._onBossEscaped(enemy);
        });

        on('game-over', () => {
            this._closeUpgradePanel();
            this._closeHelpPanel();
            this._showTutorialStep(null, null);
            this._showEndScreen('¡DERROTA!', '#EF5350');
        });
        on('wave-complete', (wave) => {
            if (wave > this.gs.waveManager.totalWaves) {
                SaveSystem.recordProgress(this.gs.levelData?.id, { wave });
            }
        });
        on('all-waves-complete', () => {
            this._closeUpgradePanel();
            this._closeHelpPanel();
            this._showTutorialStep(null, null);
            this._showEndScreen('¡VICTORIA!', '#4CAF50');
        });
    }

    // ─── Boss Health Bar (Top Screen) ───────────────────
    _buildBossHpBar() {
        this.activeBoss = null;
        this.bossBarContainer = this.add.container(MAP_CX, -50).setDepth(60).setVisible(false);

        // Dark background with gold border
        const bgW = 340;
        const bgH = 38;
        this.bossBarBg = this.add.rectangle(0, 0, bgW, bgH, 0x0c0c18, 0.94);
        this.bossBarBg.setStrokeStyle(1.5, 0xFFD54F, 0.9);

        // Boss Title text
        this.bossTitleText = this.add.text(0, -9, 'JEFE', {
            fontFamily: FONT, fontSize: '8px', color: '#FFD54F',
            stroke: '#000000', strokeThickness: 3, letterSpacing: 1,
        }).setOrigin(0.5);

        // HP bar track
        const barW = 300;
        const barH = 10;
        this.bossHpTrack = this.add.rectangle(0, 6, barW, barH, 0x1a1a2e, 0.95);
        this.bossHpTrack.setStrokeStyle(1, 0x3a3a5a);

        // HP bar fill
        this.bossHpFill = this.add.rectangle(-barW / 2, 6, barW, barH - 2, 0xFF5722, 1).setOrigin(0, 0.5);

        // HP text
        this.bossHpText = this.add.text(0, 6, '1000 / 1000', {
            fontFamily: FONT, fontSize: '7px', color: '#FFFFFF',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);

        // Ability / Status announcement line
        this.bossStatusText = this.add.text(0, 26, '', {
            fontFamily: FONT, fontSize: '7px', color: '#FF8A80',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setVisible(false);

        this.bossBarContainer.add([
            this.bossBarBg,
            this.bossTitleText,
            this.bossHpTrack,
            this.bossHpFill,
            this.bossHpText,
            this.bossStatusText,
        ]);
    }

    _onBossSpawned(boss) {
        this.activeBoss = boss;
        const data = boss.data;

        const titlePart = data.title ? ` — ${data.title}` : '';
        this.bossTitleText.setText(`${data.name.toUpperCase()}${titlePart}`);
        
        // Element-based color for HP fill
        const col = data.color || 0xFF5722;
        this.bossHpFill.fillColor = col;
        this.bossHpFill.width = 300;
        this.bossHpText.setText(`${boss.hp} / ${boss.maxHp}`);
        this.bossStatusText.setText('').setVisible(false);

        this.bossBarContainer.setVisible(true);
        this.bossBarContainer.y = -50;
        this.tweens.add({
            targets: this.bossBarContainer,
            y: 28,
            duration: 400,
            ease: 'Back.easeOut',
        });

        audio.play('boss_alert');
        this._flashNotification(`¡ALERTA: HA LLEGADO ${data.name.toUpperCase()}!`, '#FFD54F');
    }

    _onBossHpChanged(boss) {
        if (!this.activeBoss || !this.activeBoss.alive) {
            this.activeBoss = boss;
        }
        if (this.activeBoss !== boss) return;

        const pct = Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1);
        this.tweens.add({
            targets: this.bossHpFill,
            width: 300 * pct,
            duration: 120,
            ease: 'Linear',
        });

        this.bossHpText.setText(`${Math.max(0, Math.round(boss.hp))} / ${boss.maxHp}`);
    }

    _onBossAbilityCast(data) {
        const { boss, skill } = data;
        if (this.activeBoss && this.activeBoss !== boss) return;

        this.bossStatusText.setText(`¡CANALIZANDO ${skill.name.toUpperCase()}!`)
            .setColor(skill.colorHex || '#FF8A80')
            .setVisible(true);

        this.tweens.add({
            targets: this.bossStatusText,
            scaleX: 1.12, scaleY: 1.12,
            duration: 180, yoyo: true, repeat: 3,
        });

        this.time.delayedCall(skill.chargeMs || 1500, () => {
            if (this.bossStatusText) {
                this.bossStatusText.setText('').setVisible(false);
            }
        });
    }

    _onBossDefeated(boss) {
        if (this.activeBoss === boss) {
            this.bossHpFill.width = 0;
            this.bossHpText.setText(`0 / ${boss.maxHp}`);
            this.bossStatusText.setText('¡JEFE DERROTADO!').setColor('#4CAF50').setVisible(true);

            // Container pulse / victory glow
            this.tweens.add({
                targets: this.bossBarBg,
                strokeColor: 0x4CAF50,
                duration: 200,
                yoyo: true,
                repeat: 3,
            });

            this._flashNotification(`¡${boss.data.name.toUpperCase()} HA SIDO DERROTADO!`, '#4CAF50');
            this._retireBossBar(boss);
        }
    }

    /**
     * A boss that walked out of the exit. Its bar used to stay up forever,
     * reading the health of something no longer on the board; now it says what
     * happened and what it cost, then comes down like a defeated boss's.
     */
    _onBossEscaped(boss) {
        const cost = boss.data.leak ?? 1;
        this._flashNotification(
            `¡${boss.data.name.toUpperCase()} ESCAPO! -${cost} ${cost === 1 ? 'VIDA' : 'VIDAS'}`, '#EF5350'
        );
        if (this.activeBoss !== boss) return;
        this.bossStatusText.setText('¡ESCAPO!').setColor('#EF5350').setVisible(true);
        this._retireBossBar(boss);
    }

    /** After a beat, hands the bar to another living boss or slides it away. */
    _retireBossBar(boss) {
        this.time.delayedCall(1800, () => {
            if (this.activeBoss !== boss) return;
            const remainingBoss = this.gs.enemies.find(e => e.alive && e.isBoss && e !== boss);
            if (remainingBoss) {
                this._onBossSpawned(remainingBoss);
            } else {
                this.tweens.add({
                    targets: this.bossBarContainer,
                    y: -50,
                    duration: 350,
                    ease: 'Quad.easeIn',
                    onComplete: () => {
                        this.bossBarContainer.setVisible(false);
                        this.activeBoss = null;
                    },
                });
            }
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

        const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

        // One recipe: a + b = result, then the result's name and what it does.
        // Two columns, so ten recipes fit without shrinking the type.
        const recipe = (pair, result, col, y, gold) => {
            const [a, b] = pair.split('+');
            const d = TOWER_DATA[result];
            const x0 = col === 0 ? -222 : 6;

            if (gold) {
                container.add(this.add.rectangle(x0 + 108, y, 220, 32, 0x2a210a, 0.35)
                    .setStrokeStyle(1, 0x8a5c05, 0.6));
            }

            const icon = (x, el) => container.add(
                this.add.sprite(x0 + x, y, safeTexture(this, `tower_${el}`, 'tower_earth')).setScale(0.8)
            );
            const glyph = (x, t) => container.add(
                this.add.text(x0 + x, y, t, {
                    fontFamily: FONT, fontSize: '8px', color: '#78909C',
                }).setOrigin(0.5)
            );

            icon(12, a);
            glyph(28, '+');
            icon(44, b);
            glyph(60, '=');
            icon(76, result);

            container.add(this.add.text(x0 + 92, y - 6, d.name, {
                fontFamily: FONT, fontSize: '7px', color: hex(d.color),
            }).setOrigin(0, 0.5));
            container.add(this.add.text(x0 + 92, y + 7, d.specialDesc, {
                fontFamily: FONT, fontSize: '7px', color: '#78909C',
            }).setOrigin(0, 0.5));
        };

        const header = (y, text, color) => container.add(
            this.add.text(0, y, text, { fontFamily: FONT, fontSize: '8px', color }).setOrigin(0.5)
        );

        // Both tables are derived from the maps, so they can never drift from the rules.
        header(-94, 'HIBRIDOS  ·  torres y templos', '#B0BEC5');
        Object.entries(FUSION_MAP).forEach(([pair, result], i) => {
            recipe(pair, result, i % 2, -70 + Math.floor(i / 2) * 36, false);
        });

        header(-4, 'LEGENDARIAS  ·  dos hibridos distintos', '#FFD54F');
        Object.entries(LEGENDARY_MAP).forEach(([pair, result], i) => {
            recipe(pair, result, i % 2, 22 + Math.floor(i / 2) * 36, true);
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

            const spr = this.add.sprite(
                -188, y, safeTexture(this, `enemy_${type}`, 'enemy_slime')
            );
            const maxDim = Math.max(spr.width, spr.height);
            const scale = maxDim > 32 ? (28 / maxDim) : 0.85;
            spr.setScale(scale);
            const animKey = `enemy_${type}_pulse`;
            if (this.anims.exists(animKey)) {
                spr.play(animKey);
            }
            container.add(spr);

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
        container.add(new IconText(this, 0, -124, `Gastan ${MANA}, el mismo que las mejoras de templo.`, {
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

            container.add(new IconText(this, -152, y - 22, spellHeading(key), {
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
        container.add(new IconText(this, -196, 26, `COMBO DE ${MANA}`, {
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
        const { shade, container } = this._openModal(390, 420, d.color);
        this.panelShade = shade;
        this.panelElement = element;

        container.add(this.add.rectangle(0, -172, 390, 50, d.color, 0.14));
        container.add(this.add.sprite(
            -162, -172, safeTexture(this, `temple_${element}`, 'temple_earth')
        ).setScale(1.2));
        this.panelTitle = this.add.text(-132, -180, d.name.toUpperCase(), {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
        }).setOrigin(0, 0.5);
        container.add(this.panelTitle);

        this.panelSubtitle = new IconText(this, -132, -160, '', {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
        }).setOrigin(0, 0.5);
        container.add(this.panelSubtitle);

        this.panelRows = {};
        TRACK_ORDER.forEach((track, i) => {
            this.panelRows[track] = this._buildUpgradeRow(container, element, track, -106 + i * 68);
        });
        // Always on the panel, locked or not: the player should know there is
        // somewhere for maná to go before they get there.
        this.panelOvercharge = this._buildOverchargeRow(container, element, 98);

        this.panelFooter = this.add.text(0, 150, '', {
            fontFamily: FONT, fontSize: '8px', color: '#78909C',
            align: 'center', lineSpacing: 5,
        }).setOrigin(0.5);
        container.add(this.panelFooter);

        this._closeButton(container, 188, () => this._closeUpgradePanel());

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
        const btnCost = new IconText(this, 120, y + 10, '', {
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

    /**
     * Sobrecarga Elemental: the row under the three tracks. Locked until all
     * three are maxed; after that a repeatable +5% damage, priced to climb.
     */
    _buildOverchargeRow(container, element, y) {
        const o = OVERCHARGE;
        const bandBg = this.add.rectangle(0, y, 356, 60, 0x0d0d1c, 0.6);
        bandBg.setStrokeStyle(1, 0x22223a);

        const name = this.add.text(-168, y - 16, o.label, {
            fontFamily: FONT, fontSize: '8px', color: o.color,
        }).setOrigin(0, 0.5);
        const level = this.add.text(-168, y + 10, '', {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
        }).setOrigin(0, 0.5);
        const preview = this.add.text(-6, y - 14, '', {
            fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
        }).setOrigin(0.5);
        const pct = this.add.text(-6, y + 10, '', {
            fontFamily: FONT, fontSize: '8px', color: o.color,
        }).setOrigin(0.5);

        const btnBg = this.add.rectangle(120, y, 112, 46, 0x1e1e3a)
            .setStrokeStyle(1, 0x3a3a5a)
            .setInteractive({ useHandCursor: true });
        const btnTop = this.add.text(120, y - 11, 'SOBRECARGAR', {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
        }).setOrigin(0.5);
        const btnCost = new IconText(this, 120, y + 10, '', {
            fontFamily: FONT, fontSize: '8px', color: '#B388FF',
        }).setOrigin(0.5);

        btnBg.on('pointerdown', () => {
            if (this.gs.templeSystem.buyOvercharge(element)) {
                this._pulse(btnBg);
                this._refreshUpgradePanel();
            } else {
                audio.play('deny');
                this.cameras.main.shake(90, 0.003);
            }
        });

        container.add([bandBg, name, level, preview, pct, btnBg, btnTop, btnCost]);
        return { bandBg, name, level, preview, pct, btnBg, btnTop, btnCost };
    }

    _refreshOverchargeRow(el, mana) {
        const ts = this.gs.templeSystem;
        const row = this.panelOvercharge;
        const o = OVERCHARGE;
        const lvl = ts.overchargeOf(el);
        const pctNow = Math.round(o.step * lvl * 100);
        row.level.setText(`Nv.${lvl}`);

        if (!ts.allMaxed(el)) {
            row.name.setColor('#555566');
            row.preview.setText('Bloqueada');
            row.pct.setText('maxea las 3 mejoras').setColor('#555566');
            row.btnTop.setColor('#555566');
            row.btnCost.setText('');
            row.btnBg.fillColor = 0x16162a;
            row.btnBg.setStrokeStyle(1, 0x2a2a3a);
            return;
        }

        const cost = ts.overchargeCostOf(el);
        const affordable = mana >= cost;
        row.name.setColor(o.color);
        row.preview.setText(`DMG +${pctNow}% → +${pctNow + Math.round(o.step * 100)}%`);
        row.pct.setText(`+${Math.round(o.step * 100)}% por compra`).setColor(o.color);
        row.btnTop.setColor(affordable ? '#FFFFFF' : '#555566');
        row.btnCost.setText(`${cost} ${MANA}`);
        row.btnCost.setColor(affordable ? '#B388FF' : '#555566');
        row.btnBg.fillColor = affordable ? 0x2a1638 : 0x16162a;
        row.btnBg.setStrokeStyle(1, affordable ? o.colorNum : 0x2a2a3a);
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

        this._refreshOverchargeRow(el, mana);

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
        this.panelOvercharge = null;
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
    /**
     * A plain tooltip, drawn as a card: the first line is its name, the rest
     * its body. Sized to its longest line, so a short tip stays small.
     * `originX` is 1 by default because everything in the sidebar hangs to the
     * left of the thing it describes.
     */
    _showTooltip(lines, x, y, originX = 1) {
        const [title, ...body] = lines;
        const longest = Math.max(title.length * 8, ...body.map(l => l.length * 7));
        this._showCard({
            title,
            desc: body.length ? body.join('\n') : null,
            width: Phaser.Math.Clamp(longest + 24, 120, CARD_W),
        }, x, y, { ox: originX, oy: 0.5 });
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
        // The towers live in the board's world; the card in this scene's view.
        const a = worldToView(this.gs, link.b1.x, link.b1.y);
        const b = worldToView(this.gs, link.b2.x, link.b2.y);
        const midX = (a.x + b.x) / 2;
        const minY = Math.min(a.y, b.y);

        // Clamp inside map boundaries
        const targetX = Phaser.Math.Clamp(midX, 100, 540);
        const targetY = Phaser.Math.Clamp(minY - 42, 42, 420);

        const container = this.add.container(targetX, targetY).setDepth(120);

        const cost = fusionCost(link.kind, link.result);
        const boxW = 168;
        const boxH = cost > 0 ? 72 : 58;

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
        if (cost > 0) {
            title.y -= 7;
            body.y -= 7;
            container.add(this.add.text(0, 26, `Costo: ${cost} ORO`, {
                fontFamily: FONT, fontSize: '7px', color: '#FFD54F',
            }).setOrigin(0.5));
        }

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

        const style = {
            fontFamily: FONT, fontSize: '8px', color,
            stroke: '#000000', strokeThickness: 4,
        };
        const n = (hasManaGlyph(text)
            ? new IconText(this, MAP_CX, 34 + slot * 18, text, style)
            : this.add.text(MAP_CX, 34 + slot * 18, text, style)
        ).setOrigin(0.5).setDepth(100);

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
        const isVictory = message === '¡VICTORIA!';
        // Remembered for the map selector: a victory marks the map completed;
        // either way the furthest wave cleared counts as its best.
        const wm = this.gs.waveManager;
        SaveSystem.recordProgress(this.gs.levelData?.id, {
            completed: isVictory,
            wave: isVictory ? wm.currentWave : wm.currentWave - 1,
        });

        const c = this.add.container(0, 0).setDepth(90);
        
        const shade = this.add.rectangle(460, 240, 920, 480, 0x000000, 0.78);
        c.add(shade);

        const title = this.add.text(MAP_CX, 105, message, {
            fontFamily: FONT, fontSize: '24px', color,
            stroke: '#000000', strokeThickness: 5,
        }).setOrigin(0.5);
        c.add(title);

        // Find MVP Tower from active and archived towers
        const activeTowers = (this.gs.towers || []).map(t => {
            const total = this.gs.templeSystem ? this.gs.templeSystem.totalLevels(t.element) : 0;
            return {
                element: t.element,
                name: t.data?.name || t.element,
                totalDamageDealt: t.totalDamageDealt || 0,
                enemiesKilled: t.enemiesKilled || 0,
                level: t.level || 1,
                templeLevel: total,
            };
        });
        const historyTowers = this.gs.towerHistory || [];
        const allCandidates = [...activeTowers, ...historyTowers].filter(
            t => t.totalDamageDealt > 0 || t.enemiesKilled > 0
        );

        allCandidates.sort((a, b) => {
            if (b.totalDamageDealt !== a.totalDamageDealt) {
                return b.totalDamageDealt - a.totalDamageDealt;
            }
            return b.enemiesKilled - a.enemiesKilled;
        });

        const mvp = allCandidates[0] || null;

        const stats = [
            `Oleadas: ${this.gs.waveManager.currentWave}/${this.gs.waveManager.totalWaves}`,
            `Oro: ${this.gs.economySystem.gold}   Fuerza vital: ${this.gs.economySystem.mana}`,
            `Recogida por el heroe: ${this.gs.hero ? this.gs.hero.manaCollected : 0}`,
            `Templos: ${this.gs.temples.length}   Torres: ${this.gs.towers.length}`,
        ];

        if (mvp) {
            stats.push(
                `Torre MVP: ${mvp.name}${mvp.level > 0 ? ` (Nv.${mvp.level})` : ''}`,
                `Daño: ${Math.round(mvp.totalDamageDealt)}  ·  Bajas: ${mvp.enemiesKilled}`
            );
        } else {
            stats.push(`Torre MVP: Ninguna`);
        }

        const statsText = this.add.text(MAP_CX, 215, stats.join('\n'), {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
            lineSpacing: 8, align: 'center',
        }).setOrigin(0.5);
        c.add(statsText);

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
            // The same map again, not the default one
            const levelData = this.gs.levelData;
            SaveSystem.clearSave();
            this.scene.stop('UIScene');
            this.scene.stop('GameScene');
            this.scene.start('GameScene', { continueGame: false, levelData });
        });
        rbg.on('pointerover', () => { rbg.fillColor = 0x388E3C; });
        rbg.on('pointerout', () => { rbg.fillColor = 0x2E7D32; });

        // Main Menu Button
        const mbg = this.add.rectangle(mx, 340, 140, 38, 0x282848);
        mbg.setStrokeStyle(2, 0x90CAF9);
        mbg.setInteractive({ useHandCursor: true });
        const mtext = this.add.text(mx, 340, 'MENU PRINCIPAL', {
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
