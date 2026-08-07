import * as Phaser from 'phaser';
import { ELEMENTS, TOWER_DATA, FUSION_MAP } from '../data/TowerData.js';
import {
    TEMPLE_DATA, TEMPLE_ELEMENTS, UPGRADE_TRACKS, TRACK_ORDER,
} from '../data/TempleData.js';
import { safeTexture } from '../systems/TextureGuard.js';
import { audio } from '../systems/AudioSystem.js';
import { BARRICADE_COST, SELL_REFUND } from '../systems/EconomySystem.js';

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

export class UIScene extends Phaser.Scene {
    constructor() {
        super('UIScene');
    }

    create(data) {
        /** @type {import('./GameScene.js').GameScene} */
        this.gs = data.gameScene;

        this.upgradePanel = null;
        this.helpPanel = null;
        this.notifSlots = [];

        this._buildSidebar();
        this._buildResourcePanel();
        this._buildTowerButtons();
        this._buildTempleButtons();
        this._buildGlobalControls();
        this._buildWaveButton();
        this._registerEvents();

        this._updateAffordability();
        this._updateManaBar();
    }

    // ─── Shared chrome helpers ──────────────────────────
    _divider(y) {
        this.add.rectangle(CX, y, INNER_W, 1, 0x2a2a4a);
    }

    _sectionHeader(y, text, color) {
        // A colour rule beside the label reads as a section break at a glance,
        // which identical grey words in a column never did.
        this.add.text(LEFT, y, text, {
            fontFamily: FONT, fontSize: '10px', color,
        }).setOrigin(0, 0.5);

        const textW = text.length * 10 + 8;
        this.add.rectangle(LEFT + textW + (INNER_W - textW) / 2, y, INNER_W - textW, 2, 0x2a2a4a);
    }

    _buildSidebar() {
        this.add.rectangle(CX, 240, BAR_W, 480, 0x12122a).setDepth(0);
        this.add.rectangle(BAR_X, 240, 2, 480, 0x2a2a4a).setDepth(0);

        this.add.text(CX, 18, 'ELEMENTAL TD', {
            fontFamily: FONT, fontSize: '12px', color: '#FFD54F',
        }).setOrigin(0.5);

        this._divider(32);
    }

    // ─── Resources ──────────────────────────────────────
    /**
     * Gold and life force are the two numbers you act on, so they get cards.
     * Lives and wave are status, so they get one line underneath.
     */
    _buildResourcePanel() {
        this.goldValue = this._resourceCard(52, 'ORO', '#FFD700', 0x2a2410, 0x5a4a20);
        this.manaValue = this._resourceCard(88, MANA, '#B388FF', 0x1e1a33, 0x4a3a7a);

        // Progress toward the cheapest upgrade currently within reach
        this.manaBarBg = this.add.rectangle(CX, 110, INNER_W, 6, 0x1a1a2e);
        this.manaBarBg.setStrokeStyle(1, 0x2a2a4a);
        this.manaBarFill = this.add.rectangle(LEFT, 110, 0, 4, 0xB388FF).setOrigin(0, 0.5);
        this.manaGoalText = this.add.text(CX, 124, '', {
            fontFamily: FONT, fontSize: '8px', color: '#6a6a8a',
        }).setOrigin(0.5);

        this.statusText = this.add.text(CX, 140, '', {
            fontFamily: FONT, fontSize: '10px', color: '#B0BEC5',
        }).setOrigin(0.5);
        this._updateStatus();

        this._divider(152);
    }

    _resourceCard(y, label, color, fill, stroke) {
        const card = this.add.rectangle(CX, y, INNER_W, 32, fill);
        card.setStrokeStyle(1, stroke);

        this.add.text(LEFT + 10, y, label, {
            fontFamily: FONT, fontSize: '10px', color,
        }).setOrigin(0, 0.5);

        return this.add.text(RIGHT - 10, y, '0', {
            fontFamily: FONT, fontSize: '16px', color,
        }).setOrigin(1, 0.5);
    }

    _updateStatus() {
        const e = this.gs.economySystem;
        const w = this.gs.waveManager;
        this.statusText.setText(`♥ ${e.lives}    OLEADA ${w.currentWave}/${w.totalWaves}`);
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
        ).setScale(2.4);

        const cost = this.add.text(x, y + 20, `${td.cost}`, {
            fontFamily: FONT, fontSize: '10px', color: '#FFD700',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);

        const btn = { bg, icon, cost, element, kind: 'tower' };

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
            fontFamily: FONT, fontSize: '9px', color: '#ECEFF1',
        }).setOrigin(0, 0.5);
        const cost = this.add.text(l + w - 8, y, `${BARRICADE_COST}`, {
            fontFamily: FONT, fontSize: '10px', color: '#FFD700',
        }).setOrigin(1, 0.5);

        const btn = { bg, icon, cost, kind: 'barricade' };

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
            fontFamily: FONT, fontSize: '9px', color: '#ECEFF1',
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

        this.templeCostText = this.add.text(CX, 372, '', {
            fontFamily: FONT, fontSize: '9px', color: '#FFD700',
        }).setOrigin(0.5);

        this._divider(384);
    }

    _createTempleBtn(element, x, y) {
        const bg = this.add.image(x, y, 'btn_build').setInteractive({ useHandCursor: true });
        const icon = this.add.sprite(
            x, y - 8, safeTexture(this, `temple_${element}`, 'temple_earth')
        ).setScale(2.4);

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
                `Refina: +${Math.round(d.absorbBonus * 100)}% ${MANA}`,
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
        this.templeCostText.setText(`SIGUIENTE TEMPLO: ${ts.nextCost}`);
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
            const bg = this.add.rectangle(x + w / 2, 404, w, 26, 0x333344)
                .setInteractive({ useHandCursor: true });
            const txt = this.add.text(x + w / 2, 404, label, {
                fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
            }).setOrigin(0.5);
            bg.on('pointerdown', () => { audio.play('click'); onClick(bg, txt); });
            return { bg, txt };
        };

        mk(LEFT, 54, 'VEL 1x', (bg, txt) => {
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

        this.gs.waveManager.autoWave = false;
        mk(LEFT + 60, 74, 'AUTO: NO', (bg, txt) => {
            const wm = this.gs.waveManager;
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

        const sound = mk(LEFT + 140, 70, '', (bg, txt) => {
            const on = audio.toggle();
            txt.setText(on ? 'SON: SI' : 'SON: NO');
            bg.fillColor = on ? 0x333344 : 0x552222;
        });
        sound.txt.setText(audio.enabled ? 'SON: SI' : 'SON: NO');
        sound.bg.fillColor = audio.enabled ? 0x333344 : 0x552222;

        mk(LEFT + 216, 40, '?', () => this._openHelpPanel());
    }

    // ─── Wave button ────────────────────────────────────
    _buildWaveButton() {
        this.waveBtnBg = this.add.rectangle(CX, 448, INNER_W, 40, 0x2E7D32);
        this.waveBtnBg.setStrokeStyle(2, 0x4CAF50);
        this.waveBtnBg.setInteractive({ useHandCursor: true });

        this.waveBtnText = this.add.text(CX, 448, 'OLEADA ▶', {
            fontFamily: FONT, fontSize: '12px', color: '#FFFFFF',
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

    // ─── Events ─────────────────────────────────────────
    _registerEvents() {
        this.gs.events.on('gold-changed', (g) => {
            this.goldValue.setText(`${g}`);
            this._updateAffordability();
        });

        this.gs.events.on('mana-changed', (m) => {
            this.manaValue.setText(`${m}`);
            this._updateManaBar();
            this._refreshUpgradePanel();
        });

        this.gs.events.on('lives-changed', () => this._updateStatus());

        this.gs.events.on('wave-started', () => {
            this._updateStatus();
            this.waveBtnBg.fillColor = 0x333344;
            this.waveBtnText.setColor('#555555');
        });

        this.gs.events.on('wave-complete', () => {
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

        this.gs.events.on('placement-cancelled', () => {
            if (this.selectedBtn) {
                this._setBtnSelected(this.selectedBtn, false);
                this.selectedBtn = null;
            }
        });

        this.gs.events.on('temple-built', (el) => {
            this._flashNotification(`¡${TEMPLE_DATA[el].name} erigido!`, '#B388FF');
            this._updateAffordability();
            this._updateManaBar();
        });

        // Selling a temple moves the price of the next one and can empty the
        // maná goal, so the whole sidebar is re-read rather than just the gold.
        this.gs.events.on('structure-sold', (kind, refund) => {
            this._flashNotification(`+${refund} oro`, '#FFD700');
            this._updateAffordability();
            this._updateManaBar();
        });

        this.gs.events.on('open-temple', (el) => this._openUpgradePanel(el));
        this.gs.events.on('hint', (text, color) => this._flashNotification(text, color ?? '#B388FF'));

        // Said once, the first time it happens: the floating +N shows that the
        // hero collects, but not that he collects at face value.
        this.gs.events.on('hero-collected', () => {
            if (this.heroHintShown) return;
            this.heroHintShown = true;
            this._flashNotification('El heroe recoge ✦ sin refinar', '#B388FF');
        });

        this.gs.events.on('temple-upgraded', (el, track, lvl) => {
            this._flashNotification(
                `${TEMPLE_DATA[el].shortName}: ${UPGRADE_TRACKS[track].label} Nv.${lvl}`,
                '#FFD54F'
            );
            this._updateManaBar();
        });

        this.gs.events.on('fusion-complete', (el, kind) => {
            const d = kind === 'temple' ? TEMPLE_DATA[el] : TOWER_DATA[el];
            const what = kind === 'temple' ? `Templo de ${d.shortName}` : d.name;
            this._flashNotification(`¡${d.emoji} ${what} creado!`, '#FFD700');
            if (kind === 'temple') {
                this._closeUpgradePanel();
                this._updateAffordability();
                this._updateManaBar();
            }
        });

        this.gs.events.on('game-over', () => {
            this._closeUpgradePanel();
            this._closeHelpPanel();
            this._showEndScreen('¡DERROTA!', '#EF5350');
        });
        this.gs.events.on('all-waves-complete', () => {
            this._closeUpgradePanel();
            this._closeHelpPanel();
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
            fontFamily: FONT, fontSize: '10px', color: '#FFFFFF',
        }).setOrigin(0.5);
        bg.on('pointerdown', () => { audio.play('click'); onClick(); });
        bg.on('pointerover', () => { bg.fillColor = 0x44445a; });
        bg.on('pointerout', () => { bg.fillColor = 0x333344; });
        container.add([bg, txt]);
    }

    // ─── Fusion reference (help overlay) ────────────────
    /**
     * The fusion table used to sit permanently in the sidebar at 6px, where it
     * was barely legible and ate the room every other section needed. As an
     * overlay it can be read at a usable size and costs nothing when closed.
     */
    _openHelpPanel() {
        if (this.helpPanel) { this._closeHelpPanel(); return; }
        this._closeUpgradePanel();

        const { shade, container } = this._openModal(460, 300, 0xFFD54F);
        this.helpShade = shade;

        container.add(this.add.text(0, -122, 'FUSIONES', {
            fontFamily: FONT, fontSize: '14px', color: '#FFD54F',
        }).setOrigin(0.5));

        container.add(this.add.text(0, -100, 'Dos vecinas compatibles se pueden fusionar.', {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
        }).setOrigin(0.5));
        container.add(this.add.text(0, -84, 'Vale igual para torres y para templos.', {
            fontFamily: FONT, fontSize: '8px', color: '#B0BEC5',
        }).setOrigin(0.5));

        // Derived from FUSION_MAP so the table can never drift from the rules.
        Object.entries(FUSION_MAP).forEach(([pair, result], i) => {
            const [a, b] = pair.split('+');
            const y = -46 + i * 40;
            const d = TOWER_DATA[result];

            const icon = (x, el) => container.add(
                this.add.sprite(x, y, safeTexture(this, `tower_${el}`, 'tower_earth')).setScale(1.8)
            );
            const glyph = (x, t) => container.add(
                this.add.text(x, y, t, {
                    fontFamily: FONT, fontSize: '10px', color: '#78909C',
                }).setOrigin(0.5)
            );

            icon(-190, a);
            glyph(-160, '+');
            icon(-130, b);
            glyph(-100, '=');
            icon(-70, result);

            container.add(this.add.text(-44, y - 6, d.name, {
                fontFamily: FONT, fontSize: '11px', color: `#${d.color.toString(16).padStart(6, '0')}`,
            }).setOrigin(0, 0.5));
            container.add(this.add.text(-44, y + 9, d.specialDesc, {
                fontFamily: FONT, fontSize: '8px', color: '#78909C',
            }).setOrigin(0, 0.5));
        });

        this._closeButton(container, 128, () => this._closeHelpPanel());
        this.helpPanel = container;
    }

    _closeHelpPanel() {
        if (this.helpShade) { this.helpShade.destroy(); this.helpShade = null; }
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
        ).setScale(2.4));
        container.add(this.add.text(-132, -140, d.name.toUpperCase(), {
            fontFamily: FONT, fontSize: '11px', color: '#FFFFFF',
        }).setOrigin(0, 0.5));

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
            fontFamily: FONT, fontSize: '10px', color: t.color,
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
            fontFamily: FONT, fontSize: '11px', color: '#ECEFF1',
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
            fontFamily: FONT, fontSize: '10px', color: '#B388FF',
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

        this.panelSubtitle.setText(
            `${MANA} ${mana}  ·  ${n} ${n === 1 ? 'torre afectada' : 'torres afectadas'}`
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
        const lines = [
            td.name,
            `DMG: ${Math.round(td.damage * ts.multiplier(element, 'damage'))}`,
            `RNG: ${Math.round(td.range * ts.multiplier(element, 'range'))}`,
            td.specialDesc,
        ];
        if (ts.totalLevels(element) > 0) lines.push('mejorada por templo');
        this._showTooltip(lines, x, y);
    }

    _showTooltip(lines, x, y) {
        this._hideTooltip();
        this.tooltip = this.add.text(x, y, lines.join('\n'), {
            fontFamily: FONT,
            fontSize: '9px',
            color: '#ECEFF1',
            backgroundColor: '#0a0a1af0',
            padding: { x: 10, y: 10 },
            lineSpacing: 7,
        }).setOrigin(1, 0.5).setDepth(60);
    }

    _hideTooltip() {
        if (this.tooltip) { this.tooltip.destroy(); this.tooltip = null; }
    }

    // ─── Notifications ──────────────────────────────────
    /**
     * Buying three upgrades in a row used to stack three messages on the same
     * pixel row, so each new one lands a line lower and frees its slot on fade.
     */
    _flashNotification(text, color) {
        let slot = 0;
        while (this.notifSlots[slot]) slot++;
        this.notifSlots[slot] = true;

        const n = this.add.text(MAP_CX, 34 + slot * 18, text, {
            fontFamily: FONT, fontSize: '11px', color,
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(100);

        this.tweens.add({
            targets: n, y: 12 + slot * 18, alpha: 0,
            duration: 2000, ease: 'Quad.easeOut',
            onComplete: () => {
                this.notifSlots[slot] = false;
                n.destroy();
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
        this.templeCostText.setColor(gold >= templeCost ? '#FFD700' : '#555555');
    }

    _setAffordable(btn, can) {
        btn.icon.setAlpha(can ? 1 : 0.3);
        if (btn.cost) btn.cost.setColor(can ? '#FFD700' : '#555555');
        if (!can && this.selectedBtn === btn) {
            this._setBtnSelected(btn, false);
            this.selectedBtn = null;
            this.gs._cancelPlacement();
        }
    }

    // ─── End screen ─────────────────────────────────────
    _showEndScreen(message, color) {
        this.add.rectangle(460, 240, 920, 480, 0x000000, 0.78).setDepth(90);

        this.add.text(MAP_CX, 130, message, {
            fontFamily: FONT, fontSize: '24px', color,
            stroke: '#000000', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(91);

        const stats = [
            `Oleadas: ${this.gs.waveManager.currentWave}/${this.gs.waveManager.totalWaves}`,
            `Oro: ${this.gs.economySystem.gold}`,
            `Fuerza vital: ${this.gs.economySystem.mana}`,
            `Recogida por el heroe: ${this.gs.hero.manaCollected}`,
            `Templos: ${this.gs.temples.length}`,
            `Torres: ${this.gs.towers.length}`,
        ];
        this.add.text(MAP_CX, 224, stats.join('\n'), {
            fontFamily: FONT, fontSize: '9px', color: '#B0BEC5',
            lineSpacing: 10, align: 'center',
        }).setOrigin(0.5).setDepth(91);

        const rbg = this.add.rectangle(MAP_CX, 340, 180, 40, 0x2E7D32).setDepth(91);
        rbg.setStrokeStyle(2, 0x4CAF50);
        rbg.setInteractive({ useHandCursor: true });

        this.add.text(MAP_CX, 340, 'REINICIAR', {
            fontFamily: FONT, fontSize: '11px', color: '#FFFFFF',
        }).setOrigin(0.5).setDepth(92);

        rbg.on('pointerdown', () => {
            this.scene.stop('UIScene');
            this.scene.stop('GameScene');
            this.scene.start('GameScene');
        });
        rbg.on('pointerover', () => { rbg.fillColor = 0x388E3C; });
        rbg.on('pointerout', () => { rbg.fillColor = 0x2E7D32; });
    }
}
