import * as Phaser from 'phaser';
import { MANA_SPRITE } from '../data/ManaSprite.js';
import { EFFECTIVE_UP_SPRITE, RESIST_DOWN_SPRITE } from '../data/EffectivenessSprites.js';

/**
 * Text with inline pixel-art sprites (✦ maná, ▲ super effective, ▼ resisted).
 *
 * "Press Start 2P" has no glyphs for ✦, ▲ or ▼, so the browser would otherwise
 * draw them from a fallback font — a different weight, a different size, or a
 * missing box. Strings keep using ✦, ▲ and ▼ as readable tokens in code and
 * data, and IconText puts the real Aseprite sprites in their place when drawn.
 *
 * A Container of Text runs and Images, laid out left to right and line by
 * line. It answers the handful of Text methods the UI calls on these labels
 * (setText, setColor, setOrigin) so it can stand in for one.
 */
export const MANA_GLYPH = '✦';
export const SUPER_GLYPH = '▲';
export const RESIST_GLYPH = '▼';

const GLYPH_MAP = {
    [MANA_GLYPH]: { sprite: MANA_SPRITE, scaleFor: (px) => Math.round(px * 1.6) / MANA_SPRITE.height, pad: 1 },
    [SUPER_GLYPH]: { sprite: EFFECTIVE_UP_SPRITE, scaleFor: (px) => Math.max(8, Math.round(px)) / EFFECTIVE_UP_SPRITE.height, pad: 2 },
    [RESIST_GLYPH]: { sprite: RESIST_DOWN_SPRITE, scaleFor: (px) => Math.max(8, Math.round(px)) / RESIST_DOWN_SPRITE.height, pad: 2 },
};

const GLYPH_SPLIT_RE = /([✦▲▼])/g;
const GLYPH_TEST_RE = /[✦▲▼]/;

export function hasInlineGlyph(text) {
    return typeof text === 'string' && GLYPH_TEST_RE.test(text);
}

/** Backwards-compatible alias used across UI helpers for any inline sprite token. */
export function hasManaGlyph(text) {
    return hasInlineGlyph(text);
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

    /** Greedy word wrap by character count; each inline icon counts as two. */
    _lines() {
        const raw = this.content.split('\n');
        if (!this.wrap) return raw;
        const out = [];
        const len = (s) => {
            const icons = (s.match(GLYPH_SPLIT_RE) || []).length;
            return s.length + icons;
        };
        for (const para of raw) {
            let line = '';
            for (const word of para.split(' ')) {
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
        const px = this.fontPx;

        this.rows = this._lines().map((line) => {
            const parts = [];
            for (const token of line.split(GLYPH_SPLIT_RE)) {
                if (!token) continue;
                const def = GLYPH_MAP[token];
                if (def) {
                    const iconScale = def.scaleFor(px);
                    const icon = this.scene.add.image(0, 0, def.sprite.key)
                        .setScale(iconScale).setOrigin(0, 0.5);
                    parts.push({ obj: icon, w: Math.round(def.sprite.width * iconScale) + def.pad });
                } else {
                    const t = this.scene.add.text(0, 0, token, style).setOrigin(0, 0.5);
                    parts.push({ obj: t, w: t.width });
                }
            }
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
