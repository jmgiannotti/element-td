import { FUSION_MAP, TOWER_DATA } from '../data/TowerData.js';
import { TEMPLE_DATA } from '../data/TempleData.js';
import { Tower } from '../entities/Tower.js';
import { Temple } from '../entities/Temple.js';

/**
 * Offers a fusion whenever two compatible structures of the same kind end up
 * adjacent. Towers and temples fuse by the exact same elemental rules, so the
 * logic is shared and only the list it operates on differs.
 *
 * Every available pair gets its own badge, and they persist until taken. An
 * earlier version showed one badge at a time, so laying out three fusable
 * pairs before committing to any of them silently dropped the first two.
 */
export class FusionSystem {
    constructor(scene) {
        this.scene = scene;
        this.indicators = [];
    }

    /**
     * Recompute every offer on the board. Cheap enough to call on any change:
     * the lists are a handful of buildings, and rebuilding from scratch means
     * a badge can never outlive the pair that justified it.
     */
    refresh() {
        this.clearIndicators();
        this._offerAll(this.scene.temples, 'temple');
        this._offerAll(this.scene.towers, 'tower');
    }

    _offerAll(list, kind) {
        // A building can only fuse once, so claiming it for one pair takes it
        // out of the running for every other.
        const paired = new Set();

        for (const b of list) {
            if (!b.alive || b.isHybrid || paired.has(b)) continue;

            for (const cell of this.scene.gridSystem.getAdjacentCells(b.col, b.row)) {
                const neighbor = list.find(
                    o => o !== b && o.col === cell.col && o.row === cell.row
                        && o.alive && !o.isHybrid && !paired.has(o)
                );
                if (!neighbor) continue;

                // Sort element names so the lookup key is deterministic
                const result = FUSION_MAP[[b.element, neighbor.element].sort().join('+')];
                if (!result) continue;

                this._showIndicator(b, neighbor, result, kind);
                paired.add(b);
                paired.add(neighbor);
                break;
            }
        }
    }

    _showIndicator(b1, b2, resultElement, kind) {
        const midX = (b1.x + b2.x) / 2;
        const midY = (b1.y + b2.y) / 2;
        const data = kind === 'temple' ? TEMPLE_DATA[resultElement] : TOWER_DATA[resultElement];
        const label = kind === 'temple' ? `¡Templo ${data.shortName}!` : `¡${data.name}!`;

        // Small badge on the seam between the pair — a large disc here used to
        // bury both buildings underneath it.
        const circle = this.scene.add.circle(midX, midY, 7, data.color, 0.95);
        circle.setStrokeStyle(2, 0xFFD700);
        circle.setDepth(25);
        circle.setInteractive({ useHandCursor: true });
        circle.setData('uiBlocker', true);

        // Pulse
        this.scene.tweens.add({
            targets: circle,
            scaleX: 1.25,
            scaleY: 1.25,
            alpha: 0.6,
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        const text = this.scene.add.text(midX, midY - 22, label, {
            fontFamily: '"Press Start 2P"',
            fontSize: '8px',
            color: '#FFD700',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(26);

        // Highlight source buildings
        b1.setFusionHint(true);
        b2.setFusionHint(true);

        // Hovering the badge asks the question the badge implies: what do I get?
        // Answered by UIScene, which owns every tooltip on screen — this only
        // hands over the pair and lets it do the comparison.
        circle.on('pointerover', () => this.scene.events.emit('fusion-hover', {
            b1, b2, result: resultElement, kind, x: midX, y: midY,
        }));
        circle.on('pointerout', () => this.scene.events.emit('fusion-hover', null));

        // On click → fuse. The badge sits on the seam between the two tiles, so
        // while the sell cursor is armed it has to yield: a click there is
        // aimed at demolishing one of the pair, not at merging them.
        circle.on('pointerdown', (pointer) => {
            pointer.event.stopPropagation();
            if (this.scene.sellMode) return;
            this._executeFusion(b1, b2, resultElement, kind);
        });

        this.indicators.push({ circle, label: text, t1: b1, t2: b2 });
    }

    _executeFusion(b1, b2, resultElement, kind) {
        const col = b1.col;
        const row = b1.row;
        // The hybrid inherits both bills, so selling it later returns a cut of
        // everything that went into it rather than of a list price it never had.
        const paid = (b1.paidCost ?? 0) + (b2.paidCost ?? 0);

        b1.destroy();
        b2.destroy();

        if (kind === 'temple') {
            this.scene.temples = this.scene.temples.filter(t => t !== b1 && t !== b2);
            this.scene.occupiedCells.delete(`${b2.col},${b2.row}`);
            this.scene.temples.push(new Temple(this.scene, col, row, resultElement, paid));
        } else {
            this.scene.towers = this.scene.towers.filter(t => t !== b1 && t !== b2);
            this.scene.occupiedCells.delete(`${b2.col},${b2.row}`);
            this.scene.towers.push(new Tower(this.scene, col, row, resultElement, paid));
        }

        // VFX – expanding flash
        const pos = this.scene.gridSystem.gridToWorld(col, row);
        const flash = this.scene.add.circle(pos.x, pos.y, 10, 0xFFD700, 0.9);
        flash.setDepth(30);
        this.scene.tweens.add({
            targets: flash,
            radius: 60,
            scaleX: 3,
            scaleY: 3,
            alpha: 0,
            duration: 400,
            ease: 'Quad.easeOut',
            onComplete: () => flash.destroy(),
        });

        // Taking one pair can create or invalidate others — the hybrid that
        // just appeared cannot fuse again, and its partner's tile is now free.
        this.refresh();
        this.scene.events.emit('fusion-complete', resultElement, kind);
    }

    clearIndicators() {
        // Taking a fusion destroys the badge the cursor was over, and no
        // pointerout ever fires for an object that stopped existing — so the
        // answer has to be withdrawn explicitly or it hangs there forever.
        if (this.indicators.length > 0) this.scene.events.emit('fusion-hover', null);

        for (const ind of this.indicators) {
            ind.circle.destroy();
            ind.label.destroy();
            if (ind.t1.alive) ind.t1.setFusionHint(false);
            if (ind.t2.alive) ind.t2.setFusionHint(false);
        }
        this.indicators = [];
    }
}
