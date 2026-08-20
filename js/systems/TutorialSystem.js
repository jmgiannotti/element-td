import { TEMPLE_BASE_COST } from '../data/TempleData.js';

/**
 * The one lesson the game cannot afford to leave implicit: there are two ways
 * to turn a mote of life force into maná, and they are not interchangeable.
 *
 * The hero drinks a mote raw and can reach anywhere; a temple refines it above
 * face value but only covers its own circle. A player who never learns the
 * difference either parks the hero forever or never builds a temple, and both
 * dead ends look like the game being broken rather than a choice being missed.
 *
 * So the tutorial is a sequence of two gates rather than a wall of text: pick
 * up one mote by hand, then buy the building that does it for you.
 */

export const TUTORIAL_STEP = {
    WAITING: 'waiting',   // no mote has dropped yet
    COLLECT: 'collect',   // walk the hero onto the highlighted mote
    TEMPLE: 'temple',     // buy and place the first temple
    DONE: 'done',
};

const COLLECT_TEXT = 'Un orbe de fuerza vital. Click derecho para mover al heroe encima y recogerlo.';
const TEMPLE_TEXT = `El heroe lo consume en crudo. Un Templo abre mejoras:\ncompra uno (${TEMPLE_BASE_COST} oro) y colocalo sobre el pasto.`;
const DONE_TEXT = 'El templo cosecha dentro de su circulo. Toca el templo para gastar ✦ en mejoras.';
const SKIP_TEXT = 'Ya tenes un templo cosechando. El heroe sirve para los orbes fuera de su alcance.';

export class TutorialSystem {
    constructor(scene) {
        this.scene = scene;
        this.active = true;
        this.step = TUTORIAL_STEP.WAITING;

        this.marker = null;
        this.arrow = null;
        this.targetMote = null;
        this.closeTimer = 0;

        this._onCollected = () => this._advanceToTemple();
        this._onTempleBuilt = () => this._advanceToDone();
        this._onSkip = () => this.finish(true);

        scene.events.on('hero-collected', this._onCollected);
        scene.events.on('temple-built', this._onTempleBuilt);
        scene.events.on('tutorial-skip', this._onSkip);
    }

    // ─── Step transitions ───────────────────────────────
    _say(text, highlight = null) {
        this.scene.events.emit('tutorial-step', text, highlight);
    }

    _beginCollect(mote) {
        this.step = TUTORIAL_STEP.COLLECT;
        this.targetMote = mote;
        this._buildMarker();
        this._say(COLLECT_TEXT);
    }

    _advanceToTemple() {
        if (!this.active) return;
        // WAITING counts as well as COLLECT: the hero starts mid-board and a
        // mote can drop straight into his pickup radius, so he sometimes drinks
        // the first one before the lesson has finished asking him to. Either
        // way the player has now seen manual collection happen, which is the
        // only thing the first gate was there to establish.
        if (this.step !== TUTORIAL_STEP.COLLECT && this.step !== TUTORIAL_STEP.WAITING) return;
        this.step = TUTORIAL_STEP.TEMPLE;
        this._clearMarker();
        this._say(TEMPLE_TEXT, 'temples');
    }

    _advanceToDone() {
        if (!this.active) return;
        if (this.step !== TUTORIAL_STEP.TEMPLE && this.step !== TUTORIAL_STEP.COLLECT) return;
        this.step = TUTORIAL_STEP.DONE;
        this._clearMarker();
        this._say(DONE_TEXT);
        this.closeTimer = 6000;
    }

    /** Tears everything down. `silent` skips the closing line. */
    finish(silent = false) {
        if (!this.active) return;
        this.active = false;
        this.step = TUTORIAL_STEP.DONE;
        this._clearMarker();
        this.scene.events.off('hero-collected', this._onCollected);
        this.scene.events.off('temple-built', this._onTempleBuilt);
        this.scene.events.off('tutorial-skip', this._onSkip);
        this.scene.events.emit('tutorial-step', null, null);
        if (!silent) this.scene.events.emit('tutorial-done');
    }

    // ─── Mote highlight ─────────────────────────────────
    /**
     * Points at `this.targetMote`. Only the visuals are torn down first — the
     * target itself is the caller's to set, and clearing it here would leave
     * this with nothing to point at.
     */
    _buildMarker() {
        this._clearVisuals();
        const mote = this.targetMote;
        if (!mote || !mote.sprite) return;

        this.marker = this.scene.add.circle(mote.sprite.x, mote.sprite.y, 13, 0xB388FF, 0.12);
        this.marker.setStrokeStyle(2, 0xB388FF, 0.9).setDepth(9);
        this.scene.tweens.add({
            targets: this.marker,
            scaleX: 1.7, scaleY: 1.7,
            alpha: 0.25,
            duration: 620,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // The arrow's bob is driven from update() rather than by a tween: the
        // mote it points at drifts and bobs itself, and a tween owning `y`
        // would fight that and slide the arrow off its target.
        this.arrowPhase = 0;
        this.arrow = this.scene.add.text(mote.sprite.x, mote.sprite.y - 26, '▼', {
            fontFamily: '"Press Start 2P"', fontSize: '8px',
            color: '#B388FF', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(29);
    }

    _clearVisuals() {
        if (this.marker) {
            this.scene.tweens.killTweensOf(this.marker);
            this.marker.destroy();
            this.marker = null;
        }
        if (this.arrow) {
            this.scene.tweens.killTweensOf(this.arrow);
            this.arrow.destroy();
            this.arrow = null;
        }
    }

    /** Stop pointing at anything at all. */
    _clearMarker() {
        this._clearVisuals();
        this.targetMote = null;
    }

    /** First mote nobody is already hoovering up, or null. */
    _findFreeMote() {
        for (const m of this.scene.manaMotes) {
            if (m.alive && !m.collecting && m.sprite) return m;
        }
        return null;
    }

    // ─── Loop ───────────────────────────────────────────
    update(_time, delta) {
        if (!this.active) return;

        if (this.step === TUTORIAL_STEP.WAITING) {
            const mote = this._findFreeMote();
            if (!mote) return;

            // A player who already built a temple has answered the question the
            // lesson was going to ask, and the temple is about to drink this
            // mote anyway — telling them to go fetch it would be a lie.
            if (this.scene.temples.length > 0) {
                this._say(SKIP_TEXT);
                this.step = TUTORIAL_STEP.DONE;
                this.closeTimer = 6000;
                return;
            }
            this._beginCollect(mote);
            return;
        }

        if (this.step === TUTORIAL_STEP.COLLECT) {
            // Motes expire on their own. If the highlighted one evaporates the
            // marker moves to the next, rather than pointing at nothing.
            if (!this.targetMote || !this.targetMote.alive || this.targetMote.collecting) {
                const next = this._findFreeMote();
                if (next) {
                    this.targetMote = next;
                    this._buildMarker();
                } else {
                    this._clearMarker();
                }
                return;
            }
            const s = this.targetMote.sprite;
            if (this.marker) this.marker.setPosition(s.x, s.y);
            if (this.arrow) {
                this.arrowPhase += delta / 1000;
                this.arrow.setPosition(s.x, s.y - 24 - Math.abs(Math.sin(this.arrowPhase * 3.4)) * 5);
            }
            return;
        }

        if (this.step === TUTORIAL_STEP.DONE && this.closeTimer > 0) {
            this.closeTimer -= delta;
            if (this.closeTimer <= 0) this.finish();
        }
    }

    destroy() {
        this.finish(true);
    }
}
