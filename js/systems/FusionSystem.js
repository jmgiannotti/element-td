import * as Phaser from 'phaser';
import { FUSION_MAP, TOWER_DATA } from '../data/TowerData.js';
import { TEMPLE_DATA } from '../data/TempleData.js';
import { Tower } from '../entities/Tower.js';
import { Temple } from '../entities/Temple.js';
import { audio } from './AudioSystem.js';

/**
 * Fusion: which buildings can merge, and the drag that merges them.
 *
 * ── Why dragging, and not a badge ────────────────────────
 * This used to offer fusions by itself. It walked the building list, claimed the
 * first compatible pair it found, and put a clickable badge on the seam between
 * them. With two towers that is the same thing as asking. With four in a row it
 * is not: the pairing was decided by build order, and the player who wanted to
 * merge the third and fourth had to sell one to break the offer up. The system
 * was making the interesting decision and handing back the boring one.
 *
 * So the offer became a hint and the choice became a gesture. Any building with
 * a compatible neighbour glows — that is all this system claims to know. Which
 * two of them merge is answered by picking one up and dropping it on the other,
 * which is also the only question the player was ever really being asked.
 *
 * ── What the gesture keeps from the old rules ────────────
 * Adjacency, unchanged: you can only drop onto one of the four cells touching
 * the one you lifted from. The drag chooses a partner, it does not carry a tower
 * across the board. Everything else — the elemental table, the combined refund,
 * one fusion per building — is the same as it was.
 *
 * ── One thing it changes on purpose ──────────────────────
 * The hybrid now appears on the cell you dropped ONTO, not on the first of the
 * pair. With a badge there was no way to say which tile you wanted to keep; with
 * a drag the answer is already in the gesture, and on a maze that tile matters.
 */

// How far the pointer has to travel before a press becomes a drag. Below this
// the press is still a click, which is what keeps tapping a tower to read its
// stats from turning into a fumbled fusion.
const DRAG_THRESHOLD = 6;

// How hard the ghost chases the cursor, per 60fps frame. Deliberately not 1:
// a sprite welded to the pointer reads as a cursor graphic, while one that
// arrives a moment later reads as something with weight being carried.
const FOLLOW = 0.34;

// Radians of lean per world pixel of horizontal speed, and the cap. This is the
// whole "fluid" budget — it costs one multiply and does more for the feel of the
// drag than the position lerp does.
const TILT_PER_PX = 0.016;
const TILT_MAX = 0.22;

const GHOST_SCALE = 1.18;

export class FusionSystem {
    constructor(scene) {
        this.scene = scene;
        /** Structures currently lit as "this one has a partner nearby". */
        this.hinted = [];
        /** Links connecting pairs of fusable buildings. */
        this.links = [];
        this.linkGfx = scene.add.graphics().setDepth(2);
        this.pulsePhase = 0;
        /** Non-null only between a press on a fusable building and its release. */
        this._press = null;
        /** Non-null only while an actual drag is in flight. */
        this._drag = null;
        this._justDragged = false;
    }

    get dragging() { return !!this._drag; }

    /**
     * True from the moment a drag resolves until the next press.
     *
     * Anything that acts on a release has to ask: a release that ended a drag is
     * spent, and the handlers hanging off a building's own sprite cannot rely on
     * running before the scene clears `_drag`.
     */
    get justDragged() { return this._justDragged; }

    // ─── Offers ─────────────────────────────────────────
    /**
     * Recompute the hints. Cheap enough to call on any change: the lists are a
     * handful of buildings, and rebuilding from scratch means a highlight can
     * never outlive the neighbour that justified it.
     *
     * Connects all compatible neighbouring towers/temples with glowing lines on the floor.
     */
    refresh(silent = false) {
        this.clearHints();

        const seenPairs = new Set();

        for (const list of [this.scene.temples, this.scene.towers]) {
            for (const b of list) {
                if (!this._fusable(b)) continue;
                const partners = this._partners(b, list);
                if (partners.length === 0) continue;
                b.setFusionHint(true);
                this.hinted.push(b);

                for (const p of partners) {
                    const other = p.other;
                    const pairKey = b.col < other.col || (b.col === other.col && b.row < other.row)
                        ? `${b.col},${b.row}-${other.col},${other.row}`
                        : `${other.col},${other.row}-${b.col},${b.row}`;
                    if (!seenPairs.has(pairKey)) {
                        seenPairs.add(pairKey);
                        this.links.push({
                            b1: b,
                            b2: other,
                            result: p.result,
                            kind: this._kindOf(b),
                        });
                    }
                }
            }
        }

        this._redrawLinks();

        if (!silent && this.links.length > 0) {
            this.scene.events.emit('fusion-available', this.links[0]);
        }
    }

    clearHints() {
        for (const b of this.hinted) {
            if (b.alive) b.setFusionHint(false);
        }
        this.hinted = [];
        this.links = [];
        if (this.linkGfx) this.linkGfx.clear();
    }

    _redrawLinks() {
        if (!this.linkGfx) return;
        this.linkGfx.clear();
        if (!this.links || this.links.length === 0) return;

        const pulse = 0.78 + 0.22 * Math.sin(this.pulsePhase || 0);

        for (const link of this.links) {
            if (!link.b1.alive || !link.b2.alive) continue;
            const x1 = link.b1.x;
            const y1 = link.b1.y;
            const x2 = link.b2.x;
            const y2 = link.b2.y;

            const resData = link.kind === 'temple' ? TEMPLE_DATA[link.result] : TOWER_DATA[link.result];
            const color = resData ? resData.color : 0xFFD54F;

            // 1. Broad soft ambient glow on floor
            this.linkGfx.lineStyle(8, color, 0.22 * pulse);
            this.linkGfx.strokeLineShape(new Phaser.Geom.Line(x1, y1, x2, y2));

            // 2. Focused fusion color beam
            this.linkGfx.lineStyle(4, color, 0.65 * pulse);
            this.linkGfx.strokeLineShape(new Phaser.Geom.Line(x1, y1, x2, y2));

            // 3. Bright golden/white core line
            this.linkGfx.lineStyle(1.5, 0xFFFFFF, 0.95 * pulse);
            this.linkGfx.strokeLineShape(new Phaser.Geom.Line(x1, y1, x2, y2));

            // 4. Energy node pads on the floor beneath both towers
            this.linkGfx.fillStyle(color, 0.35 * pulse);
            this.linkGfx.fillCircle(x1, y1, 8);
            this.linkGfx.fillCircle(x2, y2, 8);

            this.linkGfx.lineStyle(1.5, 0xFFD54F, 0.8 * pulse);
            this.linkGfx.strokeCircle(x1, y1, 8);
            this.linkGfx.strokeCircle(x2, y2, 8);

            this.linkGfx.fillStyle(0xFFFFFF, 0.9 * pulse);
            this.linkGfx.fillCircle(x1, y1, 3);
            this.linkGfx.fillCircle(x2, y2, 3);

            // 5. Flowing energy particle along the floor line
            const t = (((this.pulsePhase * 0.45) % 1) + 1) % 1;
            const px = Phaser.Math.Linear(x1, x2, t);
            const py = Phaser.Math.Linear(y1, y2, t);
            this.linkGfx.fillStyle(0xFFFFFF, 0.95 * pulse);
            this.linkGfx.fillCircle(px, py, 2.5);
            this.linkGfx.fillStyle(color, 0.5 * pulse);
            this.linkGfx.fillCircle(px, py, 4.5);
        }
    }

    _fusable(b) {
        return b && b.alive && !b.isHybrid;
    }

    /** The list a building belongs to, which is also the list it can fuse within. */
    _listOf(b) {
        return this.scene.temples.includes(b) ? this.scene.temples : this.scene.towers;
    }

    _kindOf(b) {
        return this.scene.temples.includes(b) ? 'temple' : 'tower';
    }

    /** What `a` and `b` would become, or null if they would become nothing. */
    resultOf(a, b) {
        if (!this._fusable(a) || !this._fusable(b) || a === b) return null;
        // Sorted so the lookup key is the same whichever one you picked up
        return FUSION_MAP[[a.element, b.element].sort().join('+')] ?? null;
    }

    /** Every neighbour of `b` it could merge with. Four cells, never more. */
    _partners(b, list = this._listOf(b)) {
        const out = [];
        for (const cell of this.scene.gridSystem.getAdjacentCells(b.col, b.row)) {
            const other = list.find(o => o.col === cell.col && o.row === cell.row && o.alive);
            if (!other) continue;
            const result = this.resultOf(b, other);
            if (result) out.push({ other, result });
        }
        return out;
    }

    // ─── The gesture ────────────────────────────────────
    /**
     * A press landed. Remembers it as a possible drag without committing to one:
     * whether this was a click or a lift is not knowable until the pointer moves,
     * and guessing wrong either way breaks the other gesture.
     */
    onPointerDown(world) {
        this._press = null;
        this._justDragged = false;
        if (this._drag) return;

        const scene = this.scene;
        // Every cursor mode owns the click while it is armed. Building beside a
        // tower must not pick the tower up.
        if (scene.placementMode || scene.sellMode || scene.spellMode || scene.uiModalOpen) return;

        const b = this._structureAt(world);
        if (!this._fusable(b) || this._partners(b).length === 0) return;

        this._press = { b, x: world.x, y: world.y };
    }

    /** Pointer moved. Starts the drag once it has travelled far enough. */
    onPointerMove(world) {
        if (this._drag) {
            this._drag.to = { x: world.x, y: world.y };
            this._aim(world);
            return;
        }
        if (!this._press) return;

        // pointermove fires while hovering too. Without this, a press that was
        // already resolved somewhere else — an aborted drag, a release the
        // canvas never saw — would leave a live candidate that the next idle
        // mouse movement picks a tower up with, no button held.
        if (!this.scene.input.activePointer.isDown) { this._press = null; return; }

        const moved = Phaser.Math.Distance.Between(this._press.x, this._press.y, world.x, world.y);
        if (moved >= DRAG_THRESHOLD) this._begin(this._press.b, world);
    }

    /**
     * Pointer released. Returns true when it resolved a drag, so the caller
     * knows the release was spent and must not also treat it as a click.
     */
    onPointerUp(world) {
        this._press = null;
        if (!this._drag) return false;
        this._finish(world);
        return true;
    }

    /** The building under a world point, tower or temple. */
    _structureAt(world) {
        const { col, row } = this.scene.gridSystem.worldToGrid(world.x, world.y);
        return this.scene.towers.find(t => t.alive && t.col === col && t.row === row)
            ?? this.scene.temples.find(t => t.alive && t.col === col && t.row === row)
            ?? null;
    }

    // ─── Drag lifecycle ─────────────────────────────────
    _begin(b, world) {
        const scene = this.scene;
        // The press has become a drag; it must not be able to start a second one.
        this._press = null;
        this.scene.events.emit('fusion-drag-begin');

        // The inspection card would otherwise hang over the board for the whole
        // drag, describing a tower the player is in the middle of spending.
        if (scene.selectStructure) scene.selectStructure(null);

        const targets = this._partners(b).map(p => ({
            ...p,
            ring: this._targetRing(p.other, p.result, this._kindOf(b)),
        }));

        // A copy in hand, and the original left faded where it stands. The
        // original keeps firing: this is a gesture over the board, not a pause
        // in the game, and a tower that stops shooting because you touched it
        // would be a real cost for a cosmetic one.
        const ghost = scene.add.image(b.x, b.y, b.sprite.texture.key)
            .setDepth(40)
            .setScale(1)
            .setAlpha(0.96);
        const shadow = scene.add.ellipse(b.x, b.y + 13, 22, 8, 0x000000, 0.3).setDepth(39);

        scene.tweens.add({
            targets: ghost, scale: GHOST_SCALE, duration: 140, ease: 'Back.easeOut',
        });
        b.sprite.setAlpha(0.3);

        // The socket left behind, so the way back is visible the whole time
        const socket = scene.add.circle(b.x, b.y, 13, 0xFFD54F, 0.06)
            .setStrokeStyle(1, 0xFFD54F, 0.45)
            .setDepth(2);

        this._drag = {
            b, ghost, shadow, socket, targets,
            to: { x: world.x, y: world.y },
            prevX: b.x,
            hover: null,
        };

        audio.play('click');
    }

    /** A pulsing ring on a cell this drag could be dropped on. */
    _targetRing(other, result, kind) {
        const data = kind === 'temple' ? TEMPLE_DATA[result] : TOWER_DATA[result];
        const ring = this.scene.add.circle(other.x, other.y, 15, data.color, 0.12)
            .setStrokeStyle(2, data.color, 0.85)
            .setDepth(3);

        this.scene.tweens.add({
            targets: ring,
            scaleX: 1.14, scaleY: 1.14,
            duration: 520,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        return ring;
    }

    /**
     * Work out which target, if any, the pointer is over, and say what taking it
     * would give — the same before/after card the badge used to answer on hover.
     */
    _aim(world) {
        const d = this._drag;
        const over = this._structureAt(world);
        const match = d.targets.find(t => t.other === over) ?? null;
        if (match === d.hover) return;

        if (d.hover) {
            d.hover.other.sprite.setScale(1);
            this.scene.events.emit('fusion-hover', null);
        }

        d.hover = match;
        if (!match) return;

        this.scene.tweens.add({
            targets: match.other.sprite, scale: 1.12, duration: 120, ease: 'Quad.easeOut',
        });
        this.scene.events.emit('fusion-hover', {
            b1: d.b, b2: match.other, result: match.result,
            kind: this._kindOf(d.b), x: match.other.x, y: match.other.y,
        });
    }

    /**
     * Per-frame follow. Lives here rather than in the pointermove handler because
     * the ghost keeps easing toward the cursor between moves — that trailing is
     * most of what makes the drag feel like it has weight, and a handler that
     * only fires when the mouse moves cannot produce it.
     */
    update(delta) {
        this.pulsePhase = (this.pulsePhase || 0) + (delta || 16) * 0.0035;
        if (this.links && this.links.length > 0) {
            this._redrawLinks();
        }

        const d = this._drag;
        if (!d) return;

        // A release the canvas never saw — window lost focus mid-drag, say —
        // would otherwise leave a ghost stuck to the cursor forever.
        if (!this.scene.input.activePointer.isDown) { this._finish(d.to); return; }
        if (!d.b.alive) { this._cancel(); return; }

        // Magnetised: over a valid partner the ghost settles onto that tile
        // instead of the cursor, so the drop lines up before the release.
        const aim = d.hover ? { x: d.hover.other.x, y: d.hover.other.y } : d.to;

        // Frame-rate independent easing — the same pull at 30fps and at 144.
        const k = 1 - Math.pow(1 - FOLLOW, Math.min(delta, 50) / 16.67);
        d.ghost.x += (aim.x - d.ghost.x) * k;
        d.ghost.y += (aim.y - d.ghost.y) * k;

        d.ghost.rotation = Phaser.Math.Clamp(
            (d.ghost.x - d.prevX) * TILT_PER_PX, -TILT_MAX, TILT_MAX
        );
        d.prevX = d.ghost.x;

        d.shadow.x = d.ghost.x;
        d.shadow.y = d.ghost.y + 13;
    }

    /** Release resolved: either a fusion, or the tower goes back where it was. */
    _finish(world) {
        const d = this._drag;
        if (!d) return;
        this._justDragged = true;

        // Trust the pointer over the hover cache: a release can land on a frame
        // where the last move event was somewhere else.
        const over = this._structureAt(world);
        const match = d.targets.find(t => t.other === over) ?? d.hover;

        if (!match) { this._cancel(); return; }

        const { b, ghost } = d;
        const target = match.other;
        const result = match.result;
        const kind = this._kindOf(b);

        this._teardown({ keepGhost: true });

        // The last 90ms is the ghost slamming home. Without it the two towers
        // simply become a third one and the merge reads as a texture swap.
        this.scene.tweens.add({
            targets: ghost,
            x: target.x, y: target.y,
            scale: 0.75,
            rotation: 0,
            duration: this._uiMs(90),
            ease: 'Quad.easeIn',
        });

        // The merge itself is committed on the clock, not on that tween. The
        // slam is decoration; consuming two buildings the player paid for is
        // not, and it must not be able to go missing because a tween did.
        this.scene.time.delayedCall(90, () => {
            if (ghost.active) ghost.destroy();
            if (!b.alive || !target.alive) return;
            this._executeFusion(b, target, result, kind);
        });
    }

    /**
     * A tween duration for the drag, in real milliseconds.
     *
     * The gesture belongs to the cursor, not to the board, so it should feel
     * identical at VEL 1x and 2x — but its commit rides `scene.time`, which VEL
     * does scale. Dividing here keeps the two in step at any speed.
     */
    _uiMs(ms) {
        return ms / (this.scene.time.timeScale || 1);
    }

    /** No valid drop: put it back, with enough spring that the trip reads. */
    _cancel() {
        const d = this._drag;
        if (!d) return;
        this._justDragged = true;
        const { b, ghost } = d;
        this._teardown({ keepGhost: true });

        this.scene.tweens.add({
            targets: ghost,
            x: b.alive ? b.x : ghost.x,
            y: b.alive ? b.y : ghost.y,
            scale: 1,
            rotation: 0,
            duration: this._uiMs(220),
            ease: 'Back.easeOut',
        });
        // Same reasoning as the slam: the tween moves it, the clock disposes of
        // it. A ghost that outlives its tween is a sprite stuck to the board.
        this.scene.time.delayedCall(230, () => { if (ghost.active) ghost.destroy(); });
    }

    /** Everything a drag put on screen except the ghost, which the caller flies out. */
    _teardown({ keepGhost = false } = {}) {
        const d = this._drag;
        if (!d) return;
        this._drag = null;

        if (d.b.alive) d.b.sprite.setAlpha(1);
        if (d.hover && d.hover.other.alive) d.hover.other.sprite.setScale(1);
        this.scene.events.emit('fusion-hover', null);

        d.socket.destroy();
        d.shadow.destroy();
        for (const t of d.targets) t.ring.destroy();
        if (!keepGhost) d.ghost.destroy();
    }

    /** Drops a drag on the floor without resolving it — used when the board changes. */
    abortDrag() {
        if (this._drag) this._cancel();
        this._press = null;
    }

    // ─── Committing ─────────────────────────────────────
    /**
     * `dragged` is consumed and `target` is replaced by the hybrid, so the result
     * lands on the tile the player dropped onto and the tile they lifted from is
     * the one that frees up.
     */
    _executeFusion(dragged, target, resultElement, kind) {
        const col = target.col;
        const row = target.row;
        // The hybrid inherits both bills, so selling it later returns a cut of
        // everything that went into it rather than of a list price it never had.
        const paid = (dragged.paidCost ?? 0) + (target.paidCost ?? 0);

        dragged.destroy();
        target.destroy();

        const scene = this.scene;
        scene.occupiedCells.delete(`${dragged.col},${dragged.row}`);

        if (kind === 'temple') {
            scene.temples = scene.temples.filter(t => t !== dragged && t !== target);
            scene.temples.push(new Temple(scene, col, row, resultElement, paid));
        } else {
            scene.towers = scene.towers.filter(t => t !== dragged && t !== target);
            scene.towers.push(new Tower(scene, col, row, resultElement, paid));
        }

        // VFX – expanding flash
        const pos = scene.gridSystem.gridToWorld(col, row);
        const flash = scene.add.circle(pos.x, pos.y, 10, 0xFFD700, 0.9);
        flash.setDepth(30);
        scene.tweens.add({
            targets: flash,
            radius: 60,
            scaleX: 3,
            scaleY: 3,
            alpha: 0,
            duration: 400,
            ease: 'Quad.easeOut',
            onComplete: () => flash.destroy(),
        });

        // Taking one pair can create or invalidate others — the hybrid that just
        // appeared cannot fuse again, and the tile it came from is now free.
        this.refresh();
        scene.events.emit('fusion-complete', resultElement, kind);
    }

    destroy() {
        this.clearHints();
        if (this.linkGfx) {
            this.linkGfx.destroy();
            this.linkGfx = null;
        }
    }
}
