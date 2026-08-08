import { EFFECT, EFFECT_MARK, EFFECT_COLOR } from '../data/Elements.js';

const FONT = '"Press Start 2P"';

// Twenty towers hitting a horde produces a lot of these, and a Text object is
// a canvas each. They are recycled rather than churned: the same handful of
// objects carries every number the game ever throws.
const POOL_MAX = 64;

// Beyond this many at once the numbers stop being information and become fog,
// so the surplus is simply dropped rather than queued.
const LIVE_MAX = 34;

/**
 * The numbers that fly off things when they are hit.
 *
 * Damage carries its own glyph — ▲ for a hit that found a weakness, ▼ for one
 * that met a resistance — so the elemental system is legible without relying on
 * telling gold apart from grey.
 */
export class FloatingText {
    constructor(scene) {
        this.scene = scene;
        this.pool = [];
        this.live = 0;
    }

    _obtain() {
        const t = this.pool.pop();
        if (t) return t.setActive(true).setVisible(true);

        return this.scene.add.text(0, 0, '', {
            fontFamily: FONT, fontSize: '8px',
            color: '#FFFFFF', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(40);
    }

    _release(t) {
        t.setActive(false).setVisible(false).setAlpha(1).setScale(1);
        if (this.pool.length < POOL_MAX) this.pool.push(t);
        else t.destroy();
        this.live--;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {string} text
     * @param {{color?: string, size?: number, rise?: number, duration?: number,
     *          scale?: number, jitter?: number}} [opts]
     */
    show(x, y, text, opts = {}) {
        if (this.live >= LIVE_MAX) return null;

        const {
            color = '#FFFFFF',
            size = 8,
            rise = 22,
            duration = 620,
            scale = 1,
            jitter = 0,
        } = opts;

        const t = this._obtain();
        this.live++;

        const jx = jitter ? (Math.random() - 0.5) * jitter : 0;
        t.setFontSize(size)
            .setColor(color)
            .setText(text)
            .setPosition(x + jx, y)
            .setAlpha(1)
            .setScale(scale);

        this.scene.tweens.add({
            targets: t,
            y: y - rise,
            alpha: 0,
            duration,
            ease: 'Quad.easeOut',
            onComplete: () => this._release(t),
        });

        return t;
    }

    /**
     * A hit. The mark and the colour say the same thing twice on purpose, and a
     * super-effective hit is drawn a size larger so it also reads by weight.
     */
    damage(x, y, amount, effect = EFFECT.NORMAL) {
        const n = Math.max(1, Math.round(amount));
        const mark = EFFECT_MARK[effect];
        return this.show(x, y, mark ? `${mark}${n}` : `${n}`, {
            color: EFFECT_COLOR[effect],
            size: effect === EFFECT.SUPER ? 10 : 8,
            rise: effect === EFFECT.NORMAL ? 20 : 26,
            jitter: 12,
        });
    }

    destroy() {
        for (const t of this.pool) t.destroy();
        this.pool = [];
    }
}
