import * as Phaser from 'phaser';
import { pointerWorld } from './Viewport.js';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE } from './GridSystem.js';
import { isJoystickEnabled } from './OptionsModal.js';

const JOYSTICK_BASE_RADIUS = 36;
const JOYSTICK_STICK_RADIUS = 16;
const JOYSTICK_MAX_DIST = 42;

export class TouchControls {
    constructor(scene) {
        this.scene = scene;
        this.enabled = true;
        this.joystickEnabled = isJoystickEnabled();

        // Joystick state
        this.joystickActive = false;
        this.joystickPointerId = null;
        this.joystickOrigin = { x: 0, y: 0 };
        this.joystickCurrent = { x: 0, y: 0 };
        this.joystickVector = { x: 0, y: 0 };
        this.joystickForce = 0; // 0 to 1

        // Drag & Drop placement state
        this.isDraggingStructure = false;
        this.draggedKind = null;     // 'tower', 'temple', 'barricade'
        this.draggedElement = null;  // 'water', 'fire', etc.

        // Graphics & UI containers
        this.joystickBase = null;
        this.joystickStick = null;

        this._createGraphics();
        this._setupListeners();
    }

    _createGraphics() {
        const scene = this.scene;

        // Base circle of virtual joystick
        this.joystickBase = scene.add.circle(0, 0, JOYSTICK_BASE_RADIUS, 0x1e1e3a, 0.45)
            .setStrokeStyle(2, 0xB388FF, 0.7)
            .setDepth(80)
            .setVisible(false);

        // Stick/knob of virtual joystick
        this.joystickStick = scene.add.circle(0, 0, JOYSTICK_STICK_RADIUS, 0xB388FF, 0.85)
            .setStrokeStyle(1.5, 0xFFFFFF, 0.9)
            .setDepth(81)
            .setVisible(false);
    }

    _setupListeners() {
        // Destination ripples on hero tap-to-move
        this.scene.events.on('hero-destination-set', (x, y) => {
            this.showDestinationMarker(x, y);
        });
    }

    /**
     * Shows an animated magical ripple at the destination point when tapped.
     */
    showDestinationMarker(x, y) {
        const scene = this.scene;
        const color = 0xB388FF;

        // Outer expanding ring
        const ring = scene.add.circle(x, y, 6, color, 0)
            .setStrokeStyle(1.5, color, 0.9)
            .setDepth(18);

        // Inner glowing diamond / dot
        const dot = scene.add.circle(x, y, 2.5, 0xFFD54F, 0.9)
            .setDepth(19);

        scene.tweens.add({
            targets: ring,
            radius: 20,
            alpha: 0,
            duration: 480,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
        });

        scene.tweens.add({
            targets: dot,
            alpha: 0,
            scaleX: 1.8,
            scaleY: 1.8,
            duration: 400,
            ease: 'Sine.easeOut',
            onComplete: () => dot.destroy(),
        });
    }

    /**
     * Start virtual joystick on pointer down
     */
    startJoystick(pointer, worldPos) {
        if (!this.joystickEnabled || this.joystickActive) return false;
        if (worldPos.x >= GAME_WIDTH) return false;

        this.joystickActive = true;
        this.joystickPointerId = pointer.id;
        this.joystickOrigin = { x: worldPos.x, y: worldPos.y };
        this.joystickCurrent = { x: worldPos.x, y: worldPos.y };
        this.joystickVector = { x: 0, y: 0 };
        this.joystickForce = 0;

        this.joystickBase.setPosition(worldPos.x, worldPos.y).setVisible(true);
        this.joystickStick.setPosition(worldPos.x, worldPos.y).setVisible(true);
        return true;
    }

    /**
     * Update virtual joystick position
     */
    updateJoystick(pointer, worldPos) {
        if (!this.joystickActive || pointer.id !== this.joystickPointerId) return;

        const dx = worldPos.x - this.joystickOrigin.x;
        const dy = worldPos.y - this.joystickOrigin.y;
        const dist = Math.hypot(dx, dy);

        if (dist === 0) {
            this.joystickVector = { x: 0, y: 0 };
            this.joystickForce = 0;
            this.joystickStick.setPosition(this.joystickOrigin.x, this.joystickOrigin.y);
            return;
        }

        const clampedDist = Math.min(dist, JOYSTICK_MAX_DIST);
        const normX = dx / dist;
        const normY = dy / dist;

        this.joystickVector = { x: normX, y: normY };
        this.joystickForce = clampedDist / JOYSTICK_MAX_DIST;

        this.joystickStick.setPosition(
            this.joystickOrigin.x + normX * clampedDist,
            this.joystickOrigin.y + normY * clampedDist
        );
    }

    /**
     * Release virtual joystick
     */
    stopJoystick(pointer) {
        if (!this.joystickActive) return;
        if (pointer && pointer.id !== this.joystickPointerId) return;

        this.joystickActive = false;
        this.joystickPointerId = null;
        this.joystickVector = { x: 0, y: 0 };
        this.joystickForce = 0;

        this.joystickBase.setVisible(false);
        this.joystickStick.setVisible(false);
    }

    /**
     * Start drag & drop structure placement from sidebar
     */
    startDragStructure(kind, element) {
        this.isDraggingStructure = true;
        this.draggedKind = kind;
        this.draggedElement = element;
    }

    /**
     * Finish or cancel drag & drop structure placement
     */
    stopDragStructure() {
        this.isDraggingStructure = false;
        this.draggedKind = null;
        this.draggedElement = null;
    }

    /**
     * Update hero steering each frame if joystick is active
     */
    update(delta) {
        if (this.joystickActive && this.joystickForce > 0.15) {
            const hero = this.scene.hero;
            if (hero && hero.steer) {
                hero.steer(this.joystickVector.x, this.joystickVector.y, this.joystickForce, delta);
            }
        }
    }

    destroy() {
        if (this.joystickBase) this.joystickBase.destroy();
        if (this.joystickStick) this.joystickStick.destroy();
    }
}
