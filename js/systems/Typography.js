import * as Phaser from 'phaser';
import { SUPER } from './Viewport.js';

/**
 * Makes every Text object in the game rasterise at the buffer's resolution.
 *
 * This is the fix for the complaint that the HTML size bar always looked sharp
 * while nothing inside the game did. The bar is a DOM node: the browser draws it
 * straight at the screen's own pixel density. A Phaser Text, by default, is
 * rasterised into a canvas exactly as many pixels tall as its font size — an
 * 8px label becomes an 8-pixel-tall bitmap — and then magnified to fill the
 * space it occupies. Eight pixels of detail is the ceiling no matter how large
 * it ends up on screen, which is why enlarging the game never made the letters
 * any better and why every scaling fix hit the same wall.
 *
 * `resolution` raises that ceiling: the glyphs are rasterised at SUPER times the
 * font size and the object's world size is left alone, so at a camera zoom of
 * SUPER the texture lands on the buffer one texel to one pixel. The letters get
 * real detail instead of magnified blocks.
 *
 * Note this deliberately does *not* apply to the sprites. Those are pixel art
 * and are meant to be magnified into blocks; only the type gains from density.
 */

let installed = false;

export function installTextResolution() {
    // Idempotent: a second call would wrap the wrapper and re-render every label
    // twice for nothing.
    if (installed) return;
    installed = true;

    // `scene.add.text` resolves to this method, so wrapping it covers every
    // label in the game — including ones added to containers, and any written
    // later. The alternative was passing `resolution` at sixty-odd call sites,
    // where the first one anybody forgot would silently go back to being blurry.
    const factory = Phaser.GameObjects.GameObjectFactory.prototype;
    const createText = factory.text;

    factory.text = function (x, y, content, style) {
        const text = createText.call(this, x, y, content, style);
        return text.setResolution(SUPER);
    };
}
