import { EFFECT, EFFECT_ICON, EFFECT_COLOR } from '../data/Elements.js';
import { IconText, hasInlineGlyph } from './IconText.js';

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
 * Damage carries its own pixel-art arrow sprite — icon_effective_up (▲) for a
 * hit that found a weakness, icon_resist_down (▼) for one that met a resistance
 * — so the elemental system is legible without relying on colour alone.
 */
export class FloatingText {
    constructor(scene) {
        this.scene = scene;
        this.pool = [];
        this.iconPool = [];
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

    _obtainIcon(textureKey) {
        const img = this.iconPool.pop();
        if (img) return img.setTexture(textureKey).setActive(true).setVisible(true).setAlpha(1);
        return this.scene.add.image(0, 0, textureKey).setOrigin(0.5).setDepth(40);
    }

    _releaseIcon(img) {
        img.setActive(false).setVisible(false).setAlpha(1).setScale(1);
        if (this.iconPool.length < POOL_MAX) this.iconPool.push(img);
        else img.destroy();
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

        if (hasInlineGlyph(text)) return this._showWithIcon(x, y, text, { color, size, rise, duration });

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

    /** Like show(), for text with inline sprites (✦ / ▲ / ▼). Not pooled — it is rare. */
    _showWithIcon(x, y, text, { color, size, rise, duration }) {
        this.live++;
        const t = new IconText(this.scene, x, y, text, {
            fontFamily: '"Press Start 2P"', fontSize: `${size}px`, color,
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(40);
        this.scene.tweens.add({
            targets: t,
            y: y - rise,
            alpha: 0,
            duration,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.live--;
                t.destroy();
            },
        });
        return t;
    }

    /**
     * A hit. The arrow sprite and the colour say the same thing twice on purpose,
     * and a super-effective hit is drawn a size larger so it also reads by weight.
     */
    damage(x, y, amount, effect = EFFECT.NORMAL) {
        const n = Math.max(1, Math.round(amount));
        const iconKey = EFFECT_ICON[effect];
        const size = effect === EFFECT.SUPER ? 10 : 8;
        const rise = effect === EFFECT.NORMAL ? 20 : 26;
        const color = EFFECT_COLOR[effect];

        if (!iconKey) {
            return this.show(x, y, `${n}`, { color, size, rise, jitter: 12 });
        }

        if (this.live >= LIVE_MAX) return null;

        const t = this._obtain();
        const icon = this._obtainIcon(iconKey);
        this.live++;

        const jx = (Math.random() - 0.5) * 12;
        const cx = x + jx;
        // 8×8 native at 8px, 10×10 (exact 5× screen texels at SUPER=4) for 10px super hits
        const iconScale = effect === EFFECT.SUPER ? 1.25 : 1;
        icon.setScale(iconScale);
        t.setFontSize(size).setColor(color).setText(`${n}`).setAlpha(1).setScale(1);

        const gap = 2;
        const iconW = icon.displayWidth;
        const totalW = iconW + gap + t.width;
        const left = cx - totalW / 2;

        icon.setPosition(Math.round(left + iconW / 2), Math.round(y));
        t.setPosition(Math.round(left + iconW + gap + t.width / 2), Math.round(y));

        this.scene.tweens.add({
            targets: [icon, t],
            y: y - rise,
            alpha: 0,
            duration: 620,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this._releaseIcon(icon);
                this._release(t);
            },
        });

        return t;
    }

    destroy() {
        for (const t of this.pool) t.destroy();
        for (const img of this.iconPool) img.destroy();
        this.pool = [];
        this.iconPool = [];
    }
}
