import * as Phaser from 'phaser';
import { MANA_SPRITE } from '../data/ManaSprite.js';

/**
 * Text with the maná sprite inline.
 *
 * "Press Start 2P" has no glyph for ✦, so the browser draws it from some other
 * font — a different weight, a different size, sometimes a box. Strings keep
 * using ✦ as the token for "maná" (it reads fine in code and in data), and
 * this is what puts the real sprite in its place when the string is drawn.
 *
 * A Container of Text runs and Images, laid out left to right and line by
 * line. It answers the handful of Text methods the UI calls on these labels
 * (setText, setColor, setOrigin) so it can stand in for one.
 */
export const MANA_GLYPH = '✦';

export function hasManaGlyph(text) {
    return typeof text === 'string' && text.includes(MANA_GLYPH);
}

export class IconText extends Phaser.GameObjects.Container {
    /**
     * @param style      a Text style; `fontSize` and `lineSpacing` drive the layout
     * @param opts.wrap  wrap at this many characters (the font is monospaced)
     * @param opts.align 'left' | 'center' for multi-line text
     */
    constructor(scene, x, y, text, style, opts = {}) {
        super(scene, x, y);
        this.textStyle = { ...style };
        this.wrap = opts.wrap ?? 0;
        this.align = opts.align ?? style.align ?? 'left';
        this.ox = 0;
        this.oy = 0;
        this.content = '';
        scene.add.existing(this);
        this.setText(text);
    }

    get fontPx() {
        return parseFloat(this.textStyle.fontSize) || 8;
    }

    setText(text) {
        text = String(text ?? '');
        if (text === this.content && this.list.length) return this;
        this.content = text;
        this._build();
        return this;
    }

    setColor(color) {
        this.textStyle.color = color;
        for (const child of this.list) if (child.setColor) child.setColor(color);
        return this;
    }

    setOrigin(ox, oy = ox) {
        this.ox = ox;
        this.oy = oy;
        this._layout();
        return this;
    }

    /** Greedy word wrap by character count; the icon is counted as two. */
    _lines() {
        const raw = this.content.split('\n');
        if (!this.wrap) return raw;
        const out = [];
        for (const para of raw) {
            let line = '';
            for (const word of para.split(' ')) {
                const len = (s) => s.length + (s.split(MANA_GLYPH).length - 1);
                const next = line ? `${line} ${word}` : word;
                if (line && len(next) > this.wrap) {
                    out.push(line);
                    line = word;
                } else {
                    line = next;
                }
            }
            out.push(line);
        }
        return out;
    }

    _build() {
        this.removeAll(true);
        const style = { ...this.textStyle };
        delete style.align;
        delete style.wordWrap;
        delete style.padding;
        delete style.backgroundColor;
        // The icon stands a little taller than a capital, like the HUD's.
        const iconH = Math.round(this.fontPx * 1.6);
        const iconScale = iconH / MANA_SPRITE.height;
        this.rows = this._lines().map((line) => {
            const parts = [];
            line.split(MANA_GLYPH).forEach((chunk, i) => {
                if (i > 0) {
                    const icon = this.scene.add.image(0, 0, MANA_SPRITE.key)
                        .setScale(iconScale).setOrigin(0, 0.5);
                    parts.push({ obj: icon, w: Math.round(MANA_SPRITE.width * iconScale) + 1 });
                }
                if (chunk) {
                    const t = this.scene.add.text(0, 0, chunk, style).setOrigin(0, 0.5);
                    parts.push({ obj: t, w: t.width });
                }
            });
            for (const p of parts) this.add(p.obj);
            return { parts, w: parts.reduce((s, p) => s + p.w, 0) };
        });
        this._layout();
    }

    _layout() {
        if (!this.rows) return;
        const lineH = this.fontPx + (this.textStyle.lineSpacing ?? 0) + 2;
        const w = Math.max(0, ...this.rows.map(r => r.w));
        const h = this.rows.length * lineH;
        const x0 = -w * this.ox;
        const y0 = -h * this.oy + lineH / 2;
        this.rows.forEach((row, i) => {
            let x = x0 + (this.align === 'center' ? (w - row.w) / 2 : 0);
            for (const p of row.parts) {
                p.obj.setPosition(Math.round(x), Math.round(y0 + i * lineH));
                x += p.w;
            }
        });
        this.setSize(w, h);
    }
}
