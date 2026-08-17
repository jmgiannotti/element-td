import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { VIEW_W, VIEW_H, SUPER } from './systems/Viewport.js';
import { installTextResolution } from './systems/Typography.js';
import { display } from './systems/DisplaySystem.js';

const dpr = () => window.devicePixelRatio || 1;

const initialScale = display.getEffectiveScale();

const config = {
    type: Phaser.AUTO,
    width: VIEW_W * SUPER,
    height: VIEW_H * SUPER,
    parent: 'game-container',
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#1a1a2e',
    scene: [BootScene, TitleScene, GameScene, UIScene],
    scale: {
        mode: Phaser.Scale.NONE,
        zoom: initialScale / (SUPER * dpr()),
        autoCenter: Phaser.Scale.NO_CENTER,
        expandParent: false,
    },
};

/**
 * Wires the size slider to DisplaySystem and keeps the two in agreement when
 * the window, the monitor or options modal changes underneath them.
 */
function installSizeControl(game) {
    const range = document.getElementById('size-range');
    const ticks = document.getElementById('size-ticks');
    const readout = document.getElementById('size-readout');
    const crispBtn = document.getElementById('size-crisp');
    const fillBtn = document.getElementById('size-fill');
    if (!range) return;

    const CLEAN_SCALES = [4, 2, 1];

    const buildTicks = (max) => {
        ticks.textContent = '';
        for (const s of CLEAN_SCALES) {
            if (s > max + 1e-6) continue;
            const opt = document.createElement('option');
            opt.value = String(s);
            opt.label = `${s}x`;
            ticks.appendChild(opt);
        }
    };

    const render = () => {
        const max = display.maxScale();
        const info = display.getInfo();

        range.min = String(Math.min(1, max).toFixed(2));
        range.max = String(max.toFixed(2));
        range.value = String(info.scale);
        buildTicks(max);

        display.applyScale(info.scale);

        readout.textContent = info.isClean
            ? `${info.width}x${info.height}  ${info.scale.toFixed(2)}x  exacto (4K/${info.ratio})`
            : `${info.width}x${info.height}  ${info.scale.toFixed(2)}x  4K interpolado`;
        readout.dataset.crisp = info.isClean ? 'yes' : 'no';
    };

    range.addEventListener('input', () => {
        display.setScale(parseFloat(range.value));
        render();
    });

    crispBtn.addEventListener('click', () => {
        display.setCrisp();
        render();
    });

    fillBtn.addEventListener('click', () => {
        display.setFill();
        render();
    });

    display.onChange(() => render());
    window.addEventListener('resize', render);

    render();
}

async function boot() {
    try {
        await Promise.race([
            document.fonts.load('10px "Press Start 2P"').then(() => document.fonts.ready),
            new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
    } catch {
        // Offline or the face failed to load — start anyway.
    }
    installTextResolution();

    const game = new Phaser.Game(config);
    window.game = game;
    display.init(game);
    installSizeControl(game);
}

boot();
