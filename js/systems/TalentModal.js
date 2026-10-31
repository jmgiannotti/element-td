import * as Phaser from 'phaser';
import { audio } from './AudioSystem.js';
import { SaveSystem } from './SaveSystem.js';
import { safeTexture } from './TextureGuard.js';
import {
    TALENTS, TALENT_ORDER, TALENT_BRANCHES, BRANCH_ORDER, TREE_COST,
    talentCost, talentRequirement,
} from '../data/TalentData.js';

const FONT = '"Press Start 2P"';

// Layout, in the 920×480 view. The tree on the left grows upward from
// Vesper's core; the selected talent's card sits on the right.
const BOX = { x: 50, y: 24, w: 820, h: 432 };
const COL_X = { marcial: 140, arcana: 280, arquitectura: 420 };
const TIER_Y = { 1: 306, 2: 228, 3: 150 };
const ROOT = { x: 280, y: 388 };
const NODE = 46;
const PANEL = { x: 520, y: 84, w: 332, h: 356 };

const DIM_LINE = 0x2a2a44;

/**
 * EL ARBOL DE VESPER: the talent tree's modal (TalentData, SaveSystem).
 *
 * Nine nodes in three branches joined by lines of energy: dark where nothing
 * flows yet, a faint branch-coloured line toward the next talent that can be
 * bought, and a bright line with sparks running up it between owned ones.
 * Clicking a node shows it on the card at the right, with its cost in
 * essences, what stands in the way, and the COMPRAR button. RESETEAR hands
 * every essence back after a second click to confirm.
 *
 * Every icon is a drawn texture (BootScene._generateTalentIcons): the font has
 * no glyphs for stars, locks or arrows.
 */
export class TalentModal {
    /**
     * @param {Phaser.Scene} scene
     * @param {{ depth?: number, onClose?: () => void }} opts — `depth` puts it
     *   above whatever opened it (the map selector sits at 99–100).
     */
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.opts = opts;
        this.state = SaveSystem.getTalentState();
        this.selected = this._defaultSelection();
        this.resetArmed = false;
        this.resetTimer = null;
        this.time = 0;
        this._build();
    }

    // ─── Building ───────────────────────────────────────
    _build() {
        const s = this.scene;
        const depth = this.opts.depth ?? 100;
        this.shade = s.add.rectangle(460, 240, 920, 480, 0x000000, 0.8).setDepth(depth - 1).setInteractive();
        this.c = s.add.container(0, 0).setDepth(depth);

        this.c.add(s.add.rectangle(BOX.x + BOX.w / 2, BOX.y + BOX.h / 2, BOX.w, BOX.h, 0x12122a, 0.98)
            .setStrokeStyle(2, 0xFFD54F));

        // ── Header ──────────────────────────────
        this.c.add(s.add.text(BOX.x + 22, BOX.y + 22, 'ARBOL DE TALENTOS', {
            fontFamily: FONT, fontSize: '11px', color: '#FFD54F', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0, 0.5));
        this.c.add(s.add.text(BOX.x + 22, BOX.y + 42, 'Cada estrella ganada en un mapa es una Esencia Arcana', {
            fontFamily: FONT, fontSize: '6px', color: '#78909C',
        }).setOrigin(0, 0.5));

        this.availText = s.add.text(BOX.x + BOX.w - 22, BOX.y + 22, '', {
            fontFamily: FONT, fontSize: '9px', color: '#FFD54F', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0.5);
        this.availIcon = s.add.image(0, BOX.y + 22, safeTexture(s, 'icon_essence', 'icon_coin'))
            .setOrigin(1, 0.5).setScale(1.6);
        this.totalsText = s.add.text(BOX.x + BOX.w - 22, BOX.y + 42, '', {
            fontFamily: FONT, fontSize: '6px', color: '#90A4AE',
        }).setOrigin(1, 0.5);
        this.c.add([this.availText, this.availIcon, this.totalsText]);

        // ── Branch headings ─────────────────────
        for (const b of BRANCH_ORDER) {
            const br = TALENT_BRANCHES[b];
            this.c.add(s.add.text(COL_X[b], 96, br.label, {
                fontFamily: FONT, fontSize: '8px', color: br.colorHex, stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0.5));
            this.c.add(s.add.text(COL_X[b], 110, br.blurb, {
                fontFamily: FONT, fontSize: '6px', color: '#6f7f99',
            }).setOrigin(0.5));
        }

        // ── Energy lines, under the nodes ───────
        this.linesG = s.add.graphics();
        this.c.add(this.linesG);

        // ── Root: Vesper's core ─────────────────
        this.rootGlow = s.add.circle(ROOT.x, ROOT.y, 20, 0xB388FF, 0.18);
        this.c.add(this.rootGlow);
        this.c.add(s.add.circle(ROOT.x, ROOT.y, 13, 0x1a1236).setStrokeStyle(2, 0xB388FF));
        this.c.add(s.add.image(ROOT.x, ROOT.y, safeTexture(s, 'icon_essence', 'icon_coin')).setScale(1.6));
        this.c.add(s.add.text(ROOT.x, ROOT.y + 24, 'VESPER', {
            fontFamily: FONT, fontSize: '6px', color: '#B388FF',
        }).setOrigin(0.5));

        // ── Nodes ───────────────────────────────
        this.nodes = {};
        for (const id of TALENT_ORDER) this._buildNode(id);

        this._buildPanel();

        this.c.add(s.add.text(BOX.x + 22, BOX.y + BOX.h - 16, 'CLICK: ELEGIR   ESC: VOLVER', {
            fontFamily: FONT, fontSize: '6px', color: '#546E7A',
        }).setOrigin(0, 0.5));

        this._onKey = (event) => { if (event.code === 'Escape') this.close(); };
        s.input.keyboard?.on('keydown', this._onKey);
        this._onUpdate = (_t, delta) => this._tick(delta);
        s.events.on('update', this._onUpdate);

        this._refresh();

        this.c.setAlpha(0);
        this.shade.setAlpha(0);
        s.tweens.add({ targets: [this.c, this.shade], alpha: 1, duration: 160 });
    }

    _buildNode(id) {
        const s = this.scene;
        const t = TALENTS[id];
        const br = TALENT_BRANCHES[t.branch];
        const x = COL_X[t.branch], y = TIER_Y[t.tier];

        const glow = s.add.rectangle(x, y, NODE + 12, NODE + 12, br.color, 0);
        const sel = s.add.rectangle(x, y, NODE + 8, NODE + 8, 0x000000, 0).setStrokeStyle(2, 0xFFD54F, 0);
        const bg = s.add.rectangle(x, y, NODE, NODE, 0x0d0d1c).setStrokeStyle(2, DIM_LINE)
            .setInteractive({ useHandCursor: true });
        const icon = s.add.image(x, y, safeTexture(s, t.icon, 'icon_essence')).setScale(3);

        // Cost beside the node, so the lines between tiers run clear: the
        // essence and a number.
        const costIcon = s.add.image(x + NODE / 2 + 6, y + NODE / 2 - 6, safeTexture(s, 'icon_essence', 'icon_coin'))
            .setOrigin(0, 0.5);
        const costText = s.add.text(x + NODE / 2 + 20, y + NODE / 2 - 6, String(talentCost(id)), {
            fontFamily: FONT, fontSize: '7px', color: '#FFD54F', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5);

        bg.on('pointerover', () => { if (this.selected !== id) sel.setStrokeStyle(2, 0x90CAF9, 0.6); });
        bg.on('pointerout', () => { if (this.selected !== id) sel.setStrokeStyle(2, 0xFFD54F, 0); });
        bg.on('pointerdown', (p) => {
            p.event?.stopPropagation();
            if (this.selected === id) return;
            audio.play('click');
            this.selected = id;
            this._disarmReset();
            this._refresh();
        });

        this.c.add([glow, sel, bg, icon, costIcon, costText]);
        this.nodes[id] = { x, y, glow, sel, bg, icon, costIcon, costText };
    }

    _buildPanel() {
        const s = this.scene;
        const { x, y, w, h } = PANEL;
        this.c.add(s.add.rectangle(x, y, w, h, 0x0d0d1c, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x22223a));
        this.pStrip = s.add.rectangle(x, y, w, 4, 0xFFD54F).setOrigin(0, 0);

        this.pFrame = s.add.rectangle(x + 36, y + 42, 50, 50, 0x12122a).setStrokeStyle(2, 0xFFD54F);
        this.pIcon = s.add.image(x + 36, y + 42, 'icon_essence').setScale(3);
        this.pName = s.add.text(x + 72, y + 30, '', {
            fontFamily: FONT, fontSize: '9px', color: '#FFFFFF', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5);
        this.pTag = s.add.text(x + 72, y + 50, '', {
            fontFamily: FONT, fontSize: '6px', color: '#FFD54F',
        }).setOrigin(0, 0.5);
        this.pDesc = s.add.text(x + 18, y + 84, '', {
            fontFamily: FONT, fontSize: '7px', color: '#ECEFF1', lineSpacing: 7,
            wordWrap: { width: w - 36 },
        });

        // Cost and state, as two rows of a table with dividers.
        const rowY = y + 196;
        this.c.add(s.add.rectangle(x + 16, rowY - 12, w - 32, 1, 0x3a3a55).setOrigin(0, 0));
        this.c.add(s.add.text(x + 18, rowY, 'COSTO', { fontFamily: FONT, fontSize: '7px', color: '#90A4AE' })
            .setOrigin(0, 0.5));
        this.pCost = s.add.text(x + w - 18, rowY, '', {
            fontFamily: FONT, fontSize: '8px', color: '#FFD54F',
        }).setOrigin(1, 0.5);
        this.pCostIcon = s.add.image(0, rowY, safeTexture(s, 'icon_essence', 'icon_coin')).setOrigin(1, 0.5);
        this.c.add(s.add.rectangle(x + 16, rowY + 12, w - 32, 1, 0x232a3d).setOrigin(0, 0));
        this.c.add(s.add.text(x + 18, rowY + 24, 'ESTADO', { fontFamily: FONT, fontSize: '7px', color: '#90A4AE' })
            .setOrigin(0, 0.5));
        this.pState = s.add.text(x + w - 18, rowY + 24, '', {
            fontFamily: FONT, fontSize: '7px', color: '#FFFFFF',
        }).setOrigin(1, 0.5);
        this.c.add(s.add.rectangle(x + 16, rowY + 36, w - 32, 1, 0x232a3d).setOrigin(0, 0));

        this.c.add([this.pStrip, this.pFrame, this.pIcon, this.pName, this.pTag, this.pDesc,
            this.pCost, this.pCostIcon, this.pState]);

        this.buyBtn = this._button(x + w / 2, y + 266, 220, 30, 'COMPRAR', 0x1f4a2a, 0x4CAF50, () => this._buy());
        this.resetBtn = this._button(x + 88, y + h - 26, 148, 28, 'RESETEAR', 0x4a1f1f, 0xEF5350, () => this._reset());
        this._button(x + w - 76, y + h - 26, 124, 28, 'VOLVER', 0x282848, 0x90CAF9, () => this.close());
    }

    /** A modal button: fill, border, label; lights up on hover unless disabled. */
    _button(x, y, w, h, label, fill, stroke, onClick) {
        const s = this.scene;
        const bg = s.add.rectangle(x, y, w, h, fill).setStrokeStyle(2, stroke).setInteractive({ useHandCursor: true });
        const txt = s.add.text(x, y, label, {
            fontFamily: FONT, fontSize: '8px', color: '#FFFFFF', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5);
        const btn = { bg, txt, fill, stroke, enabled: true };
        bg.on('pointerover', () => {
            if (!btn.enabled) return;
            bg.setStrokeStyle(2, 0xFFD54F);
            txt.setColor('#FFD54F');
        });
        bg.on('pointerout', () => {
            bg.setStrokeStyle(2, btn.enabled ? btn.stroke : 0x2a2a44);
            txt.setColor(btn.enabled ? '#FFFFFF' : '#546E7A');
        });
        bg.on('pointerdown', (p) => {
            p.event?.stopPropagation();
            if (!btn.enabled) {
                audio.play('deny');
                return;
            }
            onClick();
        });
        this.c.add([bg, txt]);
        return btn;
    }

    _setButton(btn, enabled, label = null, fill = btn.fill, stroke = btn.stroke) {
        btn.enabled = enabled;
        btn.fill = fill;
        btn.stroke = stroke;
        if (label != null) btn.txt.setText(label);
        btn.bg.setFillStyle(enabled ? fill : 0x1a1a2e);
        btn.bg.setStrokeStyle(2, enabled ? stroke : 0x2a2a44);
        btn.txt.setColor(enabled ? '#FFFFFF' : '#546E7A');
    }

    // ─── State ──────────────────────────────────────────
    /** The first talent that can be bought, else the first not owned, else the first. */
    _defaultSelection() {
        return TALENT_ORDER.find(id => !SaveSystem.talentRefusal(id, this.state))
            ?? TALENT_ORDER.find(id => !this.state.owned.includes(id))
            ?? TALENT_ORDER[0];
    }

    /** 'owned' | 'ready' | 'essence' (unlocked, too dear) | 'locked'. */
    _nodeState(id) {
        if (this.state.owned.includes(id)) return 'owned';
        const why = SaveSystem.talentRefusal(id, this.state);
        if (!why) return 'ready';
        return why === 'essence' ? 'essence' : 'locked';
    }

    _refresh() {
        const st = this.state;
        this.availText.setText(`${st.available} ${st.available === 1 ? 'ESENCIA' : 'ESENCIAS'}`);
        this.availIcon.setX(this.availText.x - this.availText.width - 6);
        this.totalsText.setText(`ESTRELLAS ${st.starsEarned}/${TREE_COST} · GASTADAS ${st.spent}`);

        for (const id of TALENT_ORDER) {
            const n = this.nodes[id];
            const br = TALENT_BRANCHES[TALENTS[id].branch];
            const ns = this._nodeState(id);
            const isSel = this.selected === id;
            n.bg.setFillStyle(ns === 'owned' ? Phaser.Display.Color.IntegerToColor(br.color).darken(62).color : 0x0d0d1c);
            n.bg.setStrokeStyle(2, ns === 'owned' ? br.color : ns === 'ready' ? 0xFFFFFF : ns === 'essence' ? 0x546E7A : DIM_LINE);
            n.icon.setAlpha(ns === 'owned' || ns === 'ready' ? 1 : ns === 'essence' ? 0.6 : 0.28);
            n.glow.setFillStyle(br.color, ns === 'owned' ? 0.16 : 0);
            n.sel.setStrokeStyle(2, 0xFFD54F, isSel ? 1 : 0);
            // Owned nodes no longer need a price.
            n.costText.setVisible(ns !== 'owned');
            n.costIcon.setVisible(ns !== 'owned');
            n.costText.setColor(ns === 'ready' ? '#FFD54F' : '#6f7f99');
            n.costIcon.setAlpha(ns === 'ready' ? 1 : 0.45);
        }

        this._refreshPanel();
        this._setButton(this.resetBtn, st.spent > 0, this.resetArmed ? '¿SEGURO?' : 'RESETEAR');
    }

    _refreshPanel() {
        const id = this.selected;
        const t = TALENTS[id];
        const br = TALENT_BRANCHES[t.branch];
        const ns = this._nodeState(id);
        const cost = talentCost(id);

        this.pStrip.setFillStyle(br.color);
        this.pFrame.setStrokeStyle(2, br.color);
        this.pIcon.setTexture(safeTexture(this.scene, t.icon, 'icon_essence'));
        this.pName.setText(t.name);
        this.pTag.setText(`${br.label} · NIVEL ${t.tier}`).setColor(br.colorHex);
        this.pDesc.setText(t.desc);

        this.pCost.setText(String(cost));
        this.pCostIcon.setX(this.pCost.x - this.pCost.width - 5);

        let state, color;
        if (ns === 'owned') { state = 'ADQUIRIDO'; color = br.colorHex; }
        else if (ns === 'ready') { state = 'DISPONIBLE'; color = '#7AD46A'; }
        else if (ns === 'essence') {
            const missing = cost - this.state.available;
            state = `FALTAN ${missing} ${missing === 1 ? 'ESENCIA' : 'ESENCIAS'}`;
            color = '#EF9A9A';
        } else {
            state = `REQUIERE ${TALENTS[talentRequirement(id)].name}`;
            color = '#EF9A9A';
        }
        this.pState.setText(state).setColor(color);

        this._setButton(this.buyBtn, ns === 'ready', ns === 'owned' ? 'YA ADQUIRIDO' : 'COMPRAR');
    }

    // ─── Actions ────────────────────────────────────────
    _buy() {
        const id = this.selected;
        const next = SaveSystem.buyTalent(id);
        if (!next) {
            audio.play('deny');
            return;
        }
        audio.play('upgrade');
        this.state = next;
        this._disarmReset();
        this._refresh();
        this._burst(this.nodes[id], TALENT_BRANCHES[TALENTS[id].branch].color);
    }

    /** First click arms it for 3 s; the second hands every essence back. */
    _reset() {
        if (!this.resetArmed) {
            audio.play('click');
            this.resetArmed = true;
            this._refresh();
            this.resetTimer = this.scene.time.delayedCall(3000, () => {
                this.resetTimer = null;
                this._disarmReset();
                if (this.c?.active) this._refresh();
            });
            return;
        }
        audio.play('sell');
        this.state = SaveSystem.resetTalents();
        this._disarmReset();
        this.selected = this._defaultSelection();
        this._refresh();
    }

    _disarmReset() {
        this.resetArmed = false;
        if (this.resetTimer) {
            this.resetTimer.remove(false);
            this.resetTimer = null;
        }
    }

    /** A ring and a flash out of a node that was just bought. */
    _burst(n, color) {
        const s = this.scene;
        const { x, y } = n;
        const ring = s.add.rectangle(x, y, NODE, NODE, color, 0).setStrokeStyle(3, color, 1);
        const flash = s.add.rectangle(x, y, NODE, NODE, 0xFFFFFF, 0.6);
        this.c.add([ring, flash]);
        s.tweens.add({
            targets: ring, scaleX: 1.8, scaleY: 1.8, alpha: 0, duration: 420, ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
        });
        s.tweens.add({
            targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy(),
        });
        s.tweens.add({ targets: n.icon, scaleX: 3.6, scaleY: 3.6, duration: 120, yoyo: true });
    }

    // ─── Energy lines ───────────────────────────────────
    /** [from, to, fromOwned, toId] for every link: root → tier 1 → 2 → 3. */
    _links() {
        const links = [];
        for (const id of TALENT_ORDER) {
            const t = TALENTS[id];
            const req = talentRequirement(id);
            const from = req ? this.nodes[req] : ROOT;
            const fromOwned = req ? this.state.owned.includes(req) : true;
            links.push({ from, to: this.nodes[id], fromOwned, id, color: TALENT_BRANCHES[t.branch].color });
        }
        return links;
    }

    _tick(delta) {
        if (!this.linesG?.active) return;
        this.time += delta;
        const g = this.linesG;
        g.clear();
        const pulse = 0.5 + 0.5 * Math.sin(this.time / 260);

        for (const l of this._links()) {
            const toOwned = this.state.owned.includes(l.id);
            // Lines run between the nodes' edges, not their centres.
            const ax = l.from.x, ay = l.from.y - (l.from === ROOT ? 13 : NODE / 2);
            const bx = l.to.x, by = l.to.y + NODE / 2;
            if (l.fromOwned && toOwned) {
                // Energy flowing: a wide soft glow, a bright core, sparks rising.
                g.lineStyle(8, l.color, 0.12 + 0.08 * pulse);
                g.lineBetween(ax, ay, bx, by);
                g.lineStyle(3, l.color, 0.95);
                g.lineBetween(ax, ay, bx, by);
                g.lineStyle(1, 0xFFFFFF, 0.6);
                g.lineBetween(ax, ay, bx, by);
                for (let k = 0; k < 3; k++) {
                    const f = ((this.time / 900) + k / 3) % 1;
                    const px = ax + (bx - ax) * f, py = ay + (by - ay) * f;
                    g.fillStyle(0xFFFFFF, 0.9);
                    g.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
                    g.fillStyle(l.color, 0.5);
                    g.fillRect(Math.round(px) - 2, Math.round(py) - 2, 5, 5);
                }
            } else if (l.fromOwned) {
                // The next step: a faint line that breathes, dashed.
                this._dashed(g, ax, ay, bx, by, l.color, 0.25 + 0.3 * pulse);
            } else {
                g.lineStyle(2, DIM_LINE, 0.9);
                g.lineBetween(ax, ay, bx, by);
            }
        }

        // The selected node and the root breathe too.
        this.rootGlow?.setScale(1 + 0.12 * pulse);
        const ready = this.nodes[this.selected];
        if (ready && this._nodeState(this.selected) === 'ready') {
            ready.bg.setStrokeStyle(2, 0xFFFFFF, 0.55 + 0.45 * pulse);
        }
    }

    _dashed(g, ax, ay, bx, by, color, alpha) {
        const len = Math.hypot(bx - ax, by - ay);
        const dash = 6, gap = 5;
        const off = (this.time / 60) % (dash + gap);
        g.lineStyle(2, color, alpha);
        for (let d = -off; d < len; d += dash + gap) {
            const d0 = Math.max(0, d), d1 = Math.min(len, d + dash);
            if (d1 <= d0) continue;
            g.lineBetween(ax + (bx - ax) * (d0 / len), ay + (by - ay) * (d0 / len),
                ax + (bx - ax) * (d1 / len), ay + (by - ay) * (d1 / len));
        }
    }

    // ─── Closing ────────────────────────────────────────
    close() {
        if (!this.c) return;
        audio.play('click');
        this._disarmReset();
        this.scene.input.keyboard?.off('keydown', this._onKey);
        this.scene.events.off('update', this._onUpdate);
        this.c.destroy();
        this.shade.destroy();
        this.c = null;
        this.shade = null;
        this.opts.onClose?.();
    }
}
