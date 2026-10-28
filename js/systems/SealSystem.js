import { SEAL_BONUS, sealMatches } from '../data/SealData.js';
import { TOWER_DATA } from '../data/TowerData.js';
import { safeTexture } from './TextureGuard.js';

// Above the ground and the build grid, under the boulders and everything that
// stands on a tile.
const D_SEAL = 0.4;

/**
 * The seals on the board: where they are, what each one grants, and what they
 * look like in each state. The art is in BootScene._generateSeals.
 *
 *   empty           a cluster of three crystals and a dotted frame; the
 *                   lawn under them stays clean
 *   tower in hand   the same, pulsing, on every seal that tower could use
 *   matching tower  the cluster goes (it would fight the pedestal) and the
 *                   tile gets a lit frame, four corner crystals and a pulse of
 *                   light under the tower's base — the bonus is never invisible
 *   wrong tower     only the dotted frame, dimmed: a seal built over by
 *                   accident reads as wasted
 */
export class SealSystem {
    constructor(scene, levelData) {
        this.scene = scene;
        /** 'c,r' → { element, col, row, cluster, frame, on, halo, active } */
        this.seals = new Map();
        this._highlight = null;
        this._phase = 0;

        for (const s of levelData.seals || []) {
            if (!SEAL_BONUS[s.element]) continue;
            // A seal is set into buildable ground; one on the road would be a
            // bonus nobody can ever take.
            if (!scene.gridSystem.canBuildTower(s.col, s.row)) continue;
            this._place(s.col, s.row, s.element);
        }
    }

    _place(col, row, element) {
        const scene = this.scene;
        const pos = scene.gridSystem.gridToWorld(col, row);
        const layer = (suffix) => scene.add
            .image(pos.x, pos.y, safeTexture(scene, `seal_${element}${suffix}`, 'grass_0'))
            .setDepth(D_SEAL);

        this.seals.set(`${col},${row}`, {
            element, col, row,
            frame: layer('_frame'),
            cluster: layer(''),
            halo: layer('_halo').setVisible(false),
            on: layer('_on').setVisible(false),
            active: false,
        });
    }

    at(col, row) {
        return this.seals.get(`${col},${row}`) ?? null;
    }

    /**
     * What standing on (col, row) is worth to a tower of `element`, for one
     * stat. 1 almost everywhere.
     */
    multiplier(col, row, element, stat) {
        const seal = this.at(col, row);
        if (!seal || !sealMatches(seal.element, element)) return 1;
        const b = SEAL_BONUS[seal.element];
        return b.stat === stat ? b.mult : 1;
    }

    /** The bonus line for a tower of `element` on this cell, or null. */
    bonusLabel(col, row, element) {
        const seal = this.at(col, row);
        if (!seal || !sealMatches(seal.element, element)) return null;
        return `Sello de ${TOWER_DATA[seal.element].name}: ${SEAL_BONUS[seal.element].label}`;
    }

    /** The tower element in hand, or null. Matching seals pulse while it is set. */
    setHighlight(element) {
        this._highlight = element && TOWER_DATA[element] ? element : null;
    }

    update(delta) {
        if (this.seals.size === 0) return;
        this._phase += delta * 0.004;
        const pulse = 0.5 + 0.5 * Math.sin(this._phase);
        const towers = this.scene.towers;

        for (const seal of this.seals.values()) {
            const tower = towers.find(t => t.alive && t.col === seal.col && t.row === seal.row);
            seal.active = !!tower && sealMatches(seal.element, tower.element);
            const lit = !tower && this._highlight && sealMatches(seal.element, this._highlight);

            seal.cluster.setVisible(!tower);
            seal.frame.setVisible(!seal.active);
            seal.on.setVisible(seal.active);
            seal.halo.setVisible(seal.active);

            if (seal.active) {
                seal.halo.setAlpha(0.55 + 0.45 * pulse);
            } else if (tower) {
                seal.frame.setAlpha(0.35);
            } else {
                const a = lit ? 0.55 + 0.45 * pulse : 1;
                seal.frame.setAlpha(lit ? a : 0.7);
                seal.cluster.setAlpha(a);
            }
        }
    }

    destroy() {
        for (const s of this.seals.values()) {
            s.frame.destroy();
            s.cluster.destroy();
            s.halo.destroy();
            s.on.destroy();
        }
        this.seals.clear();
    }
}
