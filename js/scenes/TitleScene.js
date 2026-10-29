import * as Phaser from 'phaser';
import { applyViewport } from '../systems/Viewport.js';
import { audio } from '../systems/AudioSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { OptionsModal } from '../systems/OptionsModal.js';
import { safeTexture } from '../systems/TextureGuard.js';
import { DEFAULT_LOOK, ensureHeroTexture } from '../data/HeroLook.js';
import { LEVELS, getLevelById } from '../data/LevelData.js';
import { getWaveProfile } from '../data/WaveData.js';
import { GOLD } from '../data/Palette.js';
import { resolveBiome } from '../systems/Terrain.js';
import { drawMapPreview, BIOME_LOOK, SEAL_COLOR } from '../systems/MapPreview.js';

const FONT = '"Press Start 2P"';

// The map selector's preview box: 240×180, a 20×15 board at 12px a cell.
// Larger levels get smaller cells, centred in the same box.
const MS_BOX_X = 322;
const MS_BOX_Y = 78;
const MS_BOX_W = 240;
const MS_BOX_H = 180;
// Wide enough for "CONTINUAR: PLAZA DEL MERCADO · OLEADA 12".
const MENU_W = 300;

export class TitleScene extends Phaser.Scene {
    constructor() {
        super('TitleScene');
    }

    create() {
        applyViewport(this);

        this.optionsModal = null;
        this.guideModal = null;
        this.confirmModal = null;
        this.mapSelect = null;

        this._buildBackground();
        this._buildParticles();
        this._buildHeader();
        this._buildMenu();
        this._buildFooter();
    }

    _buildBackground() {
        // Deep arcane night background
        this.add.rectangle(460, 240, 920, 480, 0x0c0d1c);

        // Subtle background grid pattern
        const gridG = this.add.graphics();
        gridG.lineStyle(1, 0x222244, 0.25);
        for (let x = 0; x <= 920; x += 32) {
            gridG.lineBetween(x, 0, x, 480);
        }
        for (let y = 0; y <= 480; y += 32) {
            gridG.lineBetween(0, y, 920, y);
        }

        // Vignette shadows on edges
        const leftGrad = this.add.rectangle(60, 240, 120, 480, 0x070712, 0.6);
        const rightGrad = this.add.rectangle(860, 240, 120, 480, 0x070712, 0.6);
    }

    _buildParticles() {
        // Rising ambient motes
        this.particles = [];
        for (let i = 0; i < 26; i++) {
            const px = Phaser.Math.Between(40, 880);
            const py = Phaser.Math.Between(40, 470);
            const color = Phaser.Math.RND.pick([0xB388FF, 0x80DEEA, 0xFFD54F, 0x7AD46A]);
            const p = this.add.circle(px, py, Phaser.Math.Between(1, 2.5), color, Phaser.Math.FloatBetween(0.2, 0.6))
                .setDepth(2);
            p.speedY = Phaser.Math.FloatBetween(12, 28);
            p.swaySpeed = Phaser.Math.FloatBetween(1, 3);
            p.swayAmount = Phaser.Math.FloatBetween(0.5, 1.5);
            p.baseX = px;
            this.particles.push(p);
        }

        // Animated hero silhouette & lantern glow on title
        const heroTex = ensureHeroTexture(this, DEFAULT_LOOK, 'stand');
        const heroSprite = this.add.sprite(220, 260, heroTex)
            .setScale(2.4)
            .setDepth(3);

        const glow = this.add.circle(220, 260, 36, 0xB388FF, 0.12)
            .setDepth(2);
        this.tweens.add({
            targets: glow,
            scaleX: 1.3, scaleY: 1.3, alpha: 0.22,
            duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
    }

    update(_time, delta) {
        if (this.mapSelect) this._animateRoute(delta);
        const dt = delta / 1000;
        for (const p of this.particles) {
            p.y -= p.speedY * dt;
            p.x = p.baseX + Math.sin(this.time.now * 0.002 * p.swaySpeed) * 8 * p.swayAmount;
            if (p.y < -10) {
                p.y = 490;
                p.baseX = Phaser.Math.Between(40, 880);
                p.x = p.baseX;
            }
        }
    }

    _buildHeader() {
        const cx = 560;

        // Title glow & text
        this.add.text(cx, 82, 'ELEMENTAL TD', {
            fontFamily: FONT, fontSize: '28px', color: '#FFD54F',
            stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5).setDepth(10);

        // Subtitle banner
        this.add.text(cx, 118, 'MARCAS DE CENIZA', {
            fontFamily: FONT, fontSize: '11px', color: '#B388FF',
            stroke: '#000000', strokeThickness: 3, letterSpacing: 2,
        }).setOrigin(0.5).setDepth(10);

        // Tagline
        this.add.text(cx, 142, 'Defiende los templos arcanos · Guía a Vesper', {
            fontFamily: FONT, fontSize: '7px', color: '#78909C',
        }).setOrigin(0.5).setDepth(10);
    }

    _buildMenu() {
        const cx = 560;
        const startY = 190;
        const gap = 48;

        // ── 1. COMENZAR ───────────────────────────
        this.btnStart = this._createMenuBtn(cx, startY, MENU_W, 38, 'COMENZAR', 0x2E7D32, 0x4CAF50,
            () => this._onStart());

        // ── 2. CONTINUAR ──────────────────────────
        const saveInfo = SaveSystem.getSummary();
        const hasSave = !!saveInfo;
        const contLabel = this._continueLabel(saveInfo);

        this.btnContinue = this._createMenuBtn(
            cx, startY + gap, MENU_W, 38, contLabel,
            hasSave ? 0x1565C0 : 0x1a1a2e,
            hasSave ? 0x42A5F5 : 0x2a2a44,
            () => {
                if (!SaveSystem.hasSave()) {
                    audio.play('deny');
                    return;
                }
                audio.play('click');
                // The saved map, not the default one: waves and layout are per map.
                this.scene.start('GameScene', { continueGame: true, levelId: SaveSystem.getSummary()?.levelId });
            },
            !hasSave,
            contLabel.length > 30 ? 7 : 8
        );

        // ── 3. OPCIONES ───────────────────────────
        this.btnOptions = this._createMenuBtn(cx, startY + gap * 2, MENU_W, 38, 'OPCIONES', 0x282848, 0x90CAF9, () => {
            audio.play('click');
            this._openOptions();
        });

        // ── 4. GUÍA RÁPIDA (no accented capitals: the font has none) ──
        this.btnGuide = this._createMenuBtn(cx, startY + gap * 3, MENU_W, 32, '¿COMO JUGAR?', 0x1e1e38, 0xFFD54F, () => {
            audio.play('click');
            this._openGuide();
        });
    }

    _createMenuBtn(x, y, w, h, text, fillHex, strokeHex, onClick, disabled = false, fontSize = 8) {
        const c = this.add.container(x, y).setDepth(15);
        const bg = this.add.rectangle(0, 0, w, h, fillHex)
            .setStrokeStyle(disabled ? 1 : 2, strokeHex);

        const txt = this.add.text(0, 0, text, {
            fontFamily: FONT, fontSize: `${fontSize}px`, color: disabled ? '#546E7A' : '#FFFFFF',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5);

        c.add([bg, txt]);
        c.bg = bg;
        c.txt = txt;

        if (!disabled) {
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerdown', (p) => {
                p.event?.stopPropagation();
                onClick();
            });
            bg.on('pointerover', () => {
                bg.setScale(1.03);
                txt.setScale(1.03);
                bg.setStrokeStyle(2, 0xFFD54F);
                txt.setColor('#FFD54F');
            });
            bg.on('pointerout', () => {
                bg.setScale(1);
                txt.setScale(1);
                bg.setStrokeStyle(2, strokeHex);
                txt.setColor('#FFFFFF');
            });
        }

        return c;
    }

    refreshMenuState() {
        const saveInfo = SaveSystem.getSummary();
        const hasSave = !!saveInfo;
        const contLabel = this._continueLabel(saveInfo);

        if (this.btnContinue) {
            this.btnContinue.destroy();
            const cx = 560;
            const startY = 190;
            const gap = 48;
            this.btnContinue = this._createMenuBtn(
                cx, startY + gap, MENU_W, 38, contLabel,
                hasSave ? 0x1565C0 : 0x1a1a2e,
                hasSave ? 0x42A5F5 : 0x2a2a44,
                () => {
                    if (!SaveSystem.hasSave()) {
                        audio.play('deny');
                        return;
                    }
                    audio.play('click');
                    this.scene.start('GameScene', { continueGame: true, levelId: SaveSystem.getSummary()?.levelId });
                },
                !hasSave,
                contLabel.length > 30 ? 7 : 8
            );
        }
    }

    // ─── Starting a game ────────────────────────────────
    /** CONTINUAR's label: the saved map and wave, so the button says what it resumes. */
    _continueLabel(saveInfo) {
        if (!saveInfo) return 'CONTINUAR (SIN PARTIDA)';
        const name = getLevelById(saveInfo.levelId).name.toUpperCase();
        return `CONTINUAR: ${name} · OLEADA ${saveInfo.wave}`;
    }

    /**
     * COMENZAR. Starting a new game overwrites the saved one, so a player with a
     * game in progress is asked first; backing out of the selector afterwards
     * still leaves the save untouched — it is only cleared on JUGAR.
     */
    _onStart() {
        if (this.mapSelect || this.confirmModal) return;
        audio.play('click');
        const save = SaveSystem.getSummary();
        if (save) this._confirmOverwrite(save, () => this._openMapSelect());
        else this._openMapSelect();
    }

    /** A plain rectangle button inside a modal container. */
    _modalBtn(parent, x, y, w, h, label, fill, stroke, onClick) {
        const bg = this.add.rectangle(x, y, w, h, fill).setStrokeStyle(2, stroke)
            .setInteractive({ useHandCursor: true });
        const txt = this.add.text(x, y, label, {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5);
        bg.on('pointerover', () => { bg.setStrokeStyle(2, 0xFFD54F); txt.setColor('#FFD54F'); });
        bg.on('pointerout', () => { bg.setStrokeStyle(2, stroke); txt.setColor('#FFFFFF'); });
        bg.on('pointerdown', (p) => {
            p.event?.stopPropagation();
            onClick();
        });
        parent.add([bg, txt]);
        return bg;
    }

    _confirmOverwrite(save, onYes) {
        const shade = this.add.rectangle(460, 240, 920, 480, 0x000000, 0.75)
            .setDepth(99).setInteractive();
        const c = this.add.container(460, 240).setDepth(100);
        const close = () => {
            c.destroy();
            shade.destroy();
            this.confirmModal = null;
        };

        const bg = this.add.rectangle(0, 0, 440, 170, 0x12122a, 0.98).setStrokeStyle(2, 0xFFD54F);
        const title = this.add.text(0, -58, 'PARTIDA GUARDADA', {
            fontFamily: FONT, fontSize: '10px', color: '#FFD54F',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);
        const name = getLevelById(save.levelId).name;
        const body = this.add.text(0, -12,
            `Tenes una partida en ${name}, oleada ${save.wave}.\nSi empezas otra, se va a reemplazar.`, {
                fontFamily: FONT, fontSize: '7px', color: '#ECEFF1',
                align: 'center', lineSpacing: 8,
            }).setOrigin(0.5);
        c.add([bg, title, body]);

        this._modalBtn(c, -95, 50, 170, 32, 'EMPEZAR OTRA', 0x6e1e14, 0xEF5350, () => {
            audio.play('click');
            close();
            onYes();
        });
        this._modalBtn(c, 95, 50, 150, 32, 'CANCELAR', 0x282848, 0x90CAF9, () => {
            audio.play('click');
            close();
        });
        this.confirmModal = c;
    }

    // ─── Map selector ───────────────────────────────────
    /**
     * The five maps: a list on the left, and for the one selected a live
     * preview of its road, blocks and seals with a few dots walking the
     * enemies' route, its pitch, its starting purse and whether it has been
     * beaten. Arrow keys move, ENTER plays, ESC closes.
     */
    _openMapSelect() {
        if (this.mapSelect) return;
        const save = SaveSystem.getSummary();
        const savedIndex = save ? LEVELS.findIndex(l => l.id === save.levelId) : -1;
        this.msIndex = Math.max(0, savedIndex);
        this.msProgress = SaveSystem.getProgress();

        const shade = this.add.rectangle(460, 240, 920, 480, 0x000000, 0.8)
            .setDepth(99).setInteractive();
        const c = this.add.container(0, 0).setDepth(100);
        this.mapSelect = { shade, c };

        c.add(this.add.rectangle(460, 240, 820, 430, 0x12122a, 0.98).setStrokeStyle(2, 0xFFD54F));
        c.add(this.add.text(460, 46, 'ELIGE UN MAPA', {
            fontFamily: FONT, fontSize: '11px', color: '#FFD54F',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5));

        // The list
        this.msEntries = LEVELS.map((level, i) => {
            const y = 88 + i * 52;
            const look = BIOME_LOOK[resolveBiome(level.biome)];
            const bg = this.add.rectangle(180, y, 220, 46, 0x1a1a32)
                .setStrokeStyle(1, 0x3a3a5a).setInteractive({ useHandCursor: true });
            const num = this.add.text(88, y, String(i + 1), {
                fontFamily: FONT, fontSize: '10px', color: '#78909C',
            }).setOrigin(0.5);
            const name = this.add.text(104, y - 9, level.name.toUpperCase(), {
                fontFamily: FONT, fontSize: '7px', color: '#FFFFFF',
            }).setOrigin(0, 0.5);
            const biome = this.add.text(104, y + 9, look.label, {
                fontFamily: FONT, fontSize: '6px', color: look.accent,
            }).setOrigin(0, 0.5);
            const mark = this.add.graphics();
            if (this.msProgress[level.id]?.completed) this._drawCompletedMark(mark, 272, y, 7);
            bg.on('pointerdown', (p) => {
                p.event?.stopPropagation();
                if (this.msIndex === i) return;
                audio.play('click');
                this._selectMap(i);
            });
            bg.on('pointerover', () => { if (this.msIndex !== i) bg.setStrokeStyle(1, 0x90CAF9); });
            bg.on('pointerout', () => { if (this.msIndex !== i) bg.setStrokeStyle(1, 0x3a3a5a); });
            c.add([bg, num, name, biome, mark]);
            return { bg, num, name };
        });

        // The preview and its legend
        this.msPreviewG = this.add.graphics();
        this.msRouteG = this.add.graphics();
        c.add([this.msPreviewG, this.msRouteG]);
        const legend = this.add.graphics();
        c.add(legend);
        let lx = 322;
        for (const [label, color] of [['FUEGO', SEAL_COLOR.fire], ['AGUA', SEAL_COLOR.water],
            ['TIERRA', SEAL_COLOR.earth], ['AIRE', SEAL_COLOR.air]]) {
            legend.fillStyle(0x000000, 0.8); legend.fillCircle(lx + 3, 270, 4);
            legend.fillStyle(color, 1); legend.fillCircle(lx + 3, 270, 3);
            const t = this.add.text(lx + 10, 270, label, {
                fontFamily: FONT, fontSize: '6px', color: '#90A4AE',
            }).setOrigin(0, 0.5);
            c.add(t);
            lx += t.width + 20;
        }
        legend.fillStyle(0xff5252, 1); legend.fillCircle(lx + 3, 270, 2.5);
        c.add(this.add.text(lx + 10, 270, 'RUTA', {
            fontFamily: FONT, fontSize: '6px', color: '#90A4AE',
        }).setOrigin(0, 0.5));

        // The facts column
        this.msName = this.add.text(584, 80, '', {
            fontFamily: FONT, fontSize: '10px', color: '#FFD54F',
            stroke: '#000000', strokeThickness: 3,
        });
        this.msBiome = this.add.text(584, 104, '', { fontFamily: FONT, fontSize: '7px', color: '#FFFFFF' });
        const coin = this.add.image(592, 138, safeTexture(this, 'icon_coin', 'icon_heart')).setScale(0.75);
        this.msGold = this.add.text(604, 138, '', {
            fontFamily: FONT, fontSize: '8px', color: '#FFD54F',
        }).setOrigin(0, 0.5);
        const heart = this.add.image(668, 138, safeTexture(this, 'icon_heart', 'icon_coin')).setScale(1.3);
        this.msLives = this.add.text(680, 138, '', {
            fontFamily: FONT, fontSize: '8px', color: '#EF9A9A',
        }).setOrigin(0, 0.5);
        this.msWaves = this.add.text(584, 162, '', { fontFamily: FONT, fontSize: '7px', color: '#B0BEC5' });
        this.msBadge = this.add.graphics();
        this.msBadgeText = this.add.text(668, 204, '', {
            fontFamily: FONT, fontSize: '7px', color: '#FFF3C4',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5);
        this.msBest = this.add.text(584, 232, '', { fontFamily: FONT, fontSize: '6px', color: '#90A4AE' });
        this.msBrief = this.add.text(322, 296, '', {
            fontFamily: FONT, fontSize: '7px', color: '#ECEFF1',
            lineSpacing: 8, wordWrap: { width: 520 },
        });
        c.add([this.msName, this.msBiome, coin, this.msGold, heart, this.msLives, this.msWaves,
            this.msBadge, this.msBadgeText, this.msBest, this.msBrief]);

        c.add(this.add.text(72, 420, 'FLECHAS: ELEGIR   ENTER: JUGAR   ESC: VOLVER', {
            fontFamily: FONT, fontSize: '6px', color: '#546E7A',
        }).setOrigin(0, 0.5));
        this._modalBtn(c, 646, 420, 120, 32, 'VOLVER', 0x282848, 0x90CAF9, () => {
            audio.play('click');
            this._closeMapSelect();
        });
        this._modalBtn(c, 784, 420, 130, 32, 'JUGAR', 0x2E7D32, 0x4CAF50, () => this._startSelectedMap());

        this._msOnKey = (event) => {
            if (event.code === 'ArrowUp' || event.code === 'ArrowLeft') this._selectMap(this.msIndex - 1, true);
            else if (event.code === 'ArrowDown' || event.code === 'ArrowRight') this._selectMap(this.msIndex + 1, true);
            else if (event.code === 'Enter' || event.code === 'Space') this._startSelectedMap();
            else if (event.code === 'Escape') this._closeMapSelect();
        };
        this.input.keyboard?.on('keydown', this._msOnKey);

        this._selectMap(this.msIndex);
    }

    _selectMap(i, fromKey = false) {
        const n = LEVELS.length;
        i = ((i % n) + n) % n;
        if (fromKey && i !== this.msIndex) audio.play('click');
        this.msIndex = i;
        const level = LEVELS[i];
        const look = BIOME_LOOK[resolveBiome(level.biome)];

        this.msEntries.forEach((e, k) => {
            const on = k === i;
            e.bg.setFillStyle(on ? 0x2a2a52 : 0x1a1a32).setStrokeStyle(on ? 2 : 1, on ? 0xFFD54F : 0x3a3a5a);
            e.num.setColor(on ? '#FFD54F' : '#78909C');
            e.name.setColor(on ? '#FFD54F' : '#FFFFFF');
        });

        this.msPreviewG.clear();
        const cols = level.cols ?? 20, rows = level.rows ?? 15;
        this.msCell = Math.floor(Math.min(MS_BOX_W / cols, MS_BOX_H / rows));
        this.msMapX = MS_BOX_X + Math.floor((MS_BOX_W - cols * this.msCell) / 2);
        this.msMapY = MS_BOX_Y + Math.floor((MS_BOX_H - rows * this.msCell) / 2);
        this.msRoute = drawMapPreview(this.msPreviewG, level, this.msMapX, this.msMapY, this.msCell);
        this.msRouteT = 0;

        this.msName.setText(level.name.toUpperCase());
        this.msBiome.setText(`BIOMA: ${look.label}`).setColor(look.accent);
        this.msGold.setText(String(level.initialGold));
        this.msLives.setText(String(level.initialLives));
        this.msWaves.setText(`${getWaveProfile(level.waveProfile).waves.length} OLEADAS + INFINITO`);
        this.msBrief.setText(level.brief || level.description || '');

        const progress = this.msProgress[level.id];
        this.msBadge.clear();
        if (progress?.completed) {
            this._drawBadge(this.msBadge, 584, 192, 168, 24);
            this.msBadgeText.setText('COMPLETADO');
        } else {
            this.msBadgeText.setText('');
        }
        const best = progress?.bestWave || 0;
        this.msBest.setText(best > 0 ? `MEJOR: OLEADA ${best}` : progress?.completed ? '' : 'SIN COMPLETAR');
    }

    /** A gold seal with a check in it — the list's mark for a beaten map. */
    _drawCompletedMark(g, x, y, r) {
        g.fillStyle(GOLD.deep, 1); g.fillCircle(x, y, r + 1);
        g.fillStyle(GOLD.mid, 1); g.fillCircle(x, y, r);
        g.fillStyle(GOLD.light, 1); g.fillCircle(x - 1, y - 1, r - 3);
        g.lineStyle(2, GOLD.deep, 1);
        g.beginPath();
        g.moveTo(x - 3, y);
        g.lineTo(x - 1, y + 3);
        g.lineTo(x + 4, y - 3);
        g.strokePath();
    }

    /** The COMPLETADO ribbon: gold band, dark rim, notched tails. */
    _drawBadge(g, x, y, w, h) {
        g.fillStyle(GOLD.deep, 1);
        g.fillRect(x - 6, y + 4, 10, h - 2);
        g.fillRect(x + w - 4, y + 4, 10, h - 2);
        g.fillStyle(GOLD.dark, 1);
        g.fillRect(x - 1, y - 1, w + 2, h + 2);
        g.fillStyle(GOLD.mid, 1);
        g.fillRect(x, y, w, h);
        g.fillStyle(GOLD.light, 1);
        g.fillRect(x, y, w, 2);
        g.fillStyle(GOLD.dark, 1);
        g.fillRect(x, y + h - 2, w, 2);
        this._drawCompletedMark(g, x + 14, y + h / 2, 7);
    }

    _startSelectedMap() {
        if (!this.mapSelect) return;
        audio.play('click');
        const level = LEVELS[this.msIndex];
        // The player already agreed to replace any saved game on COMENZAR
        SaveSystem.clearSave();
        this._closeMapSelect();
        this.scene.start('GameScene', { continueGame: false, levelData: level });
    }

    _closeMapSelect() {
        if (!this.mapSelect) return;
        this.input.keyboard?.off('keydown', this._msOnKey);
        this.mapSelect.c.destroy();
        this.mapSelect.shade.destroy();
        this.mapSelect = null;
        this.msRoute = null;
    }

    /** Three dots walking the enemies' route on the preview, on a loop. */
    _animateRoute(delta) {
        const route = this.msRoute;
        const g = this.msRouteG;
        if (!route || route.length < 2 || !g) return;
        this.msRouteT = (this.msRouteT + (delta / 1000) * 7) % (route.length + 8);
        g.clear();
        for (const lag of [0, 3, 6]) {
            const t = this.msRouteT - lag;
            if (t < 0 || t > route.length - 1) continue;
            const a = route[Math.floor(t)];
            const b = route[Math.min(route.length - 1, Math.floor(t) + 1)];
            const f = t - Math.floor(t);
            const x = this.msMapX + ((a.col + (b.col - a.col) * f) + 0.5) * this.msCell;
            const y = this.msMapY + ((a.row + (b.row - a.row) * f) + 0.5) * this.msCell;
            g.fillStyle(0x000000, 0.8); g.fillCircle(x, y, 3.5);
            g.fillStyle(0xff5252, 1); g.fillCircle(x, y, 2.5);
        }
    }

    _buildFooter() {
        this.add.text(460, 460, 'CONTROLES: Click Izq: Torres / Hechizos · Click Der / WASD: Héroe', {
            fontFamily: FONT, fontSize: '6px', color: '#546E7A',
        }).setOrigin(0.5).setDepth(10);
    }

    _openOptions() {
        if (this.optionsModal) return;
        this.optionsModal = new OptionsModal(this, {
            mode: 'title',
            onClose: () => {
                this.optionsModal = null;
                this.refreshMenuState();
            },
        });
    }

    _openGuide() {
        if (this.guideModal) return;

        const shade = this.add.rectangle(460, 240, 920, 480, 0x000000, 0.75)
            .setDepth(99).setInteractive();

        const c = this.add.container(460, 240).setDepth(100);
        const bg = this.add.rectangle(0, 0, 560, 360, 0x12122a, 0.98);
        bg.setStrokeStyle(2, 0xFFD54F);

        const title = this.add.text(0, -150, 'GUIA RAPIDA DE COMBATE', {
            fontFamily: FONT, fontSize: '11px', color: '#FFD54F',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);

        const lines = [
            '1. DEFENSA: Construye torres básicas y combina dos torres',
            '   para crear elementos avanzados (Hielo, Lava, Tormenta...).',
            '',
            '2. EL HEROE: Mueve a Vesper con Click Derecho o WASD para',
            '   recoger orbes de maná directamente y activar habilidades.',
            '',
            '3. TEMPLOS: Purifican el maná automáticamente y otorgan',
            '   mejoras globales a cada elemento.',
            '',
            '4. BARRICADAS: Desvían la ruta de los enemigos para ganar',
            '   tiempo y crear laberintos estratégicos (mazing).',
        ];

        const txt = this.add.text(-250, -100, lines.join('\n'), {
            fontFamily: FONT, fontSize: '7px', color: '#ECEFF1',
            lineSpacing: 8,
        });

        const closeBtn = this.add.container(0, 145);
        const cBg = this.add.rectangle(0, 0, 140, 28, 0x2E7D32)
            .setStrokeStyle(1, 0x4CAF50)
            .setInteractive({ useHandCursor: true });
        const cTxt = this.add.text(0, 0, 'ENTENDIDO', {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF',
        }).setOrigin(0.5);

        closeBtn.add([cBg, cTxt]);
        cBg.on('pointerdown', () => {
            audio.play('click');
            c.destroy();
            shade.destroy();
            this.guideModal = null;
        });

        c.add([bg, title, txt, closeBtn]);
        this.guideModal = c;
    }
}
