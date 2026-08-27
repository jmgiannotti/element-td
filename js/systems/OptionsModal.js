import { display } from './DisplaySystem.js';
import { audio } from './AudioSystem.js';
import { SaveSystem } from './SaveSystem.js';

const FONT = '"Press Start 2P"';
const JOYSTICK_KEY = 'elemental-td:joystick';

export function isJoystickEnabled() {
    try {
        const val = localStorage.getItem(JOYSTICK_KEY);
        return val === null ? true : val === 'true';
    } catch {
        return true;
    }
}

export function setJoystickEnabled(enabled) {
    try {
        localStorage.setItem(JOYSTICK_KEY, enabled ? 'true' : 'false');
    } catch {}
}

export class OptionsModal {
    /**
     * @param {Phaser.Scene} scene
     * @param {{ mode: 'title' | 'ingame', gameScene?: Phaser.Scene, onClose?: () => void, onSaveQuit?: () => void, onRestart?: () => void }} opts
     */
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.opts = opts;
        this.container = null;
        this.shade = null;
        this.unsubscribeDisplay = null;
        this._build();
    }

    _build() {
        const cx = 460;
        const cy = 240;
        const w = 530;
        const h = 400;

        // Dim background shade
        this.shade = this.scene.add.rectangle(cx, cy, 920, 480, 0x000000, 0.7)
            .setDepth(99)
            .setInteractive();

        this.container = this.scene.add.container(cx, cy).setDepth(100);

        // Main modal frame
        const bg = this.scene.add.rectangle(0, 0, w, h, 0x12122a, 0.98);
        bg.setStrokeStyle(2, 0xFFD54F);

        // Inner header
        const title = this.scene.add.text(0, -h / 2 + 20, '⚙ OPCIONES', {
            fontFamily: FONT, fontSize: '11px', color: '#FFD54F',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);

        const div1 = this.scene.add.rectangle(0, -h / 2 + 36, w - 40, 1, 0x2a2a5a);

        this.container.add([bg, title, div1]);

        // ── 1. Display & Scaling Section ─────────
        const sec1 = this.scene.add.text(-w / 2 + 24, -h / 2 + 50, 'PANTALLA Y ESCALA', {
            fontFamily: FONT, fontSize: '8px', color: '#90CAF9',
        });

        this.resText = this.scene.add.text(0, -h / 2 + 68, '', {
            fontFamily: FONT, fontSize: '7px', color: '#ECEFF1',
        }).setOrigin(0.5);

        // Scale action buttons
        const btnY = -h / 2 + 92;
        const bCrisp = this._button(-160, btnY, 86, 22, 'NÍTIDO', 0x2a2a5a, () => {
            display.setCrisp();
            this._refreshInfo();
        });
        const bFill = this._button(-64, btnY, 86, 22, 'LLENAR', 0x2a2a5a, () => {
            display.setFill();
            this._refreshInfo();
        });
        const b1x = this._button(28, btnY, 44, 22, '1x', 0x2a2a5a, () => {
            display.setScale(1);
            this._refreshInfo();
        });
        const b2x = this._button(78, btnY, 44, 22, '2x', 0x2a2a5a, () => {
            display.setScale(2);
            this._refreshInfo();
        });
        const b3x = this._button(128, btnY, 44, 22, '3x', 0x2a2a5a, () => {
            display.setScale(3);
            this._refreshInfo();
        });
        const b4x = this._button(178, btnY, 44, 22, '4x', 0x2a2a5a, () => {
            display.setScale(4);
            this._refreshInfo();
        });

        // Bottom size bar toggle
        this.barBtn = this._button(0, -h / 2 + 122, 400, 22, '', 0x1e1e3a, () => {
            const on = display.toggleBottomBar();
            this._updateBarBtn(on);
        });

        this.container.add([sec1, this.resText, bCrisp, bFill, b1x, b2x, b3x, b4x, this.barBtn]);

        const div2 = this.scene.add.rectangle(0, -h / 2 + 144, w - 40, 1, 0x2a2a5a);
        this.container.add(div2);

        // ── 2. Audio Section ────────────────────
        const sec2 = this.scene.add.text(-w / 2 + 24, -h / 2 + 158, 'AUDIO', {
            fontFamily: FONT, fontSize: '8px', color: '#90CAF9',
        });

        this.soundBtn = this._button(0, -h / 2 + 182, 400, 22, '', 0x1e1e3a, () => {
            const on = audio.toggle();
            this._updateSoundBtn(on);
        });

        this.container.add([sec2, this.soundBtn]);

        const div3 = this.scene.add.rectangle(0, -h / 2 + 204, w - 40, 1, 0x2a2a5a);
        this.container.add(div3);

        // ── 3. Game Management Section ───────────
        const sec3 = this.scene.add.text(-w / 2 + 24, -h / 2 + 218, 'PARTIDA', {
            fontFamily: FONT, fontSize: '8px', color: '#90CAF9',
        });
        this.container.add(sec3);

        if (this.opts.mode === 'ingame') {
            const bSaveQuit = this._button(-105, -h / 2 + 246, 195, 24, 'GUARDAR Y SALIR', 0x1565C0, () => {
                if (this.opts.gameScene) {
                    SaveSystem.saveGame(this.opts.gameScene);
                }
                this.close();
                if (this.opts.onSaveQuit) this.opts.onSaveQuit();
                else {
                    this.scene.scene.stop('UIScene');
                    this.scene.scene.stop('GameScene');
                    this.scene.scene.start('TitleScene');
                }
            });

            const bRestart = this._button(105, -h / 2 + 246, 195, 24, 'REINICIAR PARTIDA', 0x552222, () => {
                this.close();
                if (this.opts.onRestart) this.opts.onRestart();
                else {
                    SaveSystem.clearSave();
                    this.scene.scene.stop('UIScene');
                    this.scene.scene.stop('GameScene');
                    this.scene.scene.start('GameScene', { continueGame: false });
                }
            });

            this.container.add([bSaveQuit, bRestart]);
        } else {
            this.clearSaveBtn = this._button(0, -h / 2 + 246, 400, 24, 'BORRAR PARTIDA GUARDADA', 0x442222, () => {
                SaveSystem.clearSave();
                this._updateClearSaveBtn();
                if (this.scene.refreshMenuState) this.scene.refreshMenuState();
            });
            this.container.add(this.clearSaveBtn);
            this._updateClearSaveBtn();
        }

        // ── 4. Close button ──────────────────────
        const bClose = this._button(0, h / 2 - 28, 140, 26, 'VOLVER', 0x2a2a5a, () => {
            this.close();
        });
        this.container.add(bClose);

        // Pop in animation
        this.container.setScale(0.92).setAlpha(0);
        this.scene.tweens.add({
            targets: this.container,
            scaleX: 1, scaleY: 1, alpha: 1,
            duration: 180, ease: 'Back.easeOut',
        });

        // Initialize values
        this._refreshInfo();
        this._updateBarBtn(display.isBottomBarVisible());
        this._updateSoundBtn(audio.enabled);

        this.unsubscribeDisplay = display.onChange(() => this._refreshInfo());
    }

    _button(x, y, w, h, label, bgHex, onClick) {
        const c = this.scene.add.container(x, y);
        const bg = this.scene.add.rectangle(0, 0, w, h, bgHex)
            .setStrokeStyle(1, 0x3a3a6a)
            .setInteractive({ useHandCursor: true });

        const txt = this.scene.add.text(0, 0, label, {
            fontFamily: FONT, fontSize: '8px', color: '#ECEFF1',
        }).setOrigin(0.5);

        bg.on('pointerdown', (p) => {
            p.event?.stopPropagation();
            audio.play('click');
            onClick();
        });
        bg.on('pointerover', () => { bg.setStrokeStyle(1, 0xFFD54F); txt.setColor('#FFD54F'); });
        bg.on('pointerout', () => { bg.setStrokeStyle(1, 0x3a3a6a); txt.setColor('#ECEFF1'); });

        c.add([bg, txt]);
        c.bg = bg;
        c.txt = txt;
        return c;
    }

    _updateBarBtn(visible) {
        if (!this.barBtn) return;
        this.barBtn.txt.setText(visible ? 'BARRA INFERIOR: VISIBLE (PANTALLA)' : 'BARRA INFERIOR: OCULTA (SOLO OPCIONES)');
        this.barBtn.bg.fillColor = visible ? 0x2E7D32 : 0x1e1e3a;
    }

    _updateSoundBtn(enabled) {
        if (!this.soundBtn) return;
        this.soundBtn.txt.setText(enabled ? 'SONIDO: ACTIVADO' : 'SONIDO: SILENCIADO');
        this.soundBtn.bg.fillColor = enabled ? 0x2E7D32 : 0x552222;
    }

    _updateClearSaveBtn() {
        if (!this.clearSaveBtn) return;
        const has = SaveSystem.hasSave();
        this.clearSaveBtn.txt.setText(has ? 'BORRAR PARTIDA GUARDADA' : 'NO HAY PARTIDA GUARDADA');
        this.clearSaveBtn.bg.fillColor = has ? 0x662222 : 0x222233;
        this.clearSaveBtn.bg.disableInteractive();
        if (has) this.clearSaveBtn.bg.setInteractive({ useHandCursor: true });
    }

    _refreshInfo() {
        if (!this.resText) return;
        const info = display.getInfo();
        this.resText.setText(`RESOLUCIÓN: ${info.label}`);
    }

    close() {
        if (this.unsubscribeDisplay) {
            this.unsubscribeDisplay();
            this.unsubscribeDisplay = null;
        }
        if (this.opts.onClose) this.opts.onClose();

        if (this.container) {
            this.scene.tweens.add({
                targets: [this.container, this.shade],
                alpha: 0, scaleX: 0.95, scaleY: 0.95,
                duration: 140,
                onComplete: () => {
                    if (this.container) this.container.destroy();
                    if (this.shade) this.shade.destroy();
                },
            });
        }
    }
}
