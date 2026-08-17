import * as Phaser from 'phaser';
import { applyViewport } from '../systems/Viewport.js';
import { audio } from '../systems/AudioSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { OptionsModal } from '../systems/OptionsModal.js';
import { safeTexture } from '../systems/TextureGuard.js';
import { DEFAULT_LOOK, ensureHeroTexture } from '../data/HeroLook.js';

const FONT = '"Press Start 2P"';

export class TitleScene extends Phaser.Scene {
    constructor() {
        super('TitleScene');
    }

    create() {
        applyViewport(this);

        this.optionsModal = null;
        this.guideModal = null;

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
        this.btnStart = this._createMenuBtn(cx, startY, 260, 38, 'COMENZAR', 0x2E7D32, 0x4CAF50, () => {
            audio.play('click');
            this.scene.start('GameScene', { continueGame: false });
        });

        // ── 2. CONTINUAR ──────────────────────────
        const saveInfo = SaveSystem.getSummary();
        const hasSave = !!saveInfo;
        const contLabel = hasSave
            ? `CONTINUAR (OLEADA ${saveInfo.wave})`
            : 'CONTINUAR (SIN PARTIDA)';

        this.btnContinue = this._createMenuBtn(
            cx, startY + gap, 260, 38, contLabel,
            hasSave ? 0x1565C0 : 0x1a1a2e,
            hasSave ? 0x42A5F5 : 0x2a2a44,
            () => {
                if (!SaveSystem.hasSave()) {
                    audio.play('deny');
                    return;
                }
                audio.play('click');
                this.scene.start('GameScene', { continueGame: true });
            },
            !hasSave
        );

        // ── 3. OPCIONES ───────────────────────────
        this.btnOptions = this._createMenuBtn(cx, startY + gap * 2, 260, 38, 'OPCIONES', 0x282848, 0x90CAF9, () => {
            audio.play('click');
            this._openOptions();
        });

        // ── 4. GUÍA RÁPIDA ────────────────────────
        this.btnGuide = this._createMenuBtn(cx, startY + gap * 3, 260, 32, '¿CÓMO JUGAR?', 0x1e1e38, 0xFFD54F, () => {
            audio.play('click');
            this._openGuide();
        });
    }

    _createMenuBtn(x, y, w, h, text, fillHex, strokeHex, onClick, disabled = false) {
        const c = this.add.container(x, y).setDepth(15);
        const bg = this.add.rectangle(0, 0, w, h, fillHex)
            .setStrokeStyle(disabled ? 1 : 2, strokeHex);

        const txt = this.add.text(0, 0, text, {
            fontFamily: FONT, fontSize: '8px', color: disabled ? '#546E7A' : '#FFFFFF',
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
        const contLabel = hasSave
            ? `CONTINUAR (OLEADA ${saveInfo.wave})`
            : 'CONTINUAR (SIN PARTIDA)';

        if (this.btnContinue) {
            this.btnContinue.destroy();
            const cx = 560;
            const startY = 190;
            const gap = 48;
            this.btnContinue = this._createMenuBtn(
                cx, startY + gap, 260, 38, contLabel,
                hasSave ? 0x1565C0 : 0x1a1a2e,
                hasSave ? 0x42A5F5 : 0x2a2a44,
                () => {
                    if (!SaveSystem.hasSave()) {
                        audio.play('deny');
                        return;
                    }
                    audio.play('click');
                    this.scene.start('GameScene', { continueGame: true });
                },
                !hasSave
            );
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

        const title = this.add.text(0, -150, 'GUÍA RÁPIDA DE COMBATE', {
            fontFamily: FONT, fontSize: '11px', color: '#FFD54F',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);

        const lines = [
            '1. DEFENSA: Construye torres básicas y combina dos torres',
            '   para crear elementos avanzados (Hielo, Lava, Tormenta...).',
            '',
            '2. EL HÉROE: Mueve a Vesper con Click Derecho o WASD para',
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
