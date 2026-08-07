import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';

const config = {
    type: Phaser.AUTO,
    width: 920,      // 640 game + 280 sidebar
    height: 480,     // 15 rows × 32px
    parent: 'game-container',
    pixelArt: true,
    backgroundColor: '#1a1a2e',
    scene: [BootScene, GameScene, UIScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};

/**
 * Phaser measures a Text object once, at construction, and sizes its canvas to
 * that measurement. Boot before Press Start 2P has arrived and every label
 * created in a scene's create() is sized for the fallback font, then repainted
 * with wider glyphs that spill outside the canvas — which is why the longer
 * sidebar lines came out visibly crammed.
 *
 * A webfont is only fetched once something renders in it, so `fonts.ready`
 * alone can resolve before the request is even made: ask for the face first.
 * The race is there so a slow or blocked CDN degrades to the system font
 * instead of hanging on a black page.
 */
async function boot() {
    try {
        await Promise.race([
            document.fonts.load('10px "Press Start 2P"').then(() => document.fonts.ready),
            new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
    } catch {
        // Offline or the face failed to load — start anyway.
    }
    window.game = new Phaser.Game(config);
}

boot();
